// Bokeh shape-aware CPU renderer — runs off the main thread
// Receives: { src, dep, width, height, params }
// Posts back: { out } as Uint8ClampedArray

self.onmessage = function (e) {
  const { src, dep, width: w, height: h, params } = e.data;

  const fd    = params.focalDistance;
  const fr    = params.focalRange;
  const maxR  = params.aperture;
  const boost = params.bokehBoost;
  const blades     = params.apertureShape;
  const rot        = (params.bladeRotation * Math.PI) / 180;
  const anamorphic = Math.max(1, params.anamorphic || 1.0);
  const TAU        = Math.PI * 2;

  function insideAperture(px, py) {
    const r = Math.sqrt(px * px + py * py);
    if (r < 0.0001) return true;
    if (blades < 3) return r <= 1.0;
    if (blades >= 9.5 && blades <= 10.5) {
      // 5-point star
      const angle  = Math.atan2(py, px) + rot;
      const sector = TAU / 10;
      const local  = ((angle % sector) + sector) % sector;
      const half   = sector * 0.5;
      const t      = Math.abs(local - half) / half;
      return r <= (0.45 + 0.55 * t);
    }
    // Regular N-gon
    const angle   = Math.atan2(py, px) + rot;
    const sector  = TAU / blades;
    const local   = ((angle % sector) + sector) % sector;
    const delta   = local - sector * 0.5;
    const apothem = Math.cos(Math.PI / blades);
    return r <= apothem / Math.cos(delta);
  }

  const out = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx   = (y * w + x) * 4;
      const depth = dep[idx] / 255;
      const coc   = Math.min(
        (maxR * Math.max(0, Math.abs(depth - fd) - fr)) / Math.max(depth, 0.001),
        maxR
      );

      if (coc < 0.5 || maxR === 0) {
        out[idx]   = src[idx];
        out[idx+1] = src[idx+1];
        out[idx+2] = src[idx+2];
        out[idx+3] = 255;
        continue;
      }

      const r    = Math.round(coc * 0.5);
      const step = Math.max(1, Math.floor(r / 6));
      let rS=0, gS=0, bS=0, wS=0;

      for (let dy = -r; dy <= r; dy += step) {
        for (let dx = -r; dx <= r; dx += step) {
          const nx = (dx / r) / anamorphic;
          const ny =  dy / r;
          if (!insideAperture(nx, ny)) continue;
          const sx = Math.min(w-1, Math.max(0, x + dx));
          const sy = Math.min(h-1, Math.max(0, y + dy));
          const si = (sy * w + sx) * 4;
          const lum = (src[si]*0.299 + src[si+1]*0.587 + src[si+2]*0.114) / 255;
          const w2  = 1 + Math.max(0, lum - 0.8) * boost * 3;
          rS += src[si]   * w2;
          gS += src[si+1] * w2;
          bS += src[si+2] * w2;
          wS += w2;
        }
      }

      if (wS > 0) {
        out[idx]   = rS / wS;
        out[idx+1] = gS / wS;
        out[idx+2] = bS / wS;
        out[idx+3] = 255;
      } else {
        out[idx]   = src[idx];
        out[idx+1] = src[idx+1];
        out[idx+2] = src[idx+2];
        out[idx+3] = 255;
      }
    }
  }

  self.postMessage({ out }, [out.buffer]);
};
