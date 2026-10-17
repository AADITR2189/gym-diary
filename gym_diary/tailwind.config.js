/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  // hover: styles only on devices that really hover, so a tapped button doesn't stay highlighted on phones.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        primary: { DEFAULT: v('primary'), ink: v('primary-ink'), hover: v('primary-hover') },
        str: { DEFAULT: v('str'), soft: v('str-soft') },
        car: { DEFAULT: v('car'), soft: v('car-soft') },
        gold: { DEFAULT: v('gold'), soft: v('gold-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        wat: { DEFAULT: v('wat'), soft: v('wat-soft') },
      },
      fontFamily: {
        // "Athletic" type: condensed display face for headings and numbers, Barlow for UI text.
        // UI text uses the phone's own font (SF Pro on iPhone, Roboto on Android) with its built-in optical sizing.
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '6px',
      },
      boxShadow: {
        lift: '0 2px 8px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};
