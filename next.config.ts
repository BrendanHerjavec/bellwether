import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. There is a stray package-lock.json further up the
    // user's home directory, and without this Turbopack infers that as the root
    // and warns on every start.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
