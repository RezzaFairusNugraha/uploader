import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {};

export default nextConfig;
