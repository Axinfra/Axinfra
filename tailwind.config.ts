import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'display': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'h1': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h2': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        'h3': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        'h4': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        'body': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '-0.006em' }],
        'small': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
        'caption': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0' }],
      },
      colors: {
        primary: {
          25: '#F5FAFF',
          50: '#F0F5FF',
          100: '#E0EAFF',
          200: '#C2D6FF',
          300: '#99B8FF',
          400: '#6690FF',
          500: '#3D6EFF',
          600: '#1A4DFF', // Main Action
          700: '#0033CC',
          800: '#0029A3',
          900: '#001F7A',
          950: '#001247',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F2F4F7',
          200: '#EAECF0',
          300: '#D0D5DD',
          400: '#98A2B3',
          500: '#667085',
          600: '#475467', // Text Primary
          700: '#344054', // Headings
          800: '#182230',
          900: '#101828', // Display/Strong
          950: '#0C111D',
        },
        success: {
          25: '#F6FEF9',
          50: '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          300: '#6CE9A6',
          400: '#32D583',
          500: '#12B76A',
          600: '#039855',
          700: '#027A48',
          800: '#05603A',
          900: '#054F31',
        },
        warning: {
          25: '#FFFCF5',
          50: '#FFFAEB',
          100: '#FEF0C7',
          200: '#FEDF89',
          300: '#FEC84B',
          400: '#FDB022',
          500: '#F79009',
          600: '#DC6803',
          700: '#B54708',
          800: '#93370D',
          900: '#7A2E0E',
        },
        danger: {
          25: '#FFFBFA',
          50: '#FEF3F2',
          100: '#FEE4E2',
          200: '#FECDCA',
          300: '#FDA29B',
          400: '#F97066',
          500: '#F04438',
          600: '#D92D20',
          700: '#B42318',
          800: '#912018',
          900: '#7A271A',
        },
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '24px',
        'pill': '9999px',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
        'sm': '0 1px 3px 0 rgba(16, 24, 40, 0.1), 0 1px 2px -1px rgba(16, 24, 40, 0.1)',
        'md': '0 4px 6px -1px rgba(16, 24, 40, 0.1), 0 2px 4px -2px rgba(16, 24, 40, 0.1)',
        'lg': '0 10px 15px -3px rgba(16, 24, 40, 0.1), 0 4px 6px -4px rgba(16, 24, 40, 0.1)',
        'xl': '0 20px 25px -5px rgba(16, 24, 40, 0.1), 0 8px 10px -6px rgba(16, 24, 40, 0.1)',
        '2xl': '0 25px 50px -12px rgba(16, 24, 40, 0.25)',
        'focus-ring': '0 0 0 4px rgba(41, 112, 255, 0.24)', // Clean Blue Ring
        'focus-ring-error': '0 0 0 4px rgba(240, 68, 56, 0.24)',
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        'sidebar': '280px', // Wider, modern sidebar
        'topbar': '64px', // Taller topbar
      },
      maxWidth: {
        'content': '1280px', // Wider content area
        '7xl': '80rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up-fade': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up-fade': 'slide-up-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
