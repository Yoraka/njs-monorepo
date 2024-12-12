import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactStrictMode: true,
  // transpilePackages: ["@repo/typescript-config"],
  
  webpack: (config) => {
    config.output = {
      ...config.output,
      chunkLoadTimeout: 60000, // 设置为60秒
    }
    return config
  },
};

export default nextConfig;
