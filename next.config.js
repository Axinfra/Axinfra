/** @type {import('next').NextConfig} */
const nextConfig = {
  // Moved out of experimental in Next.js 14.1+
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],

  images: {
    remotePatterns: [
      {
        // Supabase Storage public URLs (if ever serving images directly)
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

module.exports = nextConfig;
