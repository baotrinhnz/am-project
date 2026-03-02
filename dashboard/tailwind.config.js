/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        surface: {
          0: '#0a0e14',
          1: '#0f1319',
          2: '#161b24',
          3: '#1c2230',
        },
        accent: {
          teal: '#2dd4bf',
          amber: '#fbbf24',
          rose: '#fb7185',
          blue: '#60a5fa',
          violet: '#a78bfa',
          green: '#4ade80',
        }
      }
    }
  },
  plugins: [],
};
