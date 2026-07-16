// Tailwind v4 (utilities only — preflight is deliberately NOT imported in
// globals.css, so Tailwind cannot reset the app's existing hand-written CSS).
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
