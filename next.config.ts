import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/uploader",
        permanent: false,
      },
      {
        source: "/template",
        destination: "/uploader/template",
        permanent: true,
      },
      {
        source: "/template/:path*",
        destination: "/uploader/template/:path*",
        permanent: true,
      },
      {
        source: "/riwayat",
        destination: "/uploader/riwayat",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
