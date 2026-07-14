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
    await initWasm();

    const {
      aperture,
      focalDistance,
      focalRange,
      bokehBoost,
    } = params;

    // Map UI aperture (0-80px) → kernel radius
    // The Rust crate works with actual pixel radii
    const radius = Math.max(0.5, aperture * 0.4);

    // gamma: 1.0 = neutral, bokehBoost shifts exposure on highlights
    const gamma = Math.max(1.0, Math.min(3.0, 1.0 + bokehBoost * 0.3));

    // Use 5 components — good quality/speed balance
    // Higher = better disc approximation but slower
    const components = aperture > 40 ? 7 : aperture > 20 ? 5 : 4;

    const out = applyBokeh(
      rgba,
      depth,
      width,
      height,
      radius,
      focalDistance,
      focalRange,
      gamma,
      components
    );

    // wasm-bindgen returns a JS Uint8Array backed by WASM memory.
    // Copy it out before the WASM heap can move, then transfer the buffer.
    const outCopy = new Uint8Array(out);
    self.postMessage({ type: "result", out: outCopy, paramsKey }, [outCopy.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message, paramsKey });
  }
};
