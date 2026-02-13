/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirect root to dashboard (handled at config level for reliable deployment)
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
    ];
  },
  // 1. Ignore TypeScript Errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // 2. Ignore ESLint Errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 3. Ensure we don't have image optimization errors if you use external images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow images from anywhere (e.g. Google Maps, User Avatars)
      },
    ],
  },
};

export default nextConfig;