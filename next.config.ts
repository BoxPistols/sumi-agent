import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // mammoth uses Node.js Buffer internally
  serverExternalPackages: ['mammoth'],

  // CORS is now handled per-route in route handlers (no global wildcard)

  // dev中にbuildを走らせても.nextが壊れないよう、build出力先を分離
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
}

export default nextConfig
