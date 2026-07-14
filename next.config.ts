import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No COEP header — it blocks cross-origin requests to localhost Python server
};

export default nextConfig;
