/** @type {import('next').NextConfig} */
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL || 'http://localhost:3001'

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_INTERNAL_URL}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
