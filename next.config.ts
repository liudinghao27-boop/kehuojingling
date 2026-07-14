import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['bull', 'playwright'],
  devIndicators: false,
};

export default nextConfig;
