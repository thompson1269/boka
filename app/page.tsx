"use client";
import React, { useCallback, useRef, useState } from "react";
import { Toolbar } from "@/components/Toolbar";
import { Viewport } from "@/components/Viewport";
import { RightPanel } from "@/components/RightPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { estimateDepth } from "@/lib/depth/depthApi";

export default function BokehStudio() {
  const { history } = useEditorStore();
  const showHistory = history.length > 1;

  const handleExport = useCallback(async () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `bokeh-export-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", background: "#111", overflow: "hidden",
    }}>
      <Toolbar onExport={handleExport} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {showHistory && <HistoryPanel />}
        <Viewport />
        <RightPanel />
      </div>
      <DropZone />
    </div>
  );
}

function DropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const dragCount = useRef(0);
  const { setColorImage, setDepthImage, setEngineStatus } = useEditorStore();

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCount.current++; setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCount.current--; if (dragCount.current === 0) setIsDragging(false); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    loadImageFile(file, setColorImage, setDepthImage, setEngineStatus);
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        pointerEvents: isDragging ? "all" : "none",
        background: isDragging ? "rgba(74,158,255,0.1)" : "transparent",
        border: isDragging ? "3px solid rgba(74,158,255,0.5)" : "3px solid transparent",
        transition: "all 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {isDragging && (
        <div style={{ textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 64, color: "#4a9eff", opacity: 0.7 }}>⬡</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "#4a9eff" }}>Drop to open</div>
        </div>
      )}
    </div>
  );
}

export async function loadImageFile(
  file: File,
  setColorImage: (d: ImageData, name: string) => void,
  setDepthImage: (d: ImageData) => void,
  setEngineStatus: (s: any) => void
) {
  const url = URL.createObjectURL(file);
  const img = new window.Image();

  img.onload = async () => {
    const MAX = 1200;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      const r = Math.min(MAX / w, MAX / h);
      w = Math.floor(w * r); h = Math.floor(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const colorData = ctx.getImageData(0, 0, w, h);
    URL.revokeObjectURL(url);

    // Show image immediately with synthetic depth
    setColorImage(colorData, file.name);
    setEngineStatus("rendering");

    // Start with fast synthetic depth so image shows right away
    const synth = syntheticDepth(colorData);
    setDepthImage(synth);

    // Then fetch real AI depth in background
    try {
      setEngineStatus("rendering");
      const aiDepth = await estimateDepth(colorData);
      setDepthImage(aiDepth);
    } catch (e) {
      console.warn("AI depth failed, keeping synthetic:", e);
    }
  };

  img.src = url;
}

function syntheticDepth(colorData: ImageData): ImageData {
  const { width: w, height: h, data } = colorData;
  const depth = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w - 0.5) * 2, ny = (y / h - 0.5) * 2;
      const radial = 1 - Math.sqrt(nx * nx + ny * ny) * 0.5;
      const i4 = (y * w + x) * 4;
      const lum = (data[i4] * 0.299 + data[i4+1] * 0.587 + data[i4+2] * 0.114) / 255;
      const val = Math.round(Math.max(0, Math.min(1, radial * 0.65 + (1 - lum) * 0.35)) * 255);
      depth[i4] = val; depth[i4+1] = val; depth[i4+2] = val; depth[i4+3] = 255;
    }
  }
  return new ImageData(depth, w, h);
}
