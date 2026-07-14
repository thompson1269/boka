"use client";
import React from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { useEditorStore, APERTURE_SHAPES } from "@/lib/store/useEditorStore";
import { Slider } from "@/components/ui/Slider";

export function LensPanel() {
  const { params, setParam, setApertureShape, setFocusPicking, isFocusPicking, resetParams } = useEditorStore();

  const currentShape = APERTURE_SHAPES.find(
    (s) => s.blades === params.apertureShape && !(params.anamorphic > 1.1 && s.id !== "anamorphic")
  )?.id ?? "circle";

  return (
    <div>
      {/* Focus */}
      <SectionHeader label="Focus">
        <button
          onClick={() => setFocusPicking(!isFocusPicking)}
          title="Click image to pick focus point"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 5,
            background: isFocusPicking ? "var(--accent-subtle)" : "var(--bg-elevated)",
            border: `1px solid ${isFocusPicking ? "rgba(59,130,246,0.4)" : "var(--border)"}`,
            color: isFocusPicking ? "var(--accent-bright)" : "var(--text-muted)",
            fontSize: 10, cursor: "pointer", fontWeight: 500, transition: "all 0.12s",
          }}
        >
          <Crosshair size={10} /><span>Pick</span>
        </button>
      </SectionHeader>
      <Slider label="Focal Distance" value={params.focalDistance} min={0.01} max={0.99} step={0.01} decimals={2} onChange={(v) => setParam("focalDistance", v)} />
      <Slider label="Focal Range"    value={params.focalRange}    min={0}    max={0.3}  step={0.005} decimals={3} onChange={(v) => setParam("focalRange", v)} />

      {/* Blur */}
      <SectionHeader label="Blur" />
      <Slider label="Blur Amount" value={params.aperture}     min={0} max={80} step={1}    onChange={(v) => setParam("aperture", v)} />
      <Slider label="Near Field"  value={params.nearStrength} min={0} max={1}  step={0.01} decimals={2} onChange={(v) => setParam("nearStrength", v)} />
      <Slider label="Far Field"   value={params.farStrength}  min={0} max={1}  step={0.01} decimals={2} onChange={(v) => setParam("farStrength", v)} />

      {/* Aperture shape */}
      <SectionHeader label="Aperture Shape" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginBottom: 14 }}>
        {APERTURE_SHAPES.map((shape) => {
          const active = currentShape === shape.id;
          return (
            <button
              key={shape.id}
              onClick={() => setApertureShape(shape.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                padding: "9px 4px", borderRadius: 7,
                background: active ? "var(--accent-subtle)" : "var(--bg-elevated)",
                border: `1px solid ${active ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                color: active ? "var(--accent-bright)" : "var(--text-muted)",
                fontSize: 9, fontWeight: active ? 600 : 400,
                cursor: "pointer", transition: "all 0.12s",
                boxShadow: active ? "inset 0 0 0 1px rgba(59,130,246,0.1)" : "none",
              }}
            >
              <ApertureIcon shape={shape.id} active={active} />
              <span style={{ letterSpacing: "0.2px" }}>{shape.label}</span>
            </button>
          );
        })}
      </div>
      <Slider
        label="Blade Rotation" unit="°"
        value={params.bladeRotation} min={0} max={360} step={1}
        onChange={(v) => setParam("bladeRotation", v)}
        disabled={params.apertureShape === 0 && params.anamorphic <= 1.1}
      />

      {/* Bokeh */}
      <SectionHeader label="Bokeh" />
      <Slider label="Bokeh Boost" value={params.bokehBoost} min={0} max={5}  step={0.1}  decimals={1} onChange={(v) => setParam("bokehBoost", v)} />
      <Slider label="Cat Eye"     value={params.catEye}     min={0} max={1}  step={0.01} decimals={2} onChange={(v) => setParam("catEye", v)} />

      {/* Vignette */}
      <SectionHeader label="Vignette" />
      <Slider label="Strength" value={params.vignette}        min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("vignette", v)} />
      <Slider label="Feather"  value={params.vignetteFeather} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setParam("vignetteFeather", v)} />

      <button
        onClick={resetParams}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", marginTop: 6, padding: "8px 12px", borderRadius: 7,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
          transition: "all 0.12s",
        }}
      >
        <RotateCcw size={11} /><span>Reset All</span>
      </button>
    </div>
  );
}

function SectionHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
      textTransform: "uppercase", letterSpacing: "0.7px",
      marginBottom: 10, marginTop: 18, paddingBottom: 7,
      borderBottom: "1px solid var(--border-soft)",
    }}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function ApertureIcon({ shape, active }: { shape: string; active: boolean }) {
  const color = active ? "var(--accent-bright)" : "var(--text-muted)";
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round">
      {shape === "circle"     && <circle cx="10" cy="10" r="7" />}
      {shape === "hex"        && <polygon points="10,3 16.06,6.5 16.06,13.5 10,17 3.94,13.5 3.94,6.5" />}
      {shape === "octagon"    && <polygon points="6.17,3 13.83,3 17,6.17 17,13.83 13.83,17 6.17,17 3,13.83 3,6.17" />}
      {shape === "pentagon"   && <polygon points="10,3 16.5,7.5 14,15 6,15 3.5,7.5" />}
      {shape === "star"       && <polygon strokeWidth={1.2} points="10,2 11.8,7.5 17.5,7.5 12.8,11 14.6,16.5 10,13 5.4,16.5 7.2,11 2.5,7.5 8.2,7.5" />}
      {shape === "anamorphic" && <ellipse cx="10" cy="10" rx="8" ry="4" />}
    </svg>
  );
}
