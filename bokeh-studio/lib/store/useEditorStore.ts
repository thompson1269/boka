// ============================================================
// Bokeh Studio — Editor State (Zustand)
// MVVM-style state with full undo/redo history.
// Non-destructive: original images are never modified.
// ============================================================

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { DEFAULT_LENS_PARAMS, type LensParams } from "@/lib/engine/BokehEngine";

export type ApertureShape =
  | "circle"
  | "hex"
  | "octagon"
  | "pentagon"
  | "star"
  | "anamorphic";

export const APERTURE_SHAPES: { id: ApertureShape; label: string; blades: number }[] = [
  { id: "circle",    label: "Circle",    blades: 0  },
  { id: "hex",       label: "Hexagon",   blades: 6  },
  { id: "octagon",   label: "Octagon",   blades: 8  },
  { id: "pentagon",  label: "Pentagon",  blades: 5  },
  { id: "star",      label: "Star",      blades: 10 },
  { id: "anamorphic",label: "Anamorphic",blades: 0  },
];

export type PanelTab = "lens" | "depth" | "advanced";
export type ViewMode = "result" | "depth" | "split";
export type EngineStatus = "idle" | "initializing" | "ready" | "rendering" | "error";

export interface HistoryEntry {
  params: LensParams;
  timestamp: number;
  label: string;
}

export interface BrushStroke {
  x: number;
  y: number;
  radius: number;
  depth: number;
  mode: "focus" | "blur";
}

interface EditorState {
  // Images
  colorImage:    ImageData | null;
  depthImage:    ImageData | null;
  sourceFileName: string;
  imageWidth:    number;
  imageHeight:   number;

  // Lens parameters
  params: LensParams;

  // UI State
  activeTab:     PanelTab;
  viewMode:      ViewMode;
  engineStatus:  EngineStatus;
  renderProgress: number;
  isWebGPU:      boolean;

  // Focus point picking
  isFocusPicking: boolean;
  focusPoint:     { x: number; y: number } | null;

  // Brush tool
  isBrushActive:  boolean;
  brushRadius:    number;
  brushStrokes:   BrushStroke[];

  // History (undo/redo)
  history:        HistoryEntry[];
  historyIndex:   number;

  // Depth visualization
  showDepthOverlay: boolean;
  depthOverlayOpacity: number;

  // Actions
  setColorImage:   (img: ImageData, filename: string) => void;
  setDepthImage:   (img: ImageData) => void;
  setParam:        (key: keyof LensParams, value: number, label?: string) => void;
  setParams:       (params: Partial<LensParams>, label?: string) => void;
  setApertureShape:(shape: ApertureShape) => void;
  setActiveTab:    (tab: PanelTab) => void;
  setViewMode:     (mode: ViewMode) => void;
  setEngineStatus: (status: EngineStatus, progress?: number) => void;
  setIsWebGPU:     (v: boolean) => void;
  setFocusPicking: (v: boolean) => void;
  setFocusPoint:   (pt: { x: number; y: number } | null) => void;
  setFocusFromDepth:(depth: number) => void;
  setBrushActive:  (v: boolean) => void;
  setBrushRadius:  (r: number) => void;
  addBrushStroke:  (stroke: BrushStroke) => void;
  clearBrushStrokes:() => void;
  setShowDepthOverlay:(v: boolean) => void;
  setDepthOverlayOpacity:(v: number) => void;
  undo:            () => void;
  redo:            () => void;
  resetParams:     () => void;
  canUndo:         () => boolean;
  canRedo:         () => boolean;
}

const MAX_HISTORY = 50;

function cloneParams(p: LensParams): LensParams {
  return { ...p };
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    colorImage:    null,
    depthImage:    null,
    sourceFileName: "",
    imageWidth:    0,
    imageHeight:   0,

    params:        cloneParams(DEFAULT_LENS_PARAMS),

    activeTab:     "lens",
    viewMode:      "result",
    engineStatus:  "idle",
    renderProgress: 0,
    isWebGPU:      false,

    isFocusPicking: false,
    focusPoint:     null,

    isBrushActive:  false,
    brushRadius:    40,
    brushStrokes:   [],

    history:       [],
    historyIndex:  -1,

    showDepthOverlay: false,
    depthOverlayOpacity: 0.5,

    setColorImage: (img, filename) =>
      set({ colorImage: img, sourceFileName: filename, imageWidth: img.width, imageHeight: img.height }),

    setDepthImage: (img) =>
      set({ depthImage: img }),

    setParam: (key, value, label) => {
      const current = get().params;
      const next = { ...current, [key]: value };
      pushHistory(set, get, next, label ?? `Adjust ${key}`);
      set({ params: next });
    },

    setParams: (partial, label) => {
      const current = get().params;
      const next = { ...current, ...partial };
      pushHistory(set, get, next, label ?? "Adjust");
      set({ params: next });
    },

    setApertureShape: (shape) => {
      const found = APERTURE_SHAPES.find((s) => s.id === shape);
      if (!found) return;
      const current = get().params;
      const next = {
        ...current,
        apertureShape: found.blades,
        anamorphic: shape === "anamorphic" ? 2.5 : 1.0,
      };
      pushHistory(set, get, next, `Aperture: ${found.label}`);
      set({ params: next });
    },

    setActiveTab:    (activeTab) => set({ activeTab }),
    setViewMode:     (viewMode)  => set({ viewMode }),
    setEngineStatus: (engineStatus, renderProgress = 0) => set({ engineStatus, renderProgress }),
    setIsWebGPU:     (isWebGPU) => set({ isWebGPU }),

    setFocusPicking: (isFocusPicking) => set({ isFocusPicking }),
    setFocusPoint:   (focusPoint) => set({ focusPoint }),

    setFocusFromDepth: (depth) => {
      const current = get().params;
      const next = { ...current, focalDistance: Math.max(0.01, Math.min(0.99, depth)) };
      pushHistory(set, get, next, "Set Focus Point");
      set({ params: next, isFocusPicking: false });
    },

    setBrushActive:   (isBrushActive) => set({ isBrushActive }),
    setBrushRadius:   (brushRadius) => set({ brushRadius }),

    addBrushStroke: (stroke) =>
      set((state) => ({ brushStrokes: [...state.brushStrokes, stroke] })),

    clearBrushStrokes: () => set({ brushStrokes: [] }),

    setShowDepthOverlay: (showDepthOverlay) => set({ showDepthOverlay }),
    setDepthOverlayOpacity: (depthOverlayOpacity) => set({ depthOverlayOpacity }),

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const newIndex = historyIndex - 1;
      set({ params: cloneParams(history[newIndex].params), historyIndex: newIndex });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const newIndex = historyIndex + 1;
      set({ params: cloneParams(history[newIndex].params), historyIndex: newIndex });
    },

    resetParams: () => {
      const next = cloneParams(DEFAULT_LENS_PARAMS);
      pushHistory(set, get, next, "Reset");
      set({ params: next });
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,
  }))
);

function pushHistory(
  set: (s: Partial<EditorState>) => void,
  get: () => EditorState,
  params: LensParams,
  label: string
) {
  const { history, historyIndex } = get();
  const truncated = history.slice(0, historyIndex + 1);
  const entry: HistoryEntry = { params: cloneParams(params), timestamp: Date.now(), label };
  const next = [...truncated, entry].slice(-MAX_HISTORY);
  set({ history: next, historyIndex: next.length - 1 });
}
