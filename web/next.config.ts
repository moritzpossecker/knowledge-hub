import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
