import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent directory otherwise wins root detection,
  // which breaks resolution of this project's own node_modules.
  turbopack: { root: __dirname },
  // The MongoDB driver loads optional native/dynamic deps at runtime, so it
  // must stay outside the server bundle.
  serverExternalPackages: ["mongodb"],
  experimental: {
    // Something on this machine deletes .sst files out of
    // .next/dev/cache/turbopack mid-run (antivirus scanning Downloads is the
    // usual suspect), and turbo-tasks aborts the process when a restore fails.
    // ponytail: costs a cold start each `next dev`; re-enable once the project
    // lives outside a scanned directory.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
