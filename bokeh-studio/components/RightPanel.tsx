"use client";
import React from "react";
import { useEditorStore } from "@/lib/store/useEditorStore";
import { LensPanel } from "./panels/LensPanel";
import { DepthPanel } from "./panels/DepthPanel";
import { AdvancedPanel } from "./panels/AdvancedPanel";

const tabs = [
  { id: "lens",     label: "Lens" },
  { id: "depth",    label: "Depth" },
  { id: "advanced", label: "Advanced" },
] as const;

export function RightPanel() {
  const { activeTab, setActiveTab } = useEditorStore();

  return (
    <div style={{
      width: 240, minWidth: 240,
      background: "#1e1e1e", borderLeft: "1px solid #2a2a2a",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: "10px 4px",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? "#4a9eff" : "transparent"}`,
              color: activeTab === tab.id ? "#4a9eff" : "#555",
              fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.12s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {activeTab === "lens"     && <LensPanel />}
        {activeTab === "depth"    && <DepthPanel />}
        {activeTab === "advanced" && <AdvancedPanel />}
      </div>
    </div>
  );
}
