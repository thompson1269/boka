"use client";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { BokehEngine } from "@/lib/engine/BokehEngine";
import { Canvas2DFallback } from "@/lib/engine/Canvas2DFallback";
import { Loader2 } from "lucide-react";

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BokehEngine | null>(null);
  const fallbackRef = useRef<Canvas2DFallback | null>(null);
  const rafRef = useRef<number>(0);
  const pendingRender = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    params, colorImage, depthImage,
    engineStatus, setEngineStatus, setIsWebGPU,
    isFocusPicking, setFocusFromDepth, setFocusPoint,
    showDepthOverlay, depthOverlayOpacity,
    isBrushActive, brushRadius, addBrushStroke,
    imageWidth, imageHeight,
  } = useEditorStore();

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    async function init() {
      const engine = new BokehEngine(canvas!, (status) => {
        setEngineStatus(status as any);
      });
      const success = await engine.init();
      if (success) {
        engineRef.current = engine;
        setIsWebGPU(true);
      } else {
        const fallback = new Canvas2DFallback(canvas!);
        fallbackRef.current = fallback;
        setIsWebGPU(false);
        setEngineStatus("ready");
      }
    }
    init();
    return () => {
      engineRef.current?.destroy();
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load images
  useEffect(() => {
    if (!colorImage || !depthImage) return;
    async function load() {
      if (engineRef.current) {
        await engineRef.current.loadImages(colorImage!, depthImage!);
      } else if (fallbackRef.current) {
        fallbackRef.current.loadImages(colorImage!, depthImage!);
      }
      triggerRender();
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorImage, depthImage]);

  // Render on param changes
  useEffect(() => {
    if (!colorImage || !depthImage) return;
    triggerRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function triggerRender() {
    if (pendingRender.current) return;
    pendingRender.current = true;
    rafRef.current = requestAnimationFrame(async () => {
      pendingRender.current = false;
      const p = useEditorStore.getState().params;
      if (engineRef.current) {
        await engineRef.current.render(p);
      } else if (fallbackRef.current) {
        fallbackRef.current.render(p);
      }
    });
  }

  // Fit to container
  useEffect(() => {
    function updateScale() {
      if (!containerRef.current || !imageWidth || !imageHeight) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const scaleX = (clientWidth - 40) / imageWidth;
      const scaleY = (clientHeight - 40) / imageHeight;
      setScale(Math.min(scaleX, scaleY, 1));
    }
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imageWidth, imageHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isFocusPicking) { handleFocusPick(e); return; }
    if (isBrushActive) { handleBrushPaint(e); return; }
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocusPicking, isBrushActive, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && !isFocusPicking && !isBrushActive) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    if (isBrushActive && e.buttons === 1) handleBrushPaint(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dragStart, isFocusPicking, isBrushActive]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.1, Math.min(5, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  function getImageCoords(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { normalizedX: 0, normalizedY: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      normalizedX: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      normalizedY: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleFocusPick(e: React.MouseEvent) {
    if (!depthImage) return;
    const { normalizedX, normalizedY } = getImageCoords(e);
    const px = Math.floor(normalizedX * depthImage.width);
    const py = Math.floor(normalizedY * depthImage.height);
    const depthVal = depthImage.data[(py * depthImage.width + px) * 4] / 255;
    setFocusFromDepth(depthVal);
    setFocusPoint({ x: normalizedX, y: normalizedY });
  }

  function handleBrushPaint(e: React.MouseEvent) {
    const { normalizedX, normalizedY } = getImageCoords(e);
    addBrushStroke({ x: normalizedX, y: normalizedY, radius: brushRadius, depth: 0, mode: "focus" });
  }

  const displayW = imageWidth * scale * zoom;
  const displayH = imageHeight * scale * zoom;
  const isLoading = engineStatus === "initializing" || engineStatus === "rendering";
  const hasImage = colorImage && depthImage;
  const isWebGPU = useEditorStore.getState().isWebGPU;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, position: "relative", overflow: "hidden",
        background: "#111", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: isFocusPicking ? "crosshair" : isBrushActive ? "none" : isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Drop zone hint */}
      {!hasImage && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none", userSelect: "none" }}>
          <div style={{ fontSize: 48, opacity: 0.1 }}>⬢</div>
          <div style={{ fontSize: 16, color: "#555", fontWeight: 500 }}>Drop an image to begin</div>
          <div style={{ fontSize: 12, color: "#333" }}>JPG · PNG · WEBP · drag & drop or use Open</div>
        </div>
      )}

      {/* Canvas */}
      <div style={{
        position: "relative",
        flexShrink: 0,
        width: displayW || 0,
        height: displayH || 0,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        display: hasImage ? "block" : "none",
      }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        {showDepthOverlay && depthImage && (
          <DepthOverlay depthImage={depthImage} opacity={depthOverlayOpacity} />
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          background: "rgba(0,0,0,0.7)", borderRadius: 6,
          padding: "6px 8px", color: "#4a9eff", display: "flex", alignItems: "center",
        }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Engine + zoom badges */}
      <div style={{
        position: "absolute", bottom: 12, left: 12,
        background: "rgba(0,0,0,0.6)", border: "1px solid #2a2a2a",
        borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#555",
      }}>
        {isWebGPU ? "WebGPU" : "Canvas2D"}
      </div>
      {hasImage && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(0,0,0,0.6)", border: "1px solid #2a2a2a",
          borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#555",
        }}>
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
}

function DepthOverlay({ depthImage, opacity }: { depthImage: ImageData; opacity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = depthImage.width;
    canvas.height = depthImage.height;
    const out = new ImageData(depthImage.width, depthImage.height);
    for (let i = 0; i < depthImage.width * depthImage.height; i++) {
      const d = depthImage.data[i * 4] / 255;
      const [r, g, b] = turbo(d);
      out.data[i * 4]     = r;
      out.data[i * 4 + 1] = g;
      out.data[i * 4 + 2] = b;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }, [depthImage]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      opacity, pointerEvents: "none", mixBlendMode: "screen",
    }} />
  );
}

function turbo(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 0.1357 + t * (4.6154 - t * (42.666 - t * (132.13 - t * (152.94 - t * 59.29))))));
  const g = Math.max(0, Math.min(1, 0.0914 + t * (2.1942 + t * (4.843  - t * (14.185 + t * (4.277  - t * 2.83))))));
  const b = Math.max(0, Math.min(1, 0.1067 + t * (12.642 - t * (60.582 - t * (110.36 - t * (89.903 - t * 27.35))))));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
