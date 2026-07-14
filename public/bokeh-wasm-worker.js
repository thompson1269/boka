// Web Worker — runs the Rust/WASM bokeh engine off the main thread
// Receives: { type: "render", rgba, depth, width, height, params }
// Posts back: { type: "result", out } | { type: "error", message }

let wasmReady = false;
let applyBokeh = null;

async function initWasm() {
  if (wasmReady) return;
  try {
    const { default: init, apply_bokeh } = await import("/wasm/bokeh_wasm.js");
    await init("/wasm/bokeh_wasm_bg.wasm");
    applyBokeh = apply_bokeh;
    wasmReady = true;
  } catch (e) {
    throw new Error("WASM init failed: " + e.message);
  }
}

self.onmessage = async function (e) {
  const { rgba, depth, width, height, params, paramsKey } = e.data;

  try {
    // Stage 1 — init
    self.postMessage({ type: "progress", pct: 5, label: "Loading Rust engine…" });
    await initWasm();

    const { aperture, focalDistance, focalRange, bokehBoost } = params;
    const radius     = Math.max(0.5, aperture * 0.4);
    const gamma      = Math.max(1.0, Math.min(3.0, 1.0 + bokehBoost * 0.3));
    const components = aperture > 40 ? 7 : aperture > 20 ? 5 : 4;

    // Stage 2 — convert + mask
    self.postMessage({ type: "progress", pct: 20, label: "Building depth mask…" });

    // Stage 3 — blur (the heavy step)
    self.postMessage({ type: "progress", pct: 35, label: `Running ${components}-component Gaussian kernel…` });

    const out = applyBokeh(
      rgba, depth, width, height,
      radius, focalDistance, focalRange, gamma, components
    );

    // Stage 4 — done
    self.postMessage({ type: "progress", pct: 95, label: "Compositing…" });

    const outCopy = new Uint8Array(out);
    self.postMessage({ type: "result", out: outCopy, paramsKey }, [outCopy.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message, paramsKey });
  }
};
