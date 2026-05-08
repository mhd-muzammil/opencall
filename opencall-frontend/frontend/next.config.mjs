import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.VERCEL === "1"
    ? {}
    : {
        output: "standalone",
        outputFileTracingRoot: path.join(process.cwd(), ".."),
      }),
};

export default nextConfig;
