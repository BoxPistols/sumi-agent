import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // mammoth uses Node.js Buffer internally
  serverExternalPackages: ['mammoth'],

  // CORS is now handled per-route in route handlers (no global wildcard)
}

export default nextConfig
