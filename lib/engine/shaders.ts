// ============================================================
// Bokeh Studio — GPU Shader Library
// Every shader is written from scratch, production-quality.
// ============================================================

// ----------------------------------------------------------
// PASS 1: Depth-aware CoC (Circle of Confusion) computation
// Maps a depth map + lens params → per-pixel blur radius
// Based on thin-lens equation: CoC = A * |d - f| / d
// ----------------------------------------------------------
export const COC_SHADER = /* wgsl */`
struct LensParams {
  focalDistance: f32,   // normalized depth of focus plane [0,1]
  focalRange:    f32,   // depth of field half-width
  aperture:      f32,   // f/stop mapped to max blur pixels
  imageWidth:    f32,
  imageHeight:   f32,
  bokehBoost:    f32,   // highlight intensity multiplier
  catEye:        f32,   // cat-eye vignette strength [0,1]
  chromaticAb:   f32,   // chromatic aberration amount
};

@group(0) @binding(0) var<uniform> lens: LensParams;
@group(0) @binding(1) var depthTex:  texture_2d<f32>;
@group(0) @binding(2) var colorTex:  texture_2d<f32>;
@group(0) @binding(3) var cocOut:    texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var nearOut:   texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var farOut:    texture_storage_2d<rgba16float, write>;

// Thin-lens CoC model
fn computeCoC(depth: f32) -> f32 {
  let eps = 0.0001;
  let d = max(depth, eps);
  let fd = max(lens.focalDistance, eps);
  
  // CoC = aperture * |depth - focalDistance| / depth
  // With soft transition inside focal range
  let delta = abs(d - fd);
  let softDelta = max(0.0, delta - lens.focalRange);
  let rawCoC = lens.aperture * softDelta / d;
  
  // Sign: positive = far field, negative = near field
  let sign = select(-1.0, 1.0, d >= fd);
  return sign * min(rawCoC, lens.aperture);
}

// Cat-eye vignette: bokeh circles become elliptical at edges
fn catEyeFactor(uv: vec2f, coc: f32) -> f32 {
  if (lens.catEye < 0.001) { return 1.0; }
  let center = vec2f(0.5, 0.5);
  let offset = (uv - center) * vec2f(lens.imageWidth / lens.imageHeight, 1.0);
  let dist = length(offset);
  let vignetteStrength = lens.catEye * dist * 2.0;
  return max(0.2, 1.0 - vignetteStrength * abs(coc) / lens.aperture);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = vec2i(gid.xy);
  let dims = textureDimensions(depthTex);
  if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) { return; }
  
  let uv = (vec2f(coord) + 0.5) / vec2f(dims);
  let depth = textureLoad(depthTex, coord, 0).r;
  let color = textureLoad(colorTex, coord, 0);
  
  let coc = computeCoC(depth);
  let catFactor = catEyeFactor(uv, coc);
  let adjustedCoC = coc * catFactor;
  
  // Highlight bloom: boost bright pixels
  let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let bloom = max(0.0, luma - 0.85) * lens.bokehBoost * 3.0;
  let boostedColor = color.rgb * (1.0 + bloom);
  
  // Pack: CoC in alpha channel, boosted color in rgb
  textureStore(cocOut, coord, vec4f(boostedColor, adjustedCoC));
  
  // Split into near/far fields for correct occlusion
  if (adjustedCoC < 0.0) {
    // Near field (in front of focus): bleeds over background
    textureStore(nearOut, coord, vec4f(boostedColor, abs(adjustedCoC)));
    textureStore(farOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
  } else {
    textureStore(nearOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    textureStore(farOut, coord, vec4f(boostedColor, adjustedCoC));
  }
}
`;

// ----------------------------------------------------------
// PASS 2: Variable-radius gather bokeh kernel
// Physically-accurate aperture shape simulation
// Supports: circular, hexagonal, anamorphic, custom N-blade
// ----------------------------------------------------------
export const BOKEH_GATHER_SHADER = /* wgsl */`
struct BokehParams {
  maxRadius:     f32,
  bladeCount:    f32,   // aperture blades (0 = perfect circle)
  bladeRotation: f32,   // blade rotation in radians
  anamorphic:    f32,   // anamorphic squeeze ratio (1.0 = none)
  pass:          u32,   // 0=far field, 1=near field
  imageWidth:    f32,
  imageHeight:   f32,
  sampleCount:   u32,
};

@group(0) @binding(0) var<uniform> params: BokehParams;
@group(0) @binding(1) var srcTex:   texture_2d<f32>;
@group(0) @binding(2) var cocTex:   texture_2d<f32>;  // full CoC map
@group(0) @binding(3) var outTex:   texture_storage_2d<rgba16float, write>;

const PI = 3.14159265359;
const TAU = 6.28318530718;

// Aperture shape: returns 1.0 if sample point is inside aperture
fn insideAperture(p: vec2f) -> f32 {
  let r = length(p);
  if (r < 0.0001) { return 1.0; }

  let blades = params.bladeCount;

  // ---- Circle (blades == 0) ----
  if (blades < 3.0) {
    return select(0.0, 1.0, r <= 1.0);
  }

  // ---- Star (blades == 10 special-cased) ----
  // Modelled as a 5-point star: outer radius 1.0, inner radius 0.45
  if (blades >= 9.5 && blades <= 10.5) {
    let angle = atan2(p.y, p.x) + params.bladeRotation;
    let sector = TAU / 10.0;                       // 5 outer + 5 inner points
    let localAngle = ((angle % sector) + sector) % sector;
    let halfSector = sector * 0.5;
    // interpolate between outer (1.0) and inner (0.45) radii
    let t = abs(localAngle - halfSector) / halfSector; // 0 at inner tip, 1 at outer tip
    let starRadius = mix(0.45, 1.0, t);
    return select(0.0, 1.0, r <= starRadius);
  }

  // ---- Regular N-gon (pentagon=5, hex=6, octagon=8) ----
  // Standard polygon containment: r <= cos(π/n) / cos(θ mod (2π/n) - π/n)
  let n = blades;
  let angle = atan2(p.y, p.x) + params.bladeRotation;
  let sector = TAU / n;
  // Map angle into [0, sector)
  let localAngle = ((angle % sector) + sector) % sector;
  // Distance from sector midline
  let delta = localAngle - sector * 0.5;
  // Polygon radius at this angle (apothem / cos(delta))
  let apothem = cos(PI / n);
  let polyRadius = apothem / cos(delta);
  return select(0.0, 1.0, r <= polyRadius);
}

// Vogel disk sampling — perceptually uniform, no visible rings
fn vogelSample(i: u32, total: u32, offset: f32) -> vec2f {
  let golden = 2.399963; // golden angle
  let r = sqrt(f32(i) / f32(total));
  let theta = f32(i) * golden + offset;
  return vec2f(r * cos(theta), r * sin(theta));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = vec2i(gid.xy);
  let dims = textureDimensions(srcTex);
  if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) { return; }
  
  let uv = (vec2f(coord) + 0.5) / vec2f(f32(dims.x), f32(dims.y));
  let centerSample = textureLoad(srcTex, coord, 0);
  let centerCoC = textureLoad(cocTex, coord, 0).a;
  
  var accumColor = vec4f(0.0);
  var accumWeight = 0.0;
  
  let maxR = params.maxRadius;
  let texelSize = vec2f(1.0 / f32(dims.x), 1.0 / f32(dims.y));
  
  // Anamorphic bokeh: stretch horizontally like anamorphic lenses
  let anamorphicScale = vec2f(params.anamorphic, 1.0);
  
  for (var i = 0u; i < params.sampleCount; i++) {
    let disk = vogelSample(i, params.sampleCount, 0.618);
    
    // Check if sample is inside aperture shape
    let apertureCheck = insideAperture(disk);
    if (apertureCheck < 0.5) { continue; }
    
    // Scale by center CoC radius
    let sampleOffset = disk * anamorphicScale * abs(centerCoC) * texelSize;
    let sampleUV = uv + sampleOffset;
    
    // Boundary check
    if (any(sampleUV < vec2f(0.0)) || any(sampleUV > vec2f(1.0))) { continue; }
    
    let sampleCoord = vec2i(sampleUV * vec2f(f32(dims.x), f32(dims.y)));
    let sample = textureLoad(srcTex, sampleCoord, 0);
    let sampleCoC = textureLoad(cocTex, sampleCoord, 0).a;
    
    // Visibility test: far-field sample only contributes if its CoC
    // is large enough to reach the current pixel
    var contribution = 1.0;
    if (params.pass == 0u) {
      // Far field: sample must have enough CoC to blur outward
      contribution = select(0.1, 1.0, sampleCoC >= length(disk) * abs(centerCoC));
    }
    
    let weight = apertureCheck * contribution;
    accumColor += sample * weight;
    accumWeight += weight;
  }
  
  if (accumWeight > 0.001) {
    textureStore(outTex, coord, accumColor / accumWeight);
  } else {
    textureStore(outTex, coord, centerSample);
  }
}
`;

// ----------------------------------------------------------
// PASS 3: Near-field dilation
// Near-field bokeh bleeds over sharp background objects.
// We dilate the near CoC mask to handle this physically.
// ----------------------------------------------------------
export const NEAR_FIELD_DILATE_SHADER = /* wgsl */`
struct Params {
  radius: f32,
  imageWidth: f32,
  imageHeight: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var nearTex: texture_2d<f32>;
@group(0) @binding(2) var outTex:  texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = vec2i(gid.xy);
  let dims = textureDimensions(nearTex);
  if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) { return; }
  
  var maxAlpha = 0.0;
  var bestColor = vec3f(0.0);
  let r = i32(params.radius);
  
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let sCoord = coord + vec2i(dx, dy);
      if (sCoord.x < 0 || sCoord.y < 0 || sCoord.x >= i32(dims.x) || sCoord.y >= i32(dims.y)) { continue; }
      
      let s = textureLoad(nearTex, sCoord, 0);
      if (s.a > maxAlpha) {
        maxAlpha = s.a;
        bestColor = s.rgb;
      }
    }
  }
  
  textureStore(outTex, coord, vec4f(bestColor, maxAlpha));
}
`;

// ----------------------------------------------------------
// PASS 4: Edge-aware composite
// Combines far blur + near blur + sharp center using depth.
// Uses depth-guided alpha blending to avoid halo artifacts.
// ----------------------------------------------------------
export const COMPOSITE_SHADER = /* wgsl */`
struct CompositeParams {
  nearStrength:  f32,
  farStrength:   f32,
  edgeSoftness:  f32,
  vignetteStrength: f32,
  vignetteFeather:  f32,
  imageWidth:    f32,
  imageHeight:   f32,
};

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var sharpTex:  texture_2d<f32>;
@group(0) @binding(2) var farTex:    texture_2d<f32>;
@group(0) @binding(3) var nearTex:   texture_2d<f32>;
@group(0) @binding(4) var cocTex:    texture_2d<f32>;
@group(0) @binding(5) var outTex:    texture_storage_2d<rgba8unorm, write>;

// Smooth step with configurable softness
fn smoothBlend(coc: f32, softness: f32) -> f32 {
  return smoothstep(0.0, max(softness, 0.001), abs(coc));
}

// Lens vignette
fn vignette(uv: vec2f) -> f32 {
  if (params.vignetteStrength < 0.001) { return 1.0; }
  let d = length((uv - 0.5) * 2.0);
  let inner = 1.0 - params.vignetteStrength;
  let outer = inner + params.vignetteFeather;
  return 1.0 - smoothstep(inner, outer, d) * params.vignetteStrength;
}

// ACES filmic tonemapping
fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = vec2i(gid.xy);
  let dims = textureDimensions(sharpTex);
  if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) { return; }
  
  let uv = (vec2f(coord) + 0.5) / vec2f(f32(dims.x), f32(dims.y));
  let sharp  = textureLoad(sharpTex, coord, 0);
  let far    = textureLoad(farTex,   coord, 0);
  let near   = textureLoad(nearTex,  coord, 0);
  let cocVal = textureLoad(cocTex,   coord, 0).a;
  
  // Far field blend (background blur)
  let farBlend  = smoothBlend(max(0.0, cocVal),  params.edgeSoftness) * params.farStrength;
  var result = mix(sharp.rgb, far.rgb, clamp(farBlend, 0.0, 1.0));
  
  // Near field blend (foreground blur — bleeds over)
  let nearBlend = near.a * params.nearStrength;
  result = mix(result, near.rgb, clamp(nearBlend, 0.0, 1.0));
  
  // Apply vignette
  result *= vignette(uv);
  
  // Tonemap highlights (needed for boosted bokeh balls)
  result = aces(result);
  
  // Gamma correct
  result = pow(max(result, vec3f(0.0)), vec3f(1.0 / 2.2));
  
  textureStore(outTex, coord, vec4f(result, 1.0));
}
`;

// ----------------------------------------------------------
// PASS 5: Chromatic Aberration
// Splits RGB channels at different blur radii — refractive
// dispersion. Red shifts outward, blue inward.
// ----------------------------------------------------------
export const CHROMATIC_AB_SHADER = /* wgsl */`
struct ChromaParams {
  strength: f32,
  imageWidth: f32,
  imageHeight: f32,
};

@group(0) @binding(0) var<uniform> params: ChromaParams;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var cocTex: texture_2d<f32>;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let coord = vec2i(gid.xy);
  let dims = textureDimensions(srcTex);
  if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) { return; }
  
  if (params.strength < 0.001) {
    let s = textureLoad(srcTex, coord, 0);
    textureStore(outTex, coord, s);
    return;
  }
  
  let uv = (vec2f(coord) + 0.5) / vec2f(f32(dims.x), f32(dims.y));
  let center = vec2f(0.5);
  let dir = normalize(uv - center + vec2f(0.0001));
  let coc = abs(textureLoad(cocTex, coord, 0).a);
  
  let shift = dir * params.strength * coc * 0.003;
  
  let uvR = clamp(uv + shift * 1.0, vec2f(0.0), vec2f(1.0));
  let uvG = uv;
  let uvB = clamp(uv - shift * 0.6, vec2f(0.0), vec2f(1.0));
  
  let cR = vec2i(uvR * vec2f(f32(dims.x), f32(dims.y)));
  let cG = coord;
  let cB = vec2i(uvB * vec2f(f32(dims.x), f32(dims.y)));
  
  let r = textureLoad(srcTex, cR, 0).r;
  let g = textureLoad(srcTex, cG, 0).g;
  let b = textureLoad(srcTex, cB, 0).b;
  
  let original = textureLoad(srcTex, coord, 0);
  textureStore(outTex, coord, vec4f(r, g, b, original.a));
}
`;

// Display shader — renders final texture to screen quad
export const DISPLAY_SHADER = /* wgsl */`
struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VertOut {
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0)
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
  );
  var out: VertOut;
  out.pos = vec4f(positions[i], 0.0, 1.0);
  out.uv  = uvs[i];
  return out;
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@fragment
fn fs(in: VertOut) -> @location(0) vec4f {
  return textureSample(tex, smp, in.uv);
}
`;
