import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// Next.js resolves env files from the app directory. During local monorepo
// development, also load the shared root env without overriding variables
// injected by the runtime (for example, by Coolify).
dotenv.config({
  path: [path.join(import.meta.dirname, "../../.env.local"), path.join(import.meta.dirname, "../../.env")],
});

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@heyvera/config", "@heyvera/core", "@heyvera/db"],
};

export default nextConfig;
