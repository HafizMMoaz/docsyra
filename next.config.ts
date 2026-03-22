import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

// Here we use the @cloudflare/next-on-pages next-dev module to allow us to
// use bindings during local development (when running the application with
// `next dev`). This function is only necessary during development and
// has no impact outside of that. For more information see:
// https://github.com/cloudflare/next-on-pages/blob/main/internal-packages/next-dev/README.md
setupDevPlatform().catch(console.error);

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages compatibility
  experimental: {
    // Enable optimized package imports for edge runtime
    optimizePackageImports: ['@cloudflare/workers-types'],
  },
  
  // Ensure compatibility with edge runtime
  reactStrictMode: true,
  
  // Optimize for Cloudflare Pages
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
