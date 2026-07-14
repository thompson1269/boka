"use client";
import React from "react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { LensPanel } from "./panels/LensPanel";
import { DepthPanel } from "./panels/DepthPanel";
import { AdvancedPanel } from "./panels/AdvancedPanel";

const tabs = [
  { id: "lens",     label: "Lens"     },
  { id: "depth",    label: "Depth"    },
  { id: "advanced", label: "Advanced" },
] as const;

export function RightPanel() {
  const { activeTab, setActiveTab } = useEditorStore();

  return (
    <aside style={{
      width: 252, minWidth: 252,
      background: "var(--bg-panel)",
      borderLeft: "1px solid var(--border-soft)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        background: "var(--bg-app)",
        borderBottom: "1px solid var(--border-soft)",
        padding: "0 4px",
        flexShrink: 0,
      }}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              flex: 1, padding: "11px 4px",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === id ? "var(--accent)" : "transparent"}`,
              color: activeTab === id ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 11, fontWeight: activeTab === id ? 600 : 400,
              cursor: "pointer", transition: "all 0.12s", letterSpacing: "0.1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px" }}>
        {activeTab === "lens"     && <LensPanel />}
        {activeTab === "depth"    && <DepthPanel />}
        {activeTab === "advanced" && <AdvancedPanel />}
      </div>
    </aside>
  );
}
