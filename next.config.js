/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '300mb',
    },
  },
  output: 'standalone', // For Docker/Cloud Run deployment
}

module.exports = nextConfig
