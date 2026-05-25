import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import SWRProvider from '@/components/SWRProvider';
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
  title: 'Axinfra - Evidence-First Execution Tracking',
  description: 'Evidence-first construction execution control system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className={`${inter.className} antialiased`}><SWRProvider>{children}</SWRProvider></body>
    </html>
  );
}
