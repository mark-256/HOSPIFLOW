import type { Config } from 'tailwindcss'

/**
 * HOSPIFLOW design tokens.
 *
 * The palette is intentionally restrained: a deep teal brand colour for primary
 * actions, a neutral "ink" ramp for text and surfaces, and four semantic state
 * ramps (success / warning / danger / info) that every component and status
 * badge consumes. Components never hardcode raw hex values.
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Surfaces */
        canvas: '#f4f6f8',
        surface: {
          DEFAULT: '#ffffff',
          muted: '#fafbfc',
          sunken: '#f1f4f6',
        },
        /* Borders */
        line: {
          subtle: '#edf0f3',
          DEFAULT: '#e1e6ea',
          strong: '#cdd5dc',
        },
        /* Neutral ink ramp */
        ink: {
          50: '#f7f9fa',
          100: '#eef1f4',
          200: '#dfe5ea',
          300: '#c4cdd5',
          400: '#95a2ae',
          500: '#6c7a87',
          600: '#52606d',
          700: '#3e4a55',
          800: '#2a343d',
          900: '#1a222a',
          950: '#10161c',
        },
        /* Brand */
        brand: {
          50: '#eff7f7',
          100: '#d7ecec',
          200: '#b1dadb',
          300: '#7fc0c2',
          400: '#49a1a5',
          500: '#2c858a',
          600: '#1f6b72',
          700: '#1c565d',
          800: '#1b464c',
          900: '#193b40',
        },
        /* Warm accent, used sparingly for highlights (VIP, loyalty, premium) */
        accent: {
          50: '#fdf7ec',
          100: '#f9ebd1',
          200: '#f1d59f',
          300: '#e6b866',
          400: '#d99f3d',
          500: '#c3801f',
          600: '#a2621a',
          700: '#82491b',
          800: '#6b3c1d',
          900: '#5a331c',
        },
        success: {
          50: '#edf8f1',
          100: '#d5efe0',
          200: '#aadfc3',
          300: '#74c79e',
          400: '#40ab78',
          500: '#228f5e',
          600: '#16734b',
          700: '#135b3e',
          800: '#124934',
          900: '#103c2c',
        },
        warning: {
          50: '#fdf6e9',
          100: '#f9e9c6',
          200: '#f2d391',
          300: '#e8b551',
          400: '#dd9a2c',
          500: '#c17d18',
          600: '#9c6013',
          700: '#7d4a15',
          800: '#683d18',
          900: '#583419',
        },
        danger: {
          50: '#fdf2f2',
          100: '#fbe0e0',
          200: '#f6c6c6',
          300: '#ee9f9f',
          400: '#e26d6d',
          500: '#cf4747',
          600: '#b32f2f',
          700: '#942727',
          800: '#7d2424',
          900: '#6b2222',
        },
        info: {
          50: '#eef4fb',
          100: '#d9e6f7',
          200: '#b6cef0',
          300: '#84abe3',
          400: '#5286d2',
          500: '#3167bb',
          600: '#25529c',
          700: '#1f437d',
          800: '#1d3a67',
          900: '#1c3357',
        },
        /* Backwards-compatible aliases (pre-B37.1 pages / third-party snippets) */
        primary: {
          50: '#eff7f7',
          100: '#d7ecec',
          200: '#b1dadb',
          300: '#7fc0c2',
          400: '#49a1a5',
          500: '#2c858a',
          600: '#1f6b72',
          700: '#1c565d',
          800: '#1b464c',
          900: '#193b40',
        },
        hospiflow: {
          50: '#f7f9fa',
          100: '#eef1f4',
          200: '#dfe5ea',
          300: '#c4cdd5',
          400: '#95a2ae',
          500: '#6c7a87',
          600: '#52606d',
          700: '#3e4a55',
          800: '#2a343d',
          900: '#1a222a',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      },
      maxWidth: {
        content: '84rem',
      },
      borderRadius: {
        none: '0px',
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '0.875rem',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgb(16 24 32 / 0.05)',
        sm: '0 1px 2px 0 rgb(16 24 32 / 0.06), 0 1px 3px -1px rgb(16 24 32 / 0.06)',
        DEFAULT: '0 1px 3px 0 rgb(16 24 32 / 0.08), 0 1px 2px -1px rgb(16 24 32 / 0.06)',
        md: '0 4px 10px -3px rgb(16 24 32 / 0.10), 0 2px 4px -2px rgb(16 24 32 / 0.06)',
        lg: '0 12px 24px -8px rgb(16 24 32 / 0.14), 0 4px 8px -4px rgb(16 24 32 / 0.08)',
        xl: '0 24px 48px -12px rgb(16 24 32 / 0.18)',
        focus: '0 0 0 3px rgb(44 133 138 / 0.28)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        250: '250ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.2, 0, 0, 1) both',
        'fade-in-up': 'fade-in-up 200ms cubic-bezier(0.2, 0, 0, 1) both',
        'scale-in': 'scale-in 180ms cubic-bezier(0.2, 0, 0, 1) both',
        'slide-in-left': 'slide-in-left 220ms cubic-bezier(0.2, 0, 0, 1) both',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.2, 0, 0, 1) both',
      },
    },
  },
  plugins: [],
}

export default config
