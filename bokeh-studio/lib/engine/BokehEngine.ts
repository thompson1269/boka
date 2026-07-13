// ============================================================
// Bokeh Studio — Core Rendering Engine
// WebGPU-based, multi-pass lens blur renderer.
// Architecture mirrors what Apple's Photos.framework does
// internally on Metal — adapted for WebGPU.
// ============================================================

import {
  COC_SHADER,
  BOKEH_GATHER_SHADER,
  NEAR_FIELD_DILATE_SHADER,
  COMPOSITE_SHADER,
  CHROMATIC_AB_SHADER,
  DISPLAY_SHADER,
} from "./shaders";

export interface LensParams {
  focalDistance: number;      // 0–1: normalized depth of focus
  focalRange: number;         // 0–1: depth of field half-width
  aperture: number;           // max blur radius in pixels
  bokehBoost: number;         // highlight enhancement 0–5
  catEye: number;             // cat-eye vignette 0–1
  chromaticAb: number;        // chromatic aberration 0–1
  apertureShape: number;      // 0=circle, 3-12=polygon blades
  bladeRotation: number;      // degrees
  anamorphic: number;         // anamorphic squeeze 1–3
  nearStrength: number;       // near-field blend 0–1
  farStrength: number;        // far-field blend 0–1
  vignette: number;           // vignette 0–1
  vignetteFeather: number;    // vignette feather
}

export const DEFAULT_LENS_PARAMS: LensParams = {
  focalDistance: 0.5,
  focalRange: 0.05,
  aperture: 32,
  bokehBoost: 1.5,
  catEye: 0.3,
  chromaticAb: 0.2,
  apertureShape: 0,
  bladeRotation: 0,
  anamorphic: 1.0,
  nearStrength: 1.0,
  farStrength: 1.0,
  vignette: 0.3,
  vignetteFeather: 0.4,
};

export type EngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "rendering"
  | "error";

export type EngineStatusCallback = (status: EngineStatus, progress?: number) => void;

export class BokehEngine {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private format!: GPUTextureFormat;

  // Source textures
  private colorTexture!: GPUTexture;
  private depthTexture!: GPUTexture;

  // Intermediate render targets
  private cocTexture!: GPUTexture;        // CoC + boosted color
  private nearRaw!: GPUTexture;           // raw near field
  private farRaw!: GPUTexture;            // raw far field
  private nearBlurred!: GPUTexture;       // near after gather
  private farBlurred!: GPUTexture;        // far after gather
  private nearDilated!: GPUTexture;       // near after dilation
  private composited!: GPUTexture;        // final composite
  private finalOutput!: GPUTexture;       // after chromatic ab

  // Pipelines
  private cocPipeline!: GPUComputePipeline;
  private gatherFarPipeline!: GPUComputePipeline;
  private gatherNearPipeline!: GPUComputePipeline;
  private dilatePipeline!: GPUComputePipeline;
  private compositePipeline!: GPUComputePipeline;
  private chromaticPipeline!: GPUComputePipeline;
  private displayPipeline!: GPURenderPipeline;

  // Uniform buffers
  private lensUniformBuffer!: GPUBuffer;
  private bokehFarUniformBuffer!: GPUBuffer;
  private bokehNearUniformBuffer!: GPUBuffer;
  private dilateUniformBuffer!: GPUBuffer;
  private compositeUniformBuffer!: GPUBuffer;
  private chromaticUniformBuffer!: GPUBuffer;

  private displaySampler!: GPUSampler;
  private width = 0;
  private height = 0;
  private initialized = false;
  private onStatus: EngineStatusCallback;

  constructor(canvas: HTMLCanvasElement, onStatus: EngineStatusCallback) {
    this.canvas = canvas;
    this.onStatus = onStatus;
  }

  async init(): Promise<boolean> {
    this.onStatus("initializing");
    try {
      if (!navigator.gpu) {
        console.warn("WebGPU not available, falling back to Canvas2D");
        this.onStatus("error");
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance",
      });
      if (!adapter) throw new Error("No GPU adapter found");

      this.device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {
          maxStorageTexturesPerShaderStage: 6,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
        },
      });

      this.device.lost.then((info) => {
        console.error("GPU device lost:", info.message);
        this.onStatus("error");
      });

      this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
      this.format = navigator.gpu.getPreferredCanvasFormat();

      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "premultiplied",
      });

      await this.createPipelines();

      this.displaySampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });

      this.initialized = true;
      this.onStatus("ready");
      return true;
    } catch (e) {
      console.error("Engine init failed:", e);
      this.onStatus("error");
      return false;
    }
  }

  private async createPipelines() {
    const d = this.device;

    // CoC pass
    this.cocPipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: COC_SHADER }), entryPoint: "main" },
    });

    // Bokeh gather — far
    this.gatherFarPipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: BOKEH_GATHER_SHADER }), entryPoint: "main" },
    });

    // Bokeh gather — near (same shader, different pass uniform)
    this.gatherNearPipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: BOKEH_GATHER_SHADER }), entryPoint: "main" },
    });

    // Near dilation
    this.dilatePipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: NEAR_FIELD_DILATE_SHADER }), entryPoint: "main" },
    });

    // Composite
    this.compositePipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: COMPOSITE_SHADER }), entryPoint: "main" },
    });

    // Chromatic aberration
    this.chromaticPipeline = d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code: CHROMATIC_AB_SHADER }), entryPoint: "main" },
    });

    // Display render pipeline
    const displayModule = d.createShaderModule({ code: DISPLAY_SHADER });
    this.displayPipeline = d.createRenderPipeline({
      layout: "auto",
      vertex: { module: displayModule, entryPoint: "vs" },
      fragment: {
        module: displayModule,
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  async loadImages(
    colorImageData: ImageData,
    depthImageData: ImageData
  ): Promise<void> {
    if (!this.initialized) return;

    this.width = colorImageData.width;
    this.height = colorImageData.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Reconfigure context with new size
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    this.createTextures();
    await this.uploadTexture(this.colorTexture, colorImageData);
    await this.uploadDepthTexture(this.depthTexture, depthImageData);
    this.createUniformBuffers();
  }

  private createTextures() {
    const d = this.device;
    const w = this.width;
    const h = this.height;

    const destroyIfExists = (t: GPUTexture | undefined) => t?.destroy();

    destroyIfExists(this.colorTexture);
    destroyIfExists(this.depthTexture);
    destroyIfExists(this.cocTexture);
    destroyIfExists(this.nearRaw);
    destroyIfExists(this.farRaw);
    destroyIfExists(this.nearBlurred);
    destroyIfExists(this.farBlurred);
    destroyIfExists(this.nearDilated);
    destroyIfExists(this.composited);
    destroyIfExists(this.finalOutput);

    const texDesc = (format: GPUTextureFormat, usage: GPUTextureUsageFlags) => ({
      size: { width: w, height: h, depthOrArrayLayers: 1 } as GPUExtent3DDict,
      format,
      usage,
    });

    const SAMPLE = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    const STORAGE = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
    const DISPLAY = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;

    this.colorTexture  = d.createTexture({ ...texDesc("rgba8unorm", SAMPLE | GPUTextureUsage.COPY_SRC), });
    this.depthTexture  = d.createTexture({ ...texDesc("r8unorm", SAMPLE), });
    this.cocTexture    = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.nearRaw       = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.farRaw        = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.nearBlurred   = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.farBlurred    = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.nearDilated   = d.createTexture({ ...texDesc("rgba16float", STORAGE), });
    this.composited    = d.createTexture({ ...texDesc("rgba8unorm", STORAGE), });
    this.finalOutput   = d.createTexture({ ...texDesc("rgba8unorm", DISPLAY), });
  }

  private async uploadTexture(texture: GPUTexture, imageData: ImageData) {
    this.device.queue.writeTexture(
      { texture },
      imageData.data,
      { bytesPerRow: imageData.width * 4 },
      [imageData.width, imageData.height]
    );
  }

  private async uploadDepthTexture(texture: GPUTexture, depthData: ImageData) {
    // Extract single channel (R) from RGBA depth image
    const single = new Uint8Array(depthData.width * depthData.height);
    for (let i = 0; i < single.length; i++) {
      single[i] = depthData.data[i * 4]; // R channel
    }
    this.device.queue.writeTexture(
      { texture },
      single,
      { bytesPerRow: depthData.width },
      [depthData.width, depthData.height]
    );
  }

  private createUniformBuffers() {
    const d = this.device;
    const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

    this.lensUniformBuffer       = d.createBuffer({ size: 64, usage });
    this.bokehFarUniformBuffer   = d.createBuffer({ size: 64, usage });
    this.bokehNearUniformBuffer  = d.createBuffer({ size: 64, usage });
    this.dilateUniformBuffer     = d.createBuffer({ size: 32, usage });
    this.compositeUniformBuffer  = d.createBuffer({ size: 64, usage });
    this.chromaticUniformBuffer  = d.createBuffer({ size: 32, usage });
  }

  private writeLensUniforms(p: LensParams) {
    const data = new Float32Array(16);
    data[0] = p.focalDistance;
    data[1] = p.focalRange;
    data[2] = p.aperture;
    data[3] = this.width;
    data[4] = this.height;
    data[5] = p.bokehBoost;
    data[6] = p.catEye;
    data[7] = p.chromaticAb;
    this.device.queue.writeBuffer(this.lensUniformBuffer, 0, data);
  }

  private writeBokehUniforms(
    buf: GPUBuffer,
    p: LensParams,
    pass: 0 | 1,
    sampleCount: number
  ) {
    const data = new Float32Array(8);
    const u32 = new Uint32Array(data.buffer);
    data[0] = p.aperture;
    data[1] = p.apertureShape;
    data[2] = (p.bladeRotation * Math.PI) / 180;
    data[3] = p.anamorphic;
    u32[4] = pass;
    data[5] = this.width;
    data[6] = this.height;
    u32[7] = sampleCount;
    this.device.queue.writeBuffer(buf, 0, data);
  }

  private writeDilateUniforms(radius: number) {
    const data = new Float32Array(4);
    data[0] = radius;
    data[1] = this.width;
    data[2] = this.height;
    this.device.queue.writeBuffer(this.dilateUniformBuffer, 0, data);
  }

  private writeCompositeUniforms(p: LensParams) {
    const data = new Float32Array(8);
    data[0] = p.nearStrength;
    data[1] = p.farStrength;
    data[2] = 0.5; // edge softness
    data[3] = p.vignette;
    data[4] = p.vignetteFeather;
    data[5] = this.width;
    data[6] = this.height;
    this.device.queue.writeBuffer(this.compositeUniformBuffer, 0, data);
  }

  private writeChromaticUniforms(p: LensParams) {
    const data = new Float32Array(4);
    data[0] = p.chromaticAb;
    data[1] = this.width;
    data[2] = this.height;
    this.device.queue.writeBuffer(this.chromaticUniformBuffer, 0, data);
  }

  async render(params: LensParams): Promise<void> {
    if (!this.initialized || this.width === 0) return;
    this.onStatus("rendering");

    const d = this.device;
    const W = Math.ceil(this.width / 8);
    const H = Math.ceil(this.height / 8);
    const sampleCount = Math.min(128, Math.max(32, Math.floor(params.aperture * 3)));

    // Write all uniforms
    this.writeLensUniforms(params);
    this.writeBokehUniforms(this.bokehFarUniformBuffer, params, 0, sampleCount);
    this.writeBokehUniforms(this.bokehNearUniformBuffer, params, 1, sampleCount);
    this.writeDilateUniforms(params.aperture * 0.5);
    this.writeCompositeUniforms(params);
    this.writeChromaticUniforms(params);

    const enc = d.createCommandEncoder({ label: "BokehRender" });

    // --- PASS 1: CoC + field splitting ---
    {
      const bg = d.createBindGroup({
        layout: this.cocPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.lensUniformBuffer } },
          { binding: 1, resource: this.depthTexture.createView() },
          { binding: 2, resource: this.colorTexture.createView() },
          { binding: 3, resource: this.cocTexture.createView() },
          { binding: 4, resource: this.nearRaw.createView() },
          { binding: 5, resource: this.farRaw.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "CoC" });
      pass.setPipeline(this.cocPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 2: Far-field gather ---
    {
      const bg = d.createBindGroup({
        layout: this.gatherFarPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bokehFarUniformBuffer } },
          { binding: 1, resource: this.farRaw.createView() },
          { binding: 2, resource: this.cocTexture.createView() },
          { binding: 3, resource: this.farBlurred.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "GatherFar" });
      pass.setPipeline(this.gatherFarPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 3: Near-field gather ---
    {
      const bg = d.createBindGroup({
        layout: this.gatherNearPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bokehNearUniformBuffer } },
          { binding: 1, resource: this.nearRaw.createView() },
          { binding: 2, resource: this.cocTexture.createView() },
          { binding: 3, resource: this.nearBlurred.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "GatherNear" });
      pass.setPipeline(this.gatherNearPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 4: Near-field dilation ---
    {
      const bg = d.createBindGroup({
        layout: this.dilatePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.dilateUniformBuffer } },
          { binding: 1, resource: this.nearBlurred.createView() },
          { binding: 2, resource: this.nearDilated.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "Dilate" });
      pass.setPipeline(this.dilatePipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 5: Composite ---
    {
      const bg = d.createBindGroup({
        layout: this.compositePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
          { binding: 1, resource: this.colorTexture.createView() },
          { binding: 2, resource: this.farBlurred.createView() },
          { binding: 3, resource: this.nearDilated.createView() },
          { binding: 4, resource: this.cocTexture.createView() },
          { binding: 5, resource: this.composited.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "Composite" });
      pass.setPipeline(this.compositePipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 6: Chromatic Aberration ---
    {
      const bg = d.createBindGroup({
        layout: this.chromaticPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.chromaticUniformBuffer } },
          { binding: 1, resource: this.composited.createView() },
          { binding: 2, resource: this.cocTexture.createView() },
          { binding: 3, resource: this.finalOutput.createView() },
        ],
      });
      const pass = enc.beginComputePass({ label: "ChromaticAb" });
      pass.setPipeline(this.chromaticPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(W, H);
      pass.end();
    }

    // --- PASS 7: Display to canvas ---
    {
      const bg = d.createBindGroup({
        layout: this.displayPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.finalOutput.createView() },
          { binding: 1, resource: this.displaySampler },
        ],
      });
      const pass = enc.beginRenderPass({
        label: "Display",
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.setPipeline(this.displayPipeline);
      pass.setBindGroup(0, bg);
      pass.draw(6);
      pass.end();
    }

    d.queue.submit([enc.finish()]);
    await d.queue.onSubmittedWorkDone();
    this.onStatus("ready");
  }

  /** Get CoC map as ImageData for depth visualization overlay */
  async getCoCImageData(): Promise<ImageData | null> {
    if (!this.initialized || this.width === 0) return null;
    // Read back composited texture
    const byteSize = this.width * this.height * 4;
    const readBuffer = this.device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer(
      { texture: this.finalOutput },
      { buffer: readBuffer, bytesPerRow: this.width * 4 },
      [this.width, this.height]
    );
    this.device.queue.submit([enc.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8ClampedArray(readBuffer.getMappedRange());
    const imageData = new ImageData(new Uint8ClampedArray(data), this.width, this.height);
    readBuffer.unmap();
    readBuffer.destroy();
    return imageData;
  }

  destroy() {
    this.colorTexture?.destroy();
    this.depthTexture?.destroy();
    this.cocTexture?.destroy();
    this.nearRaw?.destroy();
    this.farRaw?.destroy();
    this.nearBlurred?.destroy();
    this.farBlurred?.destroy();
    this.nearDilated?.destroy();
    this.composited?.destroy();
    this.finalOutput?.destroy();
    this.lensUniformBuffer?.destroy();
    this.bokehFarUniformBuffer?.destroy();
    this.bokehNearUniformBuffer?.destroy();
    this.dilateUniformBuffer?.destroy();
    this.compositeUniformBuffer?.destroy();
    this.chromaticUniformBuffer?.destroy();
    this.device?.destroy();
  }
}
