"use client";
import React from "react";
import { Clock } from "lucide-react";
import { useEditorStore } from "@/lib/store/useEditorStore";

export function HistoryPanel() {
  const { history, historyIndex } = useEditorStore();
  if (history.length === 0) return null;

  return (
    <div style={{
      width: 160, background: "#1a1a1a",
      borderRight: "1px solid #2a2a2a",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "10px 12px 6px", fontSize: 10, fontWeight: 600,
        color: "#555", textTransform: "uppercase", letterSpacing: "0.8px",
        borderBottom: "1px solid #2a2a2a", flexShrink: 0,
      }}>
        <Clock size={11} />
        <span>History</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {[...history].reverse().map((entry, i) => {
          const realIndex = history.length - 1 - i;
          const isCurrent = realIndex === historyIndex;
          const isFuture = realIndex > historyIndex;
          return (
            <div
              key={entry.timestamp}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "5px 12px", fontSize: 10,
                color: isCurrent ? "#e8e8e8" : "#555",
                background: isCurrent ? "rgba(74,158,255,0.08)" : "transparent",
                opacity: isFuture ? 0.35 : 1,
                cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.label}
              </span>
              <span style={{ color: "#444", fontSize: 9, marginLeft: 4 }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
