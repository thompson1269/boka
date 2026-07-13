// ============================================================
// Canvas 2D Fallback — CPU-based bokeh for non-WebGPU browsers
// Uses a variable-radius Gaussian approximation.
// Not as accurate as the GPU path but gives a real-time preview.
// ============================================================

import type { LensParams } from "./BokehEngine";

export class Canvas2DFallback {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private colorData: ImageData | null = null;
  private depthData: ImageData | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  loadImages(color: ImageData, depth: ImageData) {
    this.colorData = color;
    this.depthData = depth;
    this.canvas.width = color.width;
    this.canvas.height = color.height;
  }

  render(params: LensParams): void {
    if (!this.colorData || !this.depthData) return;

    const w = this.colorData.width;
    const h = this.colorData.height;
    const src = this.colorData.data;
    const dep = this.depthData.data;
    const out = new Uint8ClampedArray(w * h * 4);

    const maxR = params.aperture;
    const fd = params.focalDistance;
    const fr = params.focalRange;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const depth = dep[idx] / 255;

        const delta = Math.abs(depth - fd);
        const softDelta = Math.max(0, delta - fr);
        const coc = Math.min((params.aperture * softDelta) / Math.max(depth, 0.001), maxR);

        if (coc < 1) {
          out[idx]     = src[idx];
          out[idx + 1] = src[idx + 1];
          out[idx + 2] = src[idx + 2];
          out[idx + 3] = 255;
          continue;
        }

        // Box blur approximation (fast, not as pretty)
        const r = Math.round(coc * 0.5);
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        const step = Math.max(1, Math.floor(r / 4)); // skip pixels for speed

        for (let dy = -r; dy <= r; dy += step) {
          for (let dx = -r; dx <= r; dx += step) {
            const nx = Math.min(w - 1, Math.max(0, x + dx));
            const ny = Math.min(h - 1, Math.max(0, y + dy));
            const ni = (ny * w + nx) * 4;
            rSum += src[ni];
            gSum += src[ni + 1];
            bSum += src[ni + 2];
            count++;
          }
        }

        out[idx]     = rSum / count;
        out[idx + 1] = gSum / count;
        out[idx + 2] = bSum / count;
        out[idx + 3] = 255;
      }
    }

    const result = new ImageData(out, w, h);
    this.ctx.putImageData(result, 0, 0);
  }
}
