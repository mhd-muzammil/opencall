import path from "node:path";

const shouldUseStandaloneOutput =
  process.env.VERCEL !== "1" && process.platform !== "win32";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(shouldUseStandaloneOutput
    ? {
        output: "standalone",
        outputFileTracingRoot: path.join(process.cwd(), ".."),
      }
    : {}),
};

export default nextConfig;
