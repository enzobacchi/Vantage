/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root always goes to the marketing site. Runs at the edge before any
  // middleware/page, so this is the reliable hook for domain-level routing.
  async redirects() {
    return [
      { source: "/", destination: "https://vantagedonorai.com/", permanent: false },
    ];
  },
  // Security headers — the privacy policy promises HSTS/X-Frame-Options/CSP,
  // so these must stay in place. CSP is intentionally a baseline: Next.js
  // inline runtime chunks need 'unsafe-inline', Mapbox GL needs workers and
  // its API hosts, Supabase/Stripe need connect+frame access.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(self)" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://api.stripe.com https://*.sentry.io",
              "worker-src 'self' blob:",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
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