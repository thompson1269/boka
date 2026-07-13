"use client";
import React from "react";
import { Eye, EyeOff, Paintbrush, Trash2 } from "lucide-react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { Slider } from "@/components/ui/Slider";

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#666",
  textTransform: "uppercase", letterSpacing: "0.8px",
  marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #2a2a2a",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

export function DepthPanel() {
  const {
    showDepthOverlay, setShowDepthOverlay,
    depthOverlayOpacity, setDepthOverlayOpacity,
    isBrushActive, setBrushActive,
    brushRadius, setBrushRadius,
    brushStrokes, clearBrushStrokes,
    colorImage, depthImage,
    params,
  } = useEditorStore();

  const hasImages = !!(colorImage && depthImage);
  const fd = params.focalDistance;
  const fr = params.focalRange;

  return (
    <div>
      {/* Depth overlay */}
      <div style={{ ...sectionHeader, marginTop: 0 }}>
        <span>Depth Map</span>
        <button
          onClick={() => setShowDepthOverlay(!showDepthOverlay)}
          style={{
            display: "flex", alignItems: "center", padding: "3px 6px",
            borderRadius: 4, background: "#2a2a2a", border: "1px solid #3a3a3a",
            color: "#777", cursor: "pointer",
          }}
        >
          {showDepthOverlay ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>

      <Slider
        label="Overlay Opacity"
        value={depthOverlayOpacity}
        min={0} max={1} step={0.01} decimals={2}
        onChange={setDepthOverlayOpacity}
        disabled={!showDepthOverlay}
      />

      {!hasImages && (
        <div style={{
          fontSize: 11, color: "#555", textAlign: "center",
          padding: 16, background: "#242424", borderRadius: 6,
          border: "1px dashed #333", marginBottom: 12,
        }}>
          Load an image to generate a depth map.
        </div>
      )}

      {hasImages && (
        <div style={{
          background: "#1a1a1a", borderRadius: 6, padding: 10,
          border: "1px solid #2a2a2a", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 48, marginBottom: 4 }}>
            {Array.from({ length: 40 }, (_, i) => {
              const pos = i / 40;
              const inFocus = Math.abs(pos - fd) <= fr;
              const near = pos < fd - fr;
              return (
                <div key={i} style={{
                  flex: 1, minHeight: 2, borderRadius: "1px 1px 0 0",
                  height: `${20 + Math.sin(i * 0.5) * 12 + 8}px`,
                  background: inFocus ? "#4a9eff" : near ? "#ff884a" : "#6644ff",
                  opacity: inFocus ? 1 : 0.4,
                  transition: "all 0.2s",
                }} />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555" }}>
            <span>Near</span>
            <span>Focus {(fd * 100).toFixed(0)}%</span>
            <span>Far</span>
          </div>
        </div>
      )}

      {/* Brush tool */}
      <div style={{ ...sectionHeader, marginTop: 16 }}>
        <span>Manual Brush</span>
        <div style={{ display: "flex", gap: 4 }}>
          {brushStrokes.length > 0 && (
            <button
              onClick={clearBrushStrokes}
              style={{
                display: "flex", alignItems: "center", padding: "3px 6px",
                borderRadius: 4, background: "#2a2a2a", border: "1px solid #3a3a3a",
                color: "#777", cursor: "pointer",
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={() => setBrushActive(!isBrushActive)}
            style={{
              display: "flex", alignItems: "center", padding: "3px 6px",
              borderRadius: 4,
              background: isBrushActive ? "rgba(74,158,255,0.2)" : "#2a2a2a",
              border: `1px solid ${isBrushActive ? "#4a9eff" : "#3a3a3a"}`,
              color: isBrushActive ? "#4a9eff" : "#777", cursor: "pointer",
            }}
          >
            <Paintbrush size={12} />
          </button>
        </div>
      </div>

      <Slider
        label="Brush Size"
        value={brushRadius} min={5} max={200} step={5}
        onChange={setBrushRadius}
      />

      <div style={{
        background: "#242424", border: "1px solid #2a2a2a",
        borderRadius: 6, padding: "10px 12px", marginTop: 16,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#4a9eff", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
          Auto Depth
        </span>
        <p style={{ fontSize: 11, color: "#777", lineHeight: 1.5, margin: 0 }}>
          Depth is estimated using Depth Anything V2. Best results on portraits and landscapes.
        </p>
      </div>
    </div>
  );
}
