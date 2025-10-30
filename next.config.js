/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '300mb',
    },
  },
}

module.exports = nextConfig
