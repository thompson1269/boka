import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bokeh Studio — Lightroom-quality Lens Blur",
  description: "WebGPU-powered bokeh engine with Depth Anything V2 depth estimation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%", overflow: "hidden" }}>
      <body style={{ height: "100%", overflow: "hidden", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
