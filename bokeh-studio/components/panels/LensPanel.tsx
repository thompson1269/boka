"use client";
import React from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { useEditorStore, APERTURE_SHAPES } from "@/lib/store/useEditorStore";
import { Slider } from "@/components/ui/Slider";

const sh = {
  sectionHeader: {
    fontSize: 11, fontWeight: 600, color: "#666",
    textTransform: "uppercase" as const, letterSpacing: "0.8px",
    marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #2a2a2a",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
};

export function LensPanel() {
  const { params, setParam, setApertureShape, setFocusPicking, isFocusPicking, resetParams } = useEditorStore();

  const currentShape = APERTURE_SHAPES.find(
    (s) => s.blades === params.apertureShape && !(params.anamorphic > 1.1 && s.id !== "anamorphic")
  )?.id ?? "circle";

  return (
    <div>
      {/* Focus */}
      <div style={{ ...sh.sectionHeader, marginTop: 0 }}>
        <span>Focus</span>
        <button
          onClick={() => setFocusPicking(!isFocusPicking)}
          title="Click image to pick focus"
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
            borderRadius: 4, background: isFocusPicking ? "rgba(74,158,255,0.2)" : "#2a2a2a",
            border: `1px solid ${isFocusPicking ? "#4a9eff" : "#3a3a3a"}`,
            color: isFocusPicking ? "#4a9eff" : "#999", fontSize: 10, cursor: "pointer",
          }}
        >
          <Crosshair size={11} /><span>Pick</span>
        </button>
      </div>
      <Slider label="Focal Distance" value={params.focalDistance} min={0.01} max={0.99} step={0.01} decimals={2} onChange={(v) => setParam("focalDistance", v)} />
      <Slider label="Focal Range" value={params.focalRange} min={0} max={0.3} step={0.005} decimals={3} onChange={(v) => setParam("focalRange", v)} />

      {/* Blur */}
      <div style={{ ...sh.sectionHeader, marginTop: 16 }}><span>Blur</span></div>
      <Slider label="Blur Amount" value={params.aperture} min={0} max={80} step={1} onChange={(v) => setParam("aperture", v)} />
      <Slider label="Near Field" value={params.nearStrength} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("nearStrength", v)} />
      <Slider label="Far Field" value={params.farStrength} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("farStrength", v)} />

      {/* Aperture */}
      <div style={{ ...sh.sectionHeader, marginTop: 16 }}><span>Aperture Shape</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
        {APERTURE_SHAPES.map((shape) => (
          <button
            key={shape.id}
            onClick={() => setApertureShape(shape.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              padding: "8px 4px", borderRadius: 6,
              background: currentShape === shape.id ? "rgba(74,158,255,0.15)" : "#2a2a2a",
              border: `1px solid ${currentShape === shape.id ? "#4a9eff" : "#3a3a3a"}`,
              color: currentShape === shape.id ? "#4a9eff" : "#999",
              fontSize: 9, cursor: "pointer",
            }}
          >
            <ApertureIcon shape={shape.id} />
            <span>{shape.label}</span>
          </button>
        ))}
      </div>
      <Slider label="Blade Rotation" value={params.bladeRotation} min={0} max={360} step={1} unit="°" onChange={(v) => setParam("bladeRotation", v)} disabled={params.apertureShape === 0} />

      {/* Bokeh */}
      <div style={{ ...sh.sectionHeader, marginTop: 16 }}><span>Bokeh</span></div>
      <Slider label="Bokeh Boost" value={params.bokehBoost} min={0} max={5} step={0.1} decimals={1} onChange={(v) => setParam("bokehBoost", v)} />
      <Slider label="Cat Eye" value={params.catEye} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("catEye", v)} />

      {/* Vignette */}
      <div style={{ ...sh.sectionHeader, marginTop: 16 }}><span>Vignette</span></div>
      <Slider label="Strength" value={params.vignette} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("vignette", v)} />
      <Slider label="Feather" value={params.vignetteFeather} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("vignetteFeather", v)} />

      <button
        onClick={resetParams}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", marginTop: 16, padding: 8, borderRadius: 6,
          background: "#2a2a2a", border: "1px solid #3a3a3a", color: "#666",
          fontSize: 11, cursor: "pointer",
        }}
      >
        <RotateCcw size={12} /><span>Reset All</span>
      </button>
    </div>
  );
}

function ApertureIcon({ shape }: { shape: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {shape === "circle"     && <circle cx="10" cy="10" r="7" />}
      {shape === "hex"        && <polygon points="10,3 16.06,6.5 16.06,13.5 10,17 3.94,13.5 3.94,6.5" />}
      {shape === "octagon"    && <polygon points="6.17,3 13.83,3 17,6.17 17,13.83 13.83,17 6.17,17 3,13.83 3,6.17" />}
      {shape === "pentagon"   && <polygon points="10,3 16.5,7.5 14,15 6,15 3.5,7.5" />}
      {shape === "star"       && <polygon strokeWidth={1.2} points="10,2 11.8,7.5 17.5,7.5 12.8,11 14.6,16.5 10,13 5.4,16.5 7.2,11 2.5,7.5 8.2,7.5" />}
      {shape === "anamorphic" && <ellipse cx="10" cy="10" rx="8" ry="4" />}
    </svg>
  );
}
