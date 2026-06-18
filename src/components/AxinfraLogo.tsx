'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme, themes } from '@/lib/contexts/ThemeContext';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AxinfraLogoProps {
  size?: LogoSize;
  href?: string;
  className?: string;
}

// Native image dimensions for correct aspect-ratio calculation
const DARK_IMG  = { src: '/dark.png',  w: 1522, h: 422 };
const LIGHT_IMG = { src: '/light.png', w: 1668, h: 504 };

// Rendered height (px) per size token
// xs  — compact mobile top-bar
// sm  — sidebar / secondary nav
// md  — primary nav, auth page mobile
// lg  — auth page desktop panel, hero sections
// xl  — marketing / landing hero
const HEIGHTS: Record<LogoSize, number> = {
  xs: 26,
  sm: 34,
  md: 44,
  lg: 58,
  xl: 72,
};

const NO_SELECT: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  display: 'inline-block',
  lineHeight: 0,
};

export default function AxinfraLogo({ size = 'sm', href, className = '' }: AxinfraLogoProps) {
  const { theme } = useTheme();
  const isDark = (themes.find(t => t.id === theme)?.mode ?? 'dark') === 'dark';

  const img = isDark ? DARK_IMG : LIGHT_IMG;
  const h   = HEIGHTS[size];

  const logo = (
    <Image
      src={img.src}
      alt="Axinfra"
      width={img.w}
      height={img.h}
      priority
      draggable={false}
      style={{
        height: h,
        width: 'auto',
        display: 'block',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // prevent drag-to-select ghost image
        WebkitUserDrag: 'none',
        pointerEvents: 'none',
      } as React.CSSProperties}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        style={{ ...NO_SELECT, pointerEvents: 'auto' }}
        tabIndex={0}
        aria-label="Axinfra home"
      >
        {logo}
      </Link>
    );
  }

  return (
    <span className={className} style={NO_SELECT} aria-label="Axinfra">
      {logo}
    </span>
  );
}
