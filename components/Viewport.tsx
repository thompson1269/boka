"use client";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { renderBokeh } from "@/lib/depth/depthApi";
import { Loader2 } from "lucide-react";

export function Viewport() {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef  = useRef<HTMLCanvasElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const renderingRef    = useRef(false);
  const pendingRef      = useRef(false);
  const latestParamsRef = useRef<string>("");
  const jsWorkerRef     = useRef<Worker | null>(null);   // shape JS worker
  const wasmWorkerRef   = useRef<Worker | null>(null);   // Rust/WASM worker

  const {
    params, colorImage, depthImage,
    setEngineStatus, engineStatus,
    viewMode, depthOverlayOpacity,
    isFocusPicking, setFocusFromDepth, setFocusPoint,
    isBrushActive, brushRadius, addBrushStroke,
    imageWidth, imageHeight,
    renderEngine,
  } = useEditorStore();

  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]       = useState(1);
  const [activeLabel, setActiveLabel] = useState("⬡ BokehMe");
  const [renderTime, setRenderTime]   = useState<number | null>(null);

  // Spawn persistent workers
  useEffect(() => {
    jsWorkerRef.current   = new Worker("/bokeh-worker.js");
    wasmWorkerRef.current = new Worker("/bokeh-wasm-worker.js", { type: "module" });
    return () => {
      jsWorkerRef.current?.terminate();
      wasmWorkerRef.current?.terminate();
    };
  }, []);

  // ── Helper: draw a worker result ─────────────────────────────
  const drawResult = useCallback((
    canvas: HTMLCanvasElement,
    out: Uint8ClampedArray,
    w: number,
    h: number,
    label: string,
    t0: number,
    paramsKey: string,
    retry: () => void,
  ) => {
    if (latestParamsRef.current !== paramsKey) {
      renderingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; retry(); }
      return;
    }
    canvas.width = w; canvas.height = h;
    const clamped = out instanceof Uint8ClampedArray ? out : new Uint8ClampedArray(out as unknown as ArrayBuffer);
    canvas.getContext("2d")?.putImageData(new ImageData(clamped, w, h), 0, 0);
    setActiveLabel(label);
    setRenderTime(Date.now() - t0);
    setEngineStatus("ready");
    renderingRef.current = false;
    if (pendingRef.current) { pendingRef.current = false; retry(); }
  }, [setEngineStatus]);

  // ── WASM worker render ────────────────────────────────────────
  const renderWithWasm = useCallback((
    canvas: HTMLCanvasElement,
    color: ImageData,
    depth: ImageData,
    p: typeof params,
    paramsKey: string,
    retry: () => void,
  ) => {
    const worker = wasmWorkerRef.current;
    if (!worker) return;
    const t0 = Date.now();

    worker.onmessage = (e: MessageEvent) => {
      const { type, out, message } = e.data;
      if (type === "error") {
        console.warn("WASM worker error:", message, "— falling back to JS worker");
        renderWithJsWorker(canvas, color, depth, p, paramsKey, retry);
        return;
      }
      // wasm-bindgen returns a plain Uint8Array/Array — coerce to Uint8ClampedArray
      const clamped = out instanceof Uint8ClampedArray
        ? out
        : new Uint8ClampedArray(out as ArrayBuffer | Uint8Array);
      drawResult(canvas, clamped, color.width, color.height, "⚡ Rust/WASM", t0, paramsKey, retry);
    };

    // Single-channel depth array (R channel only)
    const rgba = new Uint8ClampedArray(color.data);
    const dep  = new Uint8Array(color.width * color.height);
    for (let i = 0; i < dep.length; i++) dep[i] = depth.data[i * 4];

    worker.postMessage(
      { rgba, depth: dep, width: color.width, height: color.height, params: p, paramsKey },
      [rgba.buffer, dep.buffer],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawResult]);

  // ── JS shape worker render ────────────────────────────────────
  const renderWithJsWorker = useCallback((
    canvas: HTMLCanvasElement,
    color: ImageData,
    depth: ImageData,
    p: typeof params,
    paramsKey: string,
    retry: () => void,
  ) => {
    const worker = jsWorkerRef.current;
    if (!worker) return;
    const t0 = Date.now();

    worker.onmessage = (e: MessageEvent) => {
      const { out } = e.data as { out: Uint8ClampedArray };
      drawResult(canvas, out, color.width, color.height, "🔧 JS Worker", t0, paramsKey, retry);
    };

    const src = new Uint8ClampedArray(color.data);
    const dep = new Uint8ClampedArray(depth.data);
    worker.postMessage(
      { src, dep, width: color.width, height: color.height, params: p },
      [src.buffer, dep.buffer],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawResult]);

  // ── Main render coordinator ───────────────────────────────────
  const triggerRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !colorImage || !depthImage) return;
    if (renderingRef.current) { pendingRef.current = true; return; }

    const paramsKey = JSON.stringify({ params, renderEngine });
    latestParamsRef.current = paramsKey;
    renderingRef.current    = true;
    setEngineStatus("rendering");

    const retry = () => triggerRender();

    // ── WASM (Rust) engine ──────────────────────────────────────
    // WASM only does circular disc blur — route shaped apertures to JS worker
    if (renderEngine === "wasm") {
      const needsShape = params.apertureShape !== 0 || params.anamorphic > 1.1;
      if (needsShape) {
        renderWithJsWorker(canvas, colorImage, depthImage, params, paramsKey, retry);
      } else {
        renderWithWasm(canvas, colorImage, depthImage, params, paramsKey, retry);
      }
      return;
    }

    // ── JS shape worker (all aperture shapes) ──────────────────
    if (renderEngine === "worker") {
      renderWithJsWorker(canvas, colorImage, depthImage, params, paramsKey, retry);
      return;
    }

    // ── BokehMe AI server (circle only, falls back to JS worker for shapes) ────
    const t0 = Date.now();
    const needsShape = params.apertureShape !== 0 || params.anamorphic > 1.1;
    if (needsShape) {
      // BokehMe can't do shaped apertures — always use JS worker for shapes
      renderWithJsWorker(canvas, colorImage, depthImage, params, paramsKey, retry);
      return;
    }
    try {
      const result = await renderBokeh(colorImage, depthImage, {
        K:          params.aperture * 0.8,
        disp_focus: params.focalDistance,
        gamma:      Math.max(1, Math.min(5, params.bokehBoost * 1.2 + 1)),
        highlight:  params.bokehBoost > 0.5,
      });

      if (latestParamsRef.current !== paramsKey) {
        renderingRef.current = false;
        if (pendingRef.current) { pendingRef.current = false; retry(); }
        return;
      }

      if (result) {
        canvas.width  = result.width;
        canvas.height = result.height;
        canvas.getContext("2d")!.putImageData(result, 0, 0);
        setActiveLabel("⬡ BokehMe");
        setRenderTime(Date.now() - t0);
        setEngineStatus("ready");
        renderingRef.current = false;
        if (pendingRef.current) { pendingRef.current = false; retry(); }
      } else {
        // Server not running — fall through to WASM
        renderWithWasm(canvas, colorImage, depthImage, params, paramsKey, retry);
      }
    } catch {
      renderWithWasm(canvas, colorImage, depthImage, params, paramsKey, retry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorImage, depthImage, params, renderEngine, renderWithWasm, renderWithJsWorker]);

  // ── Depth visualization ───────────────────────────────────────
  const renderDepthCanvas = useCallback(() => {
    const canvas = depthCanvasRef.current;
    if (!canvas || !depthImage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h, data } = depthImage;
    canvas.width = w; canvas.height = h;
    const out = new Uint8ClampedArray(w * h * 4);
    const fd = params.focalDistance, fr = params.focalRange;
    for (let i = 0; i < w * h; i++) {
      const d = data[i * 4] / 255;
      const [r, g, b] = turbo(d);
      const inFocus = Math.abs(d - fd) <= fr;
      out[i*4]   = inFocus ? Math.min(255, r + 30) : Math.round(r * 0.75);
      out[i*4+1] = inFocus ? Math.min(255, g + 30) : Math.round(g * 0.75);
      out[i*4+2] = inFocus ? Math.min(255, b + 30) : Math.round(b * 0.75);
      out[i*4+3] = 255;
    }
    ctx.putImageData(new ImageData(out, w, h), 0, 0);
    ctx.fillStyle = "rgba(74,255,136,0.12)";
    for (let y = 0; y < h; y += 2)
      for (let x = 0; x < w; x += 2)
        if (Math.abs(data[(y*w+x)*4]/255 - fd) <= fr * 0.6) ctx.fillRect(x, y, 2, 2);
    const lgH = Math.floor(h * 0.5), lgY = Math.floor(h * 0.25), lgX = w - 14;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(lgX - 3, lgY - 16, 18, lgH + 32);
    for (let i = 0; i < lgH; i++) {
      const [r, g, b] = turbo(1 - i / lgH);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(lgX, lgY + i, 10, 1);
    }
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "9px monospace";
    ctx.fillText("N", lgX, lgY - 4);
    ctx.fillText("F", lgX, lgY + lgH + 10);
  }, [depthImage, params.focalDistance, params.focalRange]);

  // Re-render on any param/image/engine change
  useEffect(() => {
    if (!colorImage || !depthImage) return;
    triggerRender();
    renderDepthCanvas();
  }, [colorImage, depthImage, params, renderEngine, triggerRender, renderDepthCanvas]);

  useEffect(() => {
    useEditorStore.getState().setIsWebGPU(false);
    setEngineStatus("ready");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit image to container
  useEffect(() => {
    function updateScale() {
      if (!containerRef.current || !imageWidth || !imageHeight) return;
      setScale(Math.min(
        (containerRef.current.clientWidth  - 40) / imageWidth,
        (containerRef.current.clientHeight - 40) / imageHeight,
        1,
      ));
    }
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imageWidth, imageHeight]);

  // ── Interaction handlers ──────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isFocusPicking) { handleFocusPick(e); return; }
    if (isBrushActive)  { handleBrushPaint(e); return; }
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocusPicking, isBrushActive, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    if (isBrushActive && e.buttons === 1) handleBrushPaint(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dragStart, isBrushActive]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleWheel   = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(5, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  function getImageCoords(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { normalizedX: 0.5, normalizedY: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      normalizedX: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      normalizedY: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    };
  }

  function handleFocusPick(e: React.MouseEvent) {
    if (!depthImage) return;
    const { normalizedX, normalizedY } = getImageCoords(e);
    const px = Math.floor(normalizedX * depthImage.width);
    const py = Math.floor(normalizedY * depthImage.height);
    setFocusFromDepth(depthImage.data[(py * depthImage.width + px) * 4] / 255);
    setFocusPoint({ x: normalizedX, y: normalizedY });
  }

  function handleBrushPaint(e: React.MouseEvent) {
    const { normalizedX, normalizedY } = getImageCoords(e);
    addBrushStroke({ x: normalizedX, y: normalizedY, radius: brushRadius, depth: 0, mode: "focus" });
  }

  const hasImage    = !!(colorImage && depthImage);
  const displayW    = imageWidth  * scale * zoom;
  const displayH    = imageHeight * scale * zoom;
  const isRendering = engineStatus === "rendering";

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, position: "relative", overflow: "hidden",
        background: "#0d0d0d",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: isFocusPicking ? "crosshair" : isBrushActive ? "none" : isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Empty state */}
      {!hasImage && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, pointerEvents:"none", userSelect:"none" }}>
          <div style={{ fontSize:56, opacity:0.08 }}>⬡</div>
          <div style={{ fontSize:15, color:"#555", fontWeight:500 }}>Drop an image to begin</div>
          <div style={{ fontSize:11, color:"#333" }}>JPG · PNG · WEBP — or use Open in the toolbar</div>
        </div>
      )}

      {hasImage && (
        <div style={{
          position:"relative", flexShrink:0,
          width: displayW, height: displayH,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        }}>
          {/* Bokeh result canvas */}
          <canvas ref={canvasRef} style={{
            width:"100%", height:"100%", display:"block",
            position:"absolute", inset:0,
            opacity: viewMode === "result" || viewMode === "split" ? 1 : 0,
            transition: "opacity 0.2s",
          }} />

          {/* Depth overlay */}
          {viewMode === "result" && depthOverlayOpacity > 0 && (
            <canvas ref={depthCanvasRef} style={{
              width:"100%", height:"100%", display:"block",
              position:"absolute", inset:0,
              opacity: depthOverlayOpacity, mixBlendMode:"screen", pointerEvents:"none",
            }} />
          )}

          {/* Depth full view */}
          {viewMode === "depth" && (
            <canvas ref={depthCanvasRef} style={{ width:"100%", height:"100%", display:"block", position:"absolute", inset:0 }} />
          )}

          {/* Split view */}
          {viewMode === "split" && (
            <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
              <div style={{ position:"absolute", left:0, top:0, width:"50%", height:"100%", overflow:"hidden" }}>
                <canvas ref={depthCanvasRef} style={{ width: displayW, height:"100%", position:"absolute", left:0, top:0 }} />
              </div>
              <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:2, background:"rgba(255,255,255,0.25)" }} />
              <div style={{ position:"absolute", left:8,  top:8, fontSize:10, color:"rgba(255,255,255,0.6)", background:"rgba(0,0,0,0.5)", padding:"2px 6px", borderRadius:3 }}>Depth</div>
              <div style={{ position:"absolute", right:8, top:8, fontSize:10, color:"rgba(255,255,255,0.6)", background:"rgba(0,0,0,0.5)", padding:"2px 6px", borderRadius:3 }}>Bokeh</div>
            </div>
          )}

          {viewMode === "depth" && (
            <div style={{ position:"absolute", top:10, left:10, fontSize:11, color:"rgba(255,255,255,0.7)", background:"rgba(0,0,0,0.6)", padding:"3px 8px", borderRadius:4, pointerEvents:"none" }}>
              🎨 Depth Anything V2
            </div>
          )}

          <FocusPointOverlay />
        </div>
      )}

      {/* Rendering spinner */}
      {isRendering && (
        <div style={{
          position:"absolute", top:12, right:60,
          background:"rgba(0,0,0,0.8)", borderRadius:6,
          padding:"6px 12px", color:"#4a9eff",
          display:"flex", alignItems:"center", gap:6, fontSize:11,
          boxShadow:"0 2px 8px rgba(0,0,0,0.4)",
        }}>
          <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          rendering…
        </div>
      )}

      {/* Engine badge */}
      <div style={{
        position:"absolute", bottom:12, left:12,
        background:"rgba(0,0,0,0.5)", border:"1px solid #222",
        borderRadius:4, padding:"2px 8px", fontSize:10,
        color: activeLabel.startsWith("⬡") ? "#4a9eff" : activeLabel.startsWith("⚡") ? "#4aff88" : "#888",
        display:"flex", alignItems:"center", gap:5,
      }}>
        {activeLabel}
        {renderTime != null && !isRendering && <span style={{ color:"#444" }}>{renderTime}ms</span>}
      </div>

      {hasImage && (
        <div style={{ position:"absolute", bottom:12, right:12, background:"rgba(0,0,0,0.5)", border:"1px solid #222", borderRadius:4, padding:"2px 7px", fontSize:10, color:"#444" }}>
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
}

function FocusPointOverlay() {
  const { focusPoint } = useEditorStore();
  if (!focusPoint) return null;
  return (
    <div style={{ position:"absolute", left:`${focusPoint.x*100}%`, top:`${focusPoint.y*100}%`, transform:"translate(-50%,-50%)", pointerEvents:"none" }}>
      <div style={{ width:28, height:28, borderRadius:"50%", border:"2px solid #4aff88", boxShadow:"0 0 0 1px rgba(0,0,0,0.5),0 0 8px rgba(74,255,136,0.5)" }} />
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:4, height:4, borderRadius:"50%", background:"#4aff88" }} />
    </div>
  );
}

function turbo(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 0.1357+t*(4.6154-t*(42.666-t*(132.13-t*(152.94-t*59.29))))));
  const g = Math.max(0, Math.min(1, 0.0914+t*(2.1942+t*(4.843-t*(14.185+t*(4.277-t*2.83))))));
  const b = Math.max(0, Math.min(1, 0.1067+t*(12.642-t*(60.582-t*(110.36-t*(89.903-t*27.35))))));
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}
