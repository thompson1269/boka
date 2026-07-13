"use client";
import React from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  decimals?: number;
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange, disabled = false, decimals = 0 }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <div style={{ marginBottom: 12, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#e8e8e8", fontVariantNumeric: "tabular-nums" }}>{display}{unit}</span>
      </div>
      <div style={{ position: "relative", height: 3, background: "#3a3a3a", borderRadius: 2 }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${pct}%`, background: "#4a9eff", borderRadius: 2, pointerEvents: "none",
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          style={{
            position: "absolute", top: -6, left: 0, width: "100%",
            margin: 0, opacity: 0, height: 16, cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
