import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Axinfra',
    short_name: 'Axinfra',
    description: 'Evidence-first construction execution control system',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F8FA',
    theme_color: '#1F2D3D',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
