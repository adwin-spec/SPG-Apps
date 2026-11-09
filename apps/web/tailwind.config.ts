import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0a1530', 900: '#0f1e3d', 800: '#172a52', 700: '#22386a', 600: '#2f4a85' },
        surface: '#f5f7fa',
        border: '#e2e6ee',
        ink: { DEFAULT: '#111827', secondary: '#4b5563', muted: '#6b7280' },
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8', soft: '#eff4ff' },
        good: { DEFAULT: '#0ca30c', text: '#067a06', soft: '#ecf8ec' },
        warn: { DEFAULT: '#fab219', text: '#8a5a00', soft: '#fff7e6' },
        serious: { DEFAULT: '#ec835a', text: '#9a3f1b', soft: '#fdf0ea' },
        critical: { DEFAULT: '#d03b3b', text: '#b42323', soft: '#fdecec' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
} satisfies Config;
