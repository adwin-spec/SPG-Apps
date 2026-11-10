import type { Config } from 'tailwindcss';

/** Identitas Tanda Tambah: kertas putih, tinta hitam, cat merah, tanda "+". */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#f3efe6', card: '#fffdf8', deep: '#e8e2d4' },
        ink: { DEFAULT: '#141210', secondary: '#4a4640', muted: '#6b6760', soft: '#3a3733' },
        tt: { DEFAULT: '#d42a1f', dark: '#a8261a', soft: '#fbe3df' },
        comp: { DEFAULT: '#a39d93', light: '#c4bfb6' },
        navy: { 950: '#0b0a09', 900: '#141210', 800: '#26231f', 700: '#3a3733', 600: '#4a4640' },
        surface: '#f3efe6',
        border: '#d9d2c3',
        primary: { DEFAULT: '#141210', hover: '#d42a1f', soft: '#ece5d6' },
        good: { DEFAULT: '#0ca30c', text: '#066b06', soft: '#e5f3e2' },
        warn: { DEFAULT: '#fab219', text: '#7a5000', soft: '#fff3d6' },
        serious: { DEFAULT: '#ec835a', text: '#9a3f1b', soft: '#fdf0ea' },
        critical: { DEFAULT: '#d03b3b', text: '#b42323', soft: '#fdecec' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        marker: ['var(--font-marker)', 'var(--font-sans)', 'cursive'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: { hard: '4px 4px 0 0 #141210', 'hard-sm': '2px 2px 0 0 #141210', 'hard-red': '4px 4px 0 0 #d42a1f' },
    },
  },
  plugins: [],
} satisfies Config;
