/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Akabeni — Japanese vermillion red (replaces blue as primary accent)
        akabeni: {
          50:  '#fff1f1',
          100: '#ffe0e0',
          200: '#ffc5c5',
          300: '#ff9b9b',
          400: '#ff6262',
          500: '#f83131',
          600: '#c0392b', // classic torii red
          700: '#a02020',
          800: '#841c1c',
          900: '#6e1d1d',
          950: '#3c0a0a',
        },
        // Sakura — soft cherry-blossom pink
        sakura: {
          50:  '#fff0f5',
          100: '#ffe3ec',
          200: '#ffc9d9',
          300: '#ffa0bc',
          400: '#ff6b96',
          500: '#f93c72',
          600: '#e01a52',
          700: '#bc1144',
          800: '#9c113c',
          900: '#841337',
          950: '#4b051a',
        },
        // Washi — warm parchment neutrals (replaces gray for light mode surfaces)
        washi: {
          50:  '#faf9f7',
          100: '#f3f1ec',
          200: '#e8e4dc',
          300: '#d9d2c4',
          400: '#c3b9a5',
          500: '#aa9e8a',
          600: '#8f8271',
          700: '#756a5c',
          800: '#60574b',
          900: '#4e4740',
          950: '#2a2520',
        },
        // Sumi — ink-black dark tones (dark mode surfaces)
        sumi: {
          700: '#2a2a35',
          800: '#1e1e28',
          900: '#14141c',
          950: '#0d0d13',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
