/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root always goes to the marketing site. Runs at the edge before any
  // middleware/page, so this is the reliable hook for domain-level routing.
  async redirects() {
    return [
      { source: "/", destination: "https://vantagedonorai.com/", permanent: false },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // 2. Ensure we don't have image optimization errors if you use external images
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