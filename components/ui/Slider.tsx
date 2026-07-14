"use client";
import React, { useState } from "react";

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

export function Slider({
  label, value, min, max, step = 1, unit = "",
  onChange, disabled = false, decimals = 0,
}: SliderProps) {
  const [active, setActive] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <div style={{
      marginBottom: 14,
      opacity: disabled ? 0.35 : 1,
      pointerEvents: disabled ? "none" : "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.3px" }}>
          {label}
        </span>
        <span style={{
          fontSize: 11, fontVariantNumeric: "tabular-nums",
          color: active ? "var(--accent-bright)" : "var(--text-primary)",
          fontWeight: 500, transition: "color 0.1s",
          background: active ? "var(--accent-subtle)" : "transparent",
          padding: "0 4px", borderRadius: 3,
        }}>
          {display}{unit}
        </span>
      </div>
      <div style={{ position: "relative", height: 3, background: "var(--border)", borderRadius: 2 }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: active
            ? "linear-gradient(90deg, var(--accent), var(--accent-bright))"
            : "var(--accent)",
          borderRadius: 2,
          transition: "background 0.1s",
          pointerEvents: "none",
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onMouseDown={() => setActive(true)}
          onMouseUp={() => setActive(false)}
          onTouchStart={() => setActive(true)}
          onTouchEnd={() => setActive(false)}
          disabled={disabled}
          style={{
            position: "absolute", top: -7, left: 0, width: "100%",
            height: 18, margin: 0, opacity: 0, cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
