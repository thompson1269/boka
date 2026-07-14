use wasm_bindgen::prelude::*;
use bokeh::{bokeh_blur_with_mask, params::*};

/// Apply bokeh blur with a depth-based mask.
///
/// - `rgba_flat`: flat RGBA u8 array (width * height * 4)
/// - `depth_flat`: flat single-channel u8 depth array (width * height)
/// - `width`, `height`: image dimensions
/// - `radius`: blur radius (maps from UI aperture 0–80)
/// - `focal_distance`: normalised focus depth 0–1
/// - `focal_range`: depth of field half-width 0–1
/// - `gamma`: exposure multiplier
/// - `components`: kernel quality 1–9 (higher = slower + better)
///
/// Returns a new flat RGBA u8 array with bokeh applied.
#[wasm_bindgen]
pub fn apply_bokeh(
    rgba_flat: &[u8],
    depth_flat: &[u8],
    width: usize,
    height: usize,
    radius: f64,
    focal_distance: f64,
    focal_range: f64,
    gamma: f64,
    components: u8,
) -> Vec<u8> {
    let n = width * height;

    // Convert u8 RGBA → [[f64;4]] expected by the crate
    let mut pixels: Vec<[f64; 4]> = (0..n)
        .map(|i| {
            let b = i * 4;
            [
                rgba_flat[b]     as f64,
                rgba_flat[b + 1] as f64,
                rgba_flat[b + 2] as f64,
                rgba_flat[b + 3] as f64,
            ]
        })
        .collect();

    // Build a per-pixel mask: true = blur this pixel (out of focus)
    let mask: Vec<bool> = (0..n)
        .map(|i| {
            let d = depth_flat[i] as f64 / 255.0;
            let delta = (d - focal_distance).abs();
            delta > focal_range
        })
        .collect();

    let param_set: &KernelParamSet = match components {
        1 => &KERNEL1_PARAM_SET,
        2 => &KERNEL2_PARAM_SET,
        3 => &KERNEL3_PARAM_SET,
        4 => &KERNEL4_PARAM_SET,
        5 => &KERNEL5_PARAM_SET,
        6 => &KERNEL6_PARAM_SET,
        7 => &KERNEL7_PARAM_SET,
        8 => &KERNEL8_PARAM_SET,
        _ => &KERNEL9_PARAM_SET, // 9 = highest quality
    };

    bokeh_blur_with_mask(
        &mut pixels,
        &mask,
        width,
        height,
        radius,
        param_set,
        gamma,
    );

    // Convert back to flat u8
    let mut out = Vec::with_capacity(n * 4);
    for px in &pixels {
        out.push(px[0].clamp(0.0, 255.0) as u8);
        out.push(px[1].clamp(0.0, 255.0) as u8);
        out.push(px[2].clamp(0.0, 255.0) as u8);
        out.push(px[3].clamp(0.0, 255.0) as u8);
    }
    out
}
