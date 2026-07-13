"use client";
import React, { useCallback, useRef } from "react";
import { Toolbar } from "@/components/Toolbar";
import { Viewport } from "@/components/Viewport";
import { RightPanel } from "@/components/RightPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { useEditorStore } from "@/lib/store/useEditorStore";

export default function BokehStudio() {
  const { colorImage, history } = useEditorStore();
  const showHistory = history.length > 1;

  const handleExport = useCallback(async () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.95)
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bokeh-studio-export-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback for WebGPU canvas (not always readable via toBlob)
      const link = document.createElement("a");
      link.download = "bokeh-studio-export.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
  }, []);

  return (
    <div className="app-shell">
      <Toolbar onExport={handleExport} />

      <div className="workspace">
        {showHistory && <HistoryPanel />}
        <Viewport />
        <RightPanel />
      </div>

      {/* Drop overlay */}
      <DropZone />

      <style jsx>{`
        .app-shell {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #111;
          overflow: hidden;
        }
        .workspace {
          flex: 1;
          display: flex;
          overflow: hidden;
          min-height: 0;
        }
      `}</style>
    </div>
  );
}

// Global drag-and-drop handler
function DropZone() {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragCount = useRef(0);
  const { setColorImage, setDepthImage, setEngineStatus } = useEditorStore();

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current--;
    if (dragCount.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const MAX = 2048;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const colorData = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);

      setColorImage(colorData, file.name);
      setEngineStatus("rendering");

      // Synthetic depth map
      const depth = generateSyntheticDepth(colorData);
      setDepthImage(depth);
    };
    img.src = url;
  };

  return (
    <div
      className={`drop-overlay ${isDragging ? "active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-message">
          <div className="drop-icon">⬢</div>
          <div className="drop-text">Drop to open</div>
        </div>
      )}

      <style jsx>{`
        .drop-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 100;
          transition: background 0.15s;
        }
        .drop-overlay.active {
          pointer-events: all;
          background: rgba(74, 158, 255, 0.12);
          border: 3px solid rgba(74, 158, 255, 0.5);
        }
        .drop-message {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .drop-icon {
          font-size: 64px;
          opacity: 0.6;
          color: #4a9eff;
        }
        .drop-text {
          font-size: 24px;
          font-weight: 600;
          color: #4a9eff;
        }
      `}</style>
    </div>
  );
}

function generateSyntheticDepth(colorData: ImageData): ImageData {
  const { width, height, data } = colorData;
  const depth = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.5) * 2;
      const radial = 1 - Math.sqrt(nx * nx + ny * ny) * 0.5;
      const idx4 = (y * width + x) * 4;
      const lum = (data[idx4] * 0.299 + data[idx4 + 1] * 0.587 + data[idx4 + 2] * 0.114) / 255;
      const d = Math.max(0, Math.min(1, radial * 0.65 + (1 - lum) * 0.35));
      const val = Math.round(d * 255);
      depth[idx4] = val;
      depth[idx4 + 1] = val;
      depth[idx4 + 2] = val;
      depth[idx4 + 3] = 255;
    }
  }
  return new ImageData(depth, width, height);
}
