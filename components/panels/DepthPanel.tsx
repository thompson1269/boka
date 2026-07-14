"use client";
import React, { useEffect, useRef } from "react";
import { Paintbrush, Trash2 } from "lucide-react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { Slider } from "@/components/ui/Slider";

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#666",
  textTransform: "uppercase", letterSpacing: "0.8px",
  marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #2a2a2a",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

// Turbo colormap for the mini depth preview
function turbo(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 0.1357 + t*(4.6154 - t*(42.666 - t*(132.13 - t*(152.94 - t*59.29))))));
  const g = Math.max(0, Math.min(1, 0.0914 + t*(2.1942 + t*(4.843  - t*(14.185 + t*(4.277  - t*2.83))))));
  const b = Math.max(0, Math.min(1, 0.1067 + t*(12.642 - t*(60.582 - t*(110.36 - t*(89.903 - t*27.35))))));
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

export function DepthPanel() {
  const {
    isBrushActive, setBrushActive,
    brushRadius, setBrushRadius,
    brushStrokes, clearBrushStrokes,
    colorImage, depthImage,
    params, viewMode, setViewMode,
    depthOverlayOpacity, setDepthOverlayOpacity,
  } = useEditorStore();

  const hasImages = !!(colorImage && depthImage);
  const fd = params.focalDistance;
  const fr = params.focalRange;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render mini depth preview in the panel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !depthImage) return;

    const PREVIEW_W = 200;
    const PREVIEW_H = Math.round(PREVIEW_W * depthImage.height / depthImage.width);
    canvas.width  = PREVIEW_W;
    canvas.height = PREVIEW_H;
    const ctx = canvas.getContext("2d")!;

    // Downsample depthImage to preview size
    const scaleX = depthImage.width  / PREVIEW_W;
    const scaleY = depthImage.height / PREVIEW_H;
    const out = new Uint8ClampedArray(PREVIEW_W * PREVIEW_H * 4);

    for (let py = 0; py < PREVIEW_H; py++) {
      for (let px = 0; px < PREVIEW_W; px++) {
        const sx = Math.min(depthImage.width  - 1, Math.floor(px * scaleX));
        const sy = Math.min(depthImage.height - 1, Math.floor(py * scaleY));
        const si = (sy * depthImage.width + sx) * 4;
        const d  = depthImage.data[si] / 255;
        const [r, g, b] = turbo(d);
        const oi = (py * PREVIEW_W + px) * 4;

        // Highlight in-focus zone with brightness boost
        const inFocus = Math.abs(d - fd) <= fr;
        out[oi]   = inFocus ? Math.min(255, r + 40) : Math.round(r * 0.7);
        out[oi+1] = inFocus ? Math.min(255, g + 40) : Math.round(g * 0.7);
        out[oi+2] = inFocus ? Math.min(255, b + 40) : Math.round(b * 0.7);
        out[oi+3] = 255;
      }
    }
    ctx.putImageData(new ImageData(out, PREVIEW_W, PREVIEW_H), 0, 0);

    // Draw focus zone overlay line
    ctx.strokeStyle = "rgba(74,255,136,0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    // Find approximate x positions where depth matches focal plane
    // (just draw a horizontal band for the in-focus zone)
    ctx.fillStyle = "rgba(74,255,136,0.15)";
    for (let py = 0; py < PREVIEW_H; py++) {
      for (let px = 0; px < PREVIEW_W; px++) {
        const sx = Math.min(depthImage.width  - 1, Math.floor(px * scaleX));
        const sy = Math.min(depthImage.height - 1, Math.floor(py * scaleY));
        const d  = depthImage.data[(sy * depthImage.width + sx) * 4] / 255;
        if (Math.abs(d - fd) <= fr * 0.5) {
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }

    // Legend bar
    const lgH = PREVIEW_H - 8;
    for (let i = 0; i < lgH; i++) {
      const t = 1 - i / lgH;
      const [r, g, b] = turbo(t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(PREVIEW_W - 10, 4 + i, 8, 1);
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "8px sans-serif";
    ctx.fillText("N", PREVIEW_W - 11, 12);
    ctx.fillText("F", PREVIEW_W - 11, PREVIEW_H - 4);

  }, [depthImage, fd, fr]);

  return (
    <div>
      {/* Depth Map View */}
      <div style={{ ...sectionHeader, marginTop: 0 }}>
        <span>Depth Map</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["result","depth","split"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={mode === "result" ? "Show result" : mode === "depth" ? "Show depth map" : "Split view"}
              style={{
                padding: "3px 7px", borderRadius: 4, fontSize: 10,
                background: viewMode === mode ? "rgba(74,158,255,0.2)" : "#2a2a2a",
                border: `1px solid ${viewMode === mode ? "#4a9eff" : "#3a3a3a"}`,
                color: viewMode === mode ? "#4a9eff" : "#777",
                cursor: "pointer",
              }}
            >
              {mode === "result" ? "Result" : mode === "depth" ? "Depth" : "Split"}
            </button>
          ))}
        </div>
      </div>

      {/* Mini depth preview */}
      {hasImages ? (
        <div style={{ marginBottom: 12 }}>
          <canvas
            ref={canvasRef}
            onClick={() => setViewMode("depth")}
            style={{
              width: "100%", height: "auto", display: "block",
              borderRadius: 6, border: "1px solid #2a2a2a",
              cursor: "pointer",
            }}
            title="Click to view full depth map"
          />
          <div style={{ fontSize: 9, color: "#444", textAlign: "center", marginTop: 4 }}>
            Click to view full depth • Green = focus zone
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: "#555", textAlign: "center",
          padding: 16, background: "#1a1a1a", borderRadius: 6,
          border: "1px dashed #2a2a2a", marginBottom: 12,
        }}>
          Load an image to generate a depth map.
        </div>
      )}

      {/* Overlay opacity (only relevant in result mode) */}
      <div style={{ ...sectionHeader }}>
        <span>Depth Overlay</span>
      </div>
      <Slider
        label="Overlay Opacity"
        value={depthOverlayOpacity}
        min={0} max={1} step={0.01} decimals={2}
        onChange={(v) => {
          setDepthOverlayOpacity(v);
          // Switch to result mode so they can see overlay on top of image
          if (viewMode !== "result") setViewMode("result");
        }}
        disabled={!hasImages}
      />
      <div style={{ fontSize: 10, color: "#444", marginBottom: 12, lineHeight: 1.5 }}>
        Shows depth map blended over the result image. Set to 0 to hide.
      </div>

      {/* Depth histogram */}
      {hasImages && (
        <>
          <div style={{ ...sectionHeader }}><span>Focus Zone</span></div>
          <DepthHistogram
            depthImage={depthImage!}
            focalDistance={fd}
            focalRange={fr}
          />
        </>
      )}

      {/* Brush tool */}
      <div style={{ ...sectionHeader, marginTop: 16 }}>
        <span>Manual Brush</span>
        <div style={{ display: "flex", gap: 4 }}>
          {brushStrokes.length > 0 && (
            <button onClick={clearBrushStrokes} style={{ display:"flex", alignItems:"center", padding:"3px 6px", borderRadius:4, background:"#2a2a2a", border:"1px solid #3a3a3a", color:"#777", cursor:"pointer" }}>
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={() => setBrushActive(!isBrushActive)}
            style={{ display:"flex", alignItems:"center", padding:"3px 6px", borderRadius:4, background: isBrushActive ? "rgba(74,158,255,0.2)" : "#2a2a2a", border:`1px solid ${isBrushActive ? "#4a9eff" : "#3a3a3a"}`, color: isBrushActive ? "#4a9eff" : "#777", cursor:"pointer" }}
          >
            <Paintbrush size={12} />
          </button>
        </div>
      </div>
      <Slider label="Brush Size" value={brushRadius} min={5} max={200} step={5} onChange={setBrushRadius} />

      <div style={{ background:"#1a1a1a", border:"1px solid #222", borderRadius:6, padding:"10px 12px", marginTop:16 }}>
        <span style={{ fontSize:9, fontWeight:700, color:"#4a9eff", textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>AI Depth</span>
        <p style={{ fontSize:11, color:"#666", lineHeight:1.5, margin:0 }}>
          Depth estimated by <strong style={{color:"#888"}}>Depth Anything V2</strong>. Image is sent to the local Python server on port 5001.
        </p>
      </div>
    </div>
  );
}

function DepthHistogram({ depthImage, focalDistance, focalRange }: {
  depthImage: ImageData;
  focalDistance: number;
  focalRange: number;
}) {
  // Sample depth values and build histogram
  const BINS = 40;
  const counts = new Array(BINS).fill(0);
  const step = Math.max(1, Math.floor(depthImage.data.length / 4 / 2000));

  for (let i = 0; i < depthImage.data.length / 4; i += step) {
    const d = depthImage.data[i * 4] / 255;
    const bin = Math.min(BINS - 1, Math.floor(d * BINS));
    counts[bin]++;
  }

  const maxCount = Math.max(...counts, 1);

  return (
    <div style={{ background:"#1a1a1a", borderRadius:6, padding:"8px 10px", border:"1px solid #222", marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:1, height:40, marginBottom:4 }}>
        {counts.map((count, i) => {
          const pos = i / BINS;
          const inFocus = Math.abs(pos - focalDistance) <= focalRange;
          const height  = Math.max(2, (count / maxCount) * 40);
          const [r, g, b] = turbo(pos);
          return (
            <div key={i} style={{
              flex:1, borderRadius:"1px 1px 0 0",
              height,
              background: inFocus ? "rgba(74,255,136,0.9)" : `rgb(${r},${g},${b})`,
              opacity: inFocus ? 1 : 0.5,
              transition: "height 0.3s, opacity 0.3s",
            }} />
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#444" }}>
        <span>Near</span>
        <span style={{color:"#4aff88"}}>Focus {(focalDistance*100).toFixed(0)}%</span>
        <span>Far</span>
      </div>
    </div>
  );
}
