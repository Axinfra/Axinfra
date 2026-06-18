import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import SWRProvider from '@/components/SWRProvider';
import DBWakeup from '@/components/DBWakeup';
import { ThemeProvider } from '@/lib/contexts/ThemeContext';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://axinfra.in'),
  applicationName: 'Axinfra',
  title: 'Axinfra — Evidence-First Execution Tracking',
  description: 'Evidence-first construction execution control system',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/favicon-192.png', type: 'image/png' }],
    apple: [{ url: '/favicon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    title: 'Axinfra',
    description: 'Evidence-first construction execution control system',
    siteName: 'Axinfra',
    type: 'website',
    images: [{ url: '/favicon-512.png', width: 512, height: 512, type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className={`${inter.className} antialiased`}>
        {/* Prevent theme flash by reading localStorage before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('axinfra_theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <SWRProvider>
            <DBWakeup />
            {children}
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
