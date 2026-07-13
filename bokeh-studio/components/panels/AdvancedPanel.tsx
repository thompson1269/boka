"use client";
import React from "react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { Slider } from "@/components/ui/Slider";

const sectionHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#666",
  textTransform: "uppercase", letterSpacing: "0.8px",
  marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #2a2a2a",
};

const tipStyle: React.CSSProperties = {
  background: "#242424", border: "1px solid #2a2a2a",
  borderRadius: 6, padding: "10px 12px",
};

export function AdvancedPanel() {
  const { params, setParam } = useEditorStore();

  return (
    <div>
      <div style={{ ...sectionHeader, marginTop: 0 }}>Optical Aberrations</div>
      <Slider
        label="Chromatic Aberration"
        value={params.chromaticAb} min={0} max={1} step={0.01} decimals={2}
        onChange={(v) => setParam("chromaticAb", v)}
      />

      <div style={{ ...sectionHeader, marginTop: 16 }}>Anamorphic</div>
      <Slider
        label="Squeeze Ratio"
        value={params.anamorphic} min={1} max={3} step={0.05} decimals={2}
        onChange={(v) => setParam("anamorphic", v)}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {[
          { label: "Pro tip", text: "Set aperture to Anamorphic for oval cinematic bokeh — the signature look of Cooke and Atlas anamorphic lenses." },
          { label: "Physics", text: "Cat Eye vignettes bokeh discs at image edges, mimicking real lens fall-off. Most visible at wide apertures." },
          { label: "Chromatic AB", text: "Splits RGB channels outward from the bokeh center — refractive dispersion. Use sparingly for a cinematic look." },
        ].map(({ label, text }) => (
          <div key={label} style={tipStyle}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#4a9eff", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
              {label}
            </span>
            <p style={{ fontSize: 11, color: "#777", lineHeight: 1.5, margin: 0 }}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
