import type { Config } from 'tailwindcss';

/** Semua warna merujuk ke token CSS di app/globals.css. */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        soft: 'var(--tt-soft-white)',
        ink: { DEFAULT: 'var(--tt-black)', deep: 'var(--tt-deep-black)', secondary: 'var(--tt-soft-black)', muted: 'var(--tt-muted)', gray: 'var(--tt-muted-gray)' },
        line: { DEFAULT: 'var(--tt-border)', strong: 'var(--tt-border-strong)' },
        accent: { red: 'var(--tt-red)', orange: 'var(--tt-orange)', green: 'var(--tt-green)' },
        good: { DEFAULT: 'var(--tt-green)', text: 'var(--tt-green-text)', soft: 'var(--tt-green-soft)' },
        warn: { DEFAULT: 'var(--tt-orange)', text: 'var(--tt-orange-text)', soft: 'var(--tt-orange-soft)' },
        critical: { DEFAULT: 'var(--tt-red)', text: 'var(--tt-red-text)', soft: 'var(--tt-red-soft)' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Helvetica Neue', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        marker: ['var(--font-marker)', 'cursive'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      borderRadius: { glass: 'var(--tt-radius-lg)', 'glass-md': 'var(--tt-radius-md)', 'glass-sm': 'var(--tt-radius-sm)' },
      boxShadow: { glass: 'var(--tt-shadow)', 'glass-hover': 'var(--tt-shadow-hover)', elevated: 'var(--tt-shadow-elevated)' },
      transitionTimingFunction: { glass: 'var(--tt-ease)' },
    },
  },
  plugins: [],
} satisfies Config;
