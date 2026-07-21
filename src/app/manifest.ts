import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Axinfra',
    short_name: 'Axinfra',
    description: 'Milestone-gated construction execution control system',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F8FA',
    theme_color: '#1F2D3D',
    icons: [
      {
        src: '/favicon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
