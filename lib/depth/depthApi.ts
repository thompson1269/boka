// All requests go through the Next.js proxy at /api/depth
// which forwards to the Python server at localhost:5001
const PROXY = "/api/depth";

/** Check if the Python depth server is reachable */
export async function checkServer(): Promise<boolean> {
  try {
    const r = await fetch(PROXY, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    return d.status === "ok";
  } catch {
    return false;
  }
}

/** Estimate depth via Depth Anything V2 */
export async function estimateDepth(colorData: ImageData): Promise<ImageData> {
  try {
    const blob = await imageDataToBlob(colorData, "image/jpeg");
    const form = new FormData();
    form.append("_endpoint", "depth");
    form.append("image", blob, "image.jpg");

    const resp = await fetch(PROXY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(40000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.error) throw new Error(json.error);

    return await base64PngToImageData(json.depth, colorData.width, colorData.height);
  } catch (e) {
    console.warn("Depth estimation failed, using synthetic:", e);
    return syntheticDepth(colorData);
  }
}

export interface BokehParams {
  K: number;
  disp_focus: number;
  gamma: number;
  highlight: boolean;
}

/** Render bokeh via BokehMe + Depth Anything V2 */
export async function renderBokeh(
  colorData: ImageData,
  depthData: ImageData,
  params: BokehParams
): Promise<ImageData | null> {
  try {
    const colorBlob = await imageDataToBlob(colorData, "image/jpeg");
    const depthBlob = await imageDataToBlob(depthData, "image/png");

    const form = new FormData();
    form.append("_endpoint",  "bokeh");
    form.append("image",      colorBlob, "image.jpg");
    form.append("disp",       depthBlob, "disp.png");
    form.append("K",          String(Math.max(1, params.K)));
    form.append("disp_focus", String(params.disp_focus));
    form.append("gamma",      String(params.gamma));
    form.append("highlight",  String(params.highlight));

    const resp = await fetch(PROXY, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.error) throw new Error(json.error);

    return await base64PngToImageData(json.bokeh, colorData.width, colorData.height);
  } catch (e) {
    console.error("BokehMe render failed:", e);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────

async function imageDataToBlob(data: ImageData, type = "image/jpeg"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = data.width; canvas.height = data.height;
  canvas.getContext("2d")!.putImageData(data, 0, 0);
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), type, 0.92)
  );
}

async function base64PngToImageData(b64: string, w: number, h: number): Promise<ImageData> {
  const bytes = atob(b64);
  const buf   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new window.Image();
    i.onload = () => res(i); i.onerror = rej; i.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return ctx.getImageData(0, 0, w, h);
}

function syntheticDepth(colorData: ImageData): ImageData {
  const { width: w, height: h, data } = colorData;
  const depth = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x/w-0.5)*2, ny = (y/h-0.5)*2;
      const radial = 1 - Math.sqrt(nx*nx+ny*ny)*0.5;
      const i4 = (y*w+x)*4;
      const lum = (data[i4]*0.299+data[i4+1]*0.587+data[i4+2]*0.114)/255;
      const val = Math.round(Math.max(0,Math.min(1, radial*0.65+(1-lum)*0.35))*255);
      depth[i4]=val; depth[i4+1]=val; depth[i4+2]=val; depth[i4+3]=255;
    }
  }
  return new ImageData(depth, w, h);
}
