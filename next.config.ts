import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent directory otherwise wins root detection,
  // which breaks resolution of this project's own node_modules.
  turbopack: { root: __dirname },
  // The MongoDB driver loads optional native/dynamic deps at runtime, so it
  // must stay outside the server bundle.
  serverExternalPackages: ["mongodb"],
};

export default nextConfig;
