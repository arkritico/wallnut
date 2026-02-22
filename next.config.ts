import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  // Prevent bundling native .node binaries (OCR canvas rendering)
  serverExternalPackages: ['@napi-rs/canvas', 'winston', 'three', '@thatopen/fragments', 'web-ifc'],
  // Disable the x-powered-by header to reduce information leakage
  poweredByHeader: false,
  // Increase body size limit for large uploads (IFC files, PDFs)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  headers: async () => [
    {
      // Apply to all routes — middleware also sets these for API routes
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    },
    {
      // WASM/worker assets — ensure correct serving
      source: "/wasm/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
