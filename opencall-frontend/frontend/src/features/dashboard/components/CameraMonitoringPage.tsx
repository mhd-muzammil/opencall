"use client";

import { Cctv } from "lucide-react";

/**
 * Camera Monitoring: the section the office's camera system is being added to.
 * SUPER_ADMIN only (page.tsx decides that). No camera is connected yet, so it
 * says so and asks the server for nothing.
 */
export function CameraMonitoringPage() {
  return (
    <section style={{ padding: "8px 4px", minWidth: 0, maxWidth: "100%" }}>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Camera Monitoring</h2>
        <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
          Cameras connected to OpenCall will show here.
        </p>
      </div>
      <div
        role="status"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          padding: "48px 16px",
          border: "1px dashed #d1d5db",
          borderRadius: "12px",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        <Cctv size={32} strokeWidth={1.75} aria-hidden="true" />
        <strong style={{ color: "#374151", fontSize: "14px" }}>No cameras connected yet</strong>
      </div>
    </section>
  );
}
