"use client";
import React, { useRef } from "react";
import { Upload, Download, Undo2, Redo2, Eye, Layers, SplitSquareHorizontal } from "lucide-react";
import { useEditorStore, type RenderEngine } from "@/lib/store/useEditorStore";
import { estimateDepth } from "@/lib/depth/depthApi";

const btn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 5,
  background: "#2a2a2a", border: "1px solid #333",
  color: "#ccc", fontSize: 12, cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnIcon: React.CSSProperties = { ...btn, padding: "5px 8px" };

interface ToolbarProps { onExport: () => void; }

const ENGINES: { id: RenderEngine; label: string; title: string }[] = [
  { id: "wasm",    label: "⚡ Rust",    title: "Rust/WASM kernel — fast disc bokeh, runs in-browser" },
  { id: "bokehme", label: "⬡ AI",      title: "BokehMe neural bokeh — requires Python server" },
  { id: "worker",  label: "🔧 Shapes", title: "JS Worker — all aperture shapes (hex, star, etc.)" },
];

export function Toolbar({ onExport }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    undo, redo, canUndo, canRedo,
    viewMode, setViewMode,
    engineStatus, colorImage,
    renderEngine, setRenderEngine,
  } = useEditorStore();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = async () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.floor(w * r); h = Math.floor(h * r); }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const colorData = canvas.getContext("2d")!.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      const store = useEditorStore.getState();
      store.setColorImage(colorData, file.name);
      store.setEngineStatus("rendering");
      store.setDepthImage(syntheticDepth(colorData));
      try {
        const aiDepth = await estimateDepth(colorData);
        useEditorStore.getState().setDepthImage(aiDepth);
      } catch { /* keep synthetic */ }
    };
    img.src = url;
    e.target.value = "";
  }

  const views = [
    { mode: "result", icon: <Eye size={13} />,                  label: "Result" },
    { mode: "depth",  icon: <Layers size={13} />,               label: "Depth"  },
    { mode: "split",  icon: <SplitSquareHorizontal size={13} />, label: "Split"  },
  ] as const;

  const dotColor =
    engineStatus === "ready"     ? "#4aff88" :
    engineStatus === "rendering" ? "#ffb84a" :
    engineStatus === "error"     ? "#ff4a4a" : "#555";

  return (
    <div style={{
      height: 44, background: "#1e1e1e", borderBottom: "1px solid #2a2a2a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 12px", gap: 12, flexShrink: 0, zIndex: 10,
    }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

      {/* Left — branding + file actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#4a9eff", marginRight: 8, letterSpacing: "-0.3px" }}>
          ⬡ Bokeh Studio
        </div>
        <button style={btn} onClick={() => fileRef.current?.click()}>
          <Upload size={14} /><span>Open</span>
        </button>
        <button
          style={{ ...btn, background: "#4a9eff", borderColor: "#4a9eff", color: "#fff", opacity: colorImage ? 1 : 0.4 }}
          onClick={onExport} disabled={!colorImage}
        >
          <Download size={14} /><span>Export</span>
        </button>
      </div>

      {/* Center — view toggle */}
      <div style={{ display: "flex", background: "#222", border: "1px solid #333", borderRadius: 5, overflow: "hidden" }}>
        {views.map(({ mode, icon, label }) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
            background: viewMode === mode ? "rgba(74,158,255,0.12)" : "transparent",
            border: "none", color: viewMode === mode ? "#4a9eff" : "#666",
            fontSize: 11, cursor: "pointer",
          }}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>

      {/* Right — engine switcher + undo/redo + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

        {/* Engine switcher */}
        <div style={{ display: "flex", background: "#222", border: "1px solid #333", borderRadius: 5, overflow: "hidden" }}>
          {ENGINES.map(({ id, label, title }) => (
            <button key={id} title={title} onClick={() => setRenderEngine(id)} style={{
              display: "flex", alignItems: "center", padding: "4px 9px",
              background: renderEngine === id ? "rgba(74,158,255,0.15)" : "transparent",
              border: "none", color: renderEngine === id ? "#4a9eff" : "#555",
              fontSize: 10, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>

        <button style={{ ...btnIcon, opacity: canUndo() ? 1 : 0.35 }} onClick={undo} disabled={!canUndo()} title="Undo">
          <Undo2 size={14} />
        </button>
        <button style={{ ...btnIcon, opacity: canRedo() ? 1 : 0.35 }} onClick={redo} disabled={!canRedo()} title="Redo">
          <Redo2 size={14} />
        </button>

        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: dotColor,
          boxShadow: engineStatus === "rendering" ? `0 0 6px ${dotColor}` : "none",
          flexShrink: 0,
        }} title={engineStatus} />
      </div>
    </div>
  );
}

function syntheticDepth(colorData: ImageData): ImageData {
  const { width, height, data } = colorData;
  const depth = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width - 0.5) * 2, ny = (y / height - 0.5) * 2;
      const radial = 1 - Math.sqrt(nx * nx + ny * ny) * 0.5;
      const i4 = (y * width + x) * 4;
      const lum = (data[i4] * 0.299 + data[i4 + 1] * 0.587 + data[i4 + 2] * 0.114) / 255;
      const val = Math.round(Math.max(0, Math.min(1, radial * 0.65 + (1 - lum) * 0.35)) * 255);
      depth[i4] = val; depth[i4 + 1] = val; depth[i4 + 2] = val; depth[i4 + 3] = 255;
    }
  }
  return new ImageData(depth, width, height);
}
