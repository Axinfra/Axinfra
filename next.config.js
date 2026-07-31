/** @type {import('next').NextConfig} */
const nextConfig = {
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
  experimental: {
    // @byteink/mppjs resolves its native binary via a dynamic require based on
    // process.platform/arch (optionalDependencies sidecar), which the default
    // file tracer can't follow statically — without this the .mpp import route
    // deploys without the binary and fails at runtime with "binary not found".
    // vendor/mpp-runtime/ is the bundled JRE + MPXJ jars mppConverter.ts spawns directly
    // on linux-x64 (production) instead — @byteink/mppjs-linux-x64's binary runs but
    // reliably crashes with UnsatisfiedLinkError on real files (GraalVM native-image AWT
    // limitation, not fixable in our code — see mppConverter.ts for the full writeup).
    outputFileTracingIncludes: {
      '**/schedule/import/**': [
        './node_modules/@byteink/mppjs-linux-x64/**',
        './vendor/mpp-runtime/**',
      ],
      // lib/pdf/logo.ts reads public/light.png via fs.readFileSync to embed it in generated
      // PDFs (Work Order, RA Bill) — the default file tracer can't follow that dynamic read,
      // so without this the route deploys without the logo and fails at runtime with ENOENT.
      '**/work-orders/**': [
        './public/light.png',
      ],
      '**/ra-bills/**': [
        './public/light.png',
      ],
    },
  },
};

module.exports = nextConfig;
