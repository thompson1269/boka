"use client";
import React from "react";
import { Clock } from "lucide-react";
import { useEditorStore } from "@/lib/store/useEditorStore";

export function HistoryPanel() {
  const { history, historyIndex, undo, redo } = useEditorStore();
  if (history.length === 0) return null;

  return (
    <aside style={{
      width: 156, minWidth: 156,
      background: "var(--bg-panel)",
      borderRight: "1px solid var(--border-soft)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "11px 12px 9px",
        fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.7px",
        borderBottom: "1px solid var(--border-soft)", flexShrink: 0,
      }}>
        <Clock size={10} />
        <span>History</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "3px 0" }}>
        {[...history].reverse().map((entry, i) => {
          const realIndex = history.length - 1 - i;
          const isCurrent = realIndex === historyIndex;
          const isFuture  = realIndex > historyIndex;
          return (
            <button
              key={entry.timestamp}
              onClick={() => {
                const diff = realIndex - historyIndex;
                if (diff < 0) for (let j = 0; j < -diff; j++) undo();
                else for (let j = 0; j < diff; j++) redo();
              }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", padding: "6px 12px",
                background: isCurrent ? "var(--accent-subtle)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${isCurrent ? "var(--accent)" : "transparent"}`,
                color: isCurrent ? "var(--text-primary)" : "var(--text-muted)",
                opacity: isFuture ? 0.3 : 1,
                cursor: "pointer", textAlign: "left",
                transition: "all 0.1s",
                fontSize: 11,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.label}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 9, marginLeft: 4, flexShrink: 0 }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
