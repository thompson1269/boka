"use client";
import React, { useRef } from "react";
import { Upload, Download, Undo2, Redo2, Eye, Layers, SplitSquareHorizontal } from "lucide-react";
import { useEditorStore, type RenderEngine } from "@/lib/store/useEditorStore";
import { estimateDepth } from "@/lib/depth/depthApi";

const ENGINES: { id: RenderEngine; label: string; title: string }[] = [
  { id: "wasm",    label: "⚡ Rust",  title: "Rust/WASM — fast in-browser disc bokeh" },
  { id: "bokehme", label: "✦ AI",    title: "BokehMe — neural bokeh (needs Python server)" },
  { id: "worker",  label: "◈ Shapes",title: "JS Worker — all aperture shapes" },
];

export function Toolbar({ onExport }: { onExport: () => void }) {
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
      if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.floor(w*r); h = Math.floor(h*r); }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const colorData = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      const store = useEditorStore.getState();
      store.setColorImage(colorData, file.name);
      store.setEngineStatus("rendering");
      store.setDepthImage(syntheticDepth(colorData));
      try { store.setDepthImage(await estimateDepth(colorData)); } catch { /* keep synthetic */ }
    };
    img.src = url;
    e.target.value = "";
  }

  const views = [
    { mode: "result", Icon: Eye,                    label: "Result" },
    { mode: "depth",  Icon: Layers,                 label: "Depth"  },
    { mode: "split",  Icon: SplitSquareHorizontal,  label: "Split"  },
  ] as const;

  const statusColor =
    engineStatus === "ready"     ? "var(--success)" :
    engineStatus === "rendering" ? "var(--warning)" :
    engineStatus === "error"     ? "var(--danger)"  : "var(--text-muted)";

  return (
    <header style={{
      height: 46,
      background: "var(--bg-panel)",
      borderBottom: "1px solid var(--border-soft)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 14px", gap: 10, flexShrink: 0, zIndex: 20,
    }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

      {/* ── Left ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 4 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: "linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, flexShrink: 0,
          }}>⬡</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            Bokeh Studio
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: "var(--border)" }} />

        <button onClick={() => fileRef.current?.click()} style={toolBtn}>
          <Upload size={13} /><span>Open</span>
        </button>
        <button
          onClick={onExport} disabled={!colorImage}
          style={{ ...toolBtn, background: colorImage ? "var(--accent)" : "var(--bg-elevated)", borderColor: colorImage ? "var(--accent)" : "var(--border)", color: colorImage ? "#fff" : "var(--text-muted)", opacity: 1 }}
        >
          <Download size={13} /><span>Export</span>
        </button>
      </div>

      {/* ── Center — view mode ── */}
      <div style={{ display: "flex", background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 7, padding: 2, gap: 1 }}>
        {views.map(({ mode, Icon, label }) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 5,
            background: viewMode === mode ? "var(--bg-elevated)" : "transparent",
            border: "none",
            color: viewMode === mode ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: 11, fontWeight: viewMode === mode ? 500 : 400,
            cursor: "pointer", transition: "all 0.12s",
            boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
          }}>
            <Icon size={12} /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Right ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

        {/* Engine switcher */}
        <div style={{ display: "flex", background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 7, padding: 2, gap: 1 }}>
          {ENGINES.map(({ id, label, title }) => (
            <button key={id} title={title} onClick={() => setRenderEngine(id)} style={{
              padding: "4px 9px", borderRadius: 5,
              background: renderEngine === id ? "var(--accent-subtle)" : "transparent",
              border: renderEngine === id ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
              color: renderEngine === id ? "var(--accent-bright)" : "var(--text-muted)",
              fontSize: 10, fontWeight: 500, cursor: "pointer",
              transition: "all 0.12s", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "var(--border)" }} />

        <button onClick={undo} disabled={!canUndo()} title="Undo" style={{ ...iconBtn, opacity: canUndo() ? 1 : 0.3 }}>
          <Undo2 size={14} />
        </button>
        <button onClick={redo} disabled={!canRedo()} title="Redo" style={{ ...iconBtn, opacity: canRedo() ? 1 : 0.3 }}>
          <Redo2 size={14} />
        </button>

        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: statusColor,
          boxShadow: engineStatus === "rendering" ? `0 0 0 3px ${statusColor}33` : "none",
          animation: engineStatus === "rendering" ? "pulse-dot 1.2s ease-in-out infinite" : "none",
        }} title={engineStatus} />
      </div>
    </header>
  );
}

const toolBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 6,
  background: "var(--bg-elevated)", border: "1px solid var(--border)",
  color: "var(--text-secondary)", fontSize: 12, cursor: "pointer",
  transition: "all 0.12s", whiteSpace: "nowrap",
};

const iconBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 6,
  background: "transparent", border: "1px solid transparent",
  color: "var(--text-muted)", cursor: "pointer", transition: "all 0.12s",
};

function syntheticDepth(d: ImageData): ImageData {
  const { width: w, height: h, data } = d;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x/w-0.5)*2, ny = (y/h-0.5)*2;
      const radial = 1 - Math.sqrt(nx*nx+ny*ny)*0.5;
      const i4 = (y*w+x)*4;
      const lum = (data[i4]*0.299+data[i4+1]*0.587+data[i4+2]*0.114)/255;
      const v = Math.round(Math.max(0,Math.min(1, radial*0.65+(1-lum)*0.35))*255);
      out[i4]=v; out[i4+1]=v; out[i4+2]=v; out[i4+3]=255;
    }
  }
  return new ImageData(out, w, h);
}
