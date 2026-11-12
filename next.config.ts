import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/uploader",
        destination: "/",
        permanent: true,
      },
      {
        source: "/uploader/template",
        destination: "/template",
        permanent: true,
      },
      {
        source: "/uploader/template/:path*",
        destination: "/template/:path*",
        permanent: true,
      },
      {
        source: "/uploader/riwayat",
        destination: "/riwayat",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
