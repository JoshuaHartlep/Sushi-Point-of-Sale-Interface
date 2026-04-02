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
        // ── Stich / Material Design token system ──────────────────────────────
        "primary":                   "#a2281a",
        "on-primary":                "#ffffff",
        "primary-container":         "#c4402f",
        "on-primary-container":      "#ffeeec",
        "primary-fixed":             "#ffdad4",
        "primary-fixed-dim":         "#ffb4a8",
        "on-primary-fixed":          "#410100",
        "on-primary-fixed-variant":  "#8c170c",
        "inverse-primary":           "#ffb4a8",
        "surface-tint":              "#ae3021",

        "secondary":                 "#655e50",
        "on-secondary":              "#ffffff",
        "secondary-container":       "#e9decd",
        "on-secondary-container":    "#696254",
        "secondary-fixed":           "#ece1d0",
        "secondary-fixed-dim":       "#cfc5b5",
        "on-secondary-fixed":        "#201b10",
        "on-secondary-fixed-variant":"#4c4639",

        "tertiary":                  "#005e77",
        "on-tertiary":               "#ffffff",
        "tertiary-container":        "#007897",
        "on-tertiary-container":     "#e3f5ff",
        "tertiary-fixed":            "#baeaff",
        "tertiary-fixed-dim":        "#7cd2f4",
        "on-tertiary-fixed":         "#001f29",
        "on-tertiary-fixed-variant": "#004d62",

        "error":                     "#ba1a1a",
        "on-error":                  "#ffffff",
        "error-container":           "#ffdad6",
        "on-error-container":        "#93000a",

        // ── Adaptive surface / text tokens (CSS-variable backed for dark mode) ──
        "background":                "rgb(var(--color-background) / <alpha-value>)",
        "on-background":             "rgb(var(--color-on-background) / <alpha-value>)",
        "surface":                   "rgb(var(--color-surface) / <alpha-value>)",
        "on-surface":                "rgb(var(--color-on-surface) / <alpha-value>)",
        "surface-variant":           "rgb(var(--color-surface-variant) / <alpha-value>)",
        "on-surface-variant":        "rgb(var(--color-on-surface-variant) / <alpha-value>)",
        "surface-container-lowest":  "rgb(var(--color-surface-container-lowest) / <alpha-value>)",
        "surface-container-low":     "rgb(var(--color-surface-container-low) / <alpha-value>)",
        "surface-container":         "rgb(var(--color-surface-container) / <alpha-value>)",
        "surface-container-high":    "rgb(var(--color-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--color-surface-container-highest) / <alpha-value>)",
        "surface-dim":               "rgb(var(--color-surface-dim) / <alpha-value>)",
        "surface-bright":            "rgb(var(--color-surface-bright) / <alpha-value>)",
        "inverse-surface":           "rgb(var(--color-inverse-surface) / <alpha-value>)",
        "inverse-on-surface":        "rgb(var(--color-inverse-on-surface) / <alpha-value>)",

        "outline":                   "rgb(var(--color-outline) / <alpha-value>)",
        "outline-variant":           "rgb(var(--color-outline-variant) / <alpha-value>)",

        // ── Legacy custom colors (kept for compatibility) ─────────────────────
        akabeni: {
          50:  '#fff1f1', 100: '#ffe0e0', 200: '#ffc5c5', 300: '#ff9b9b',
          400: '#ff6262', 500: '#f83131', 600: '#c0392b', 700: '#a02020',
          800: '#841c1c', 900: '#6e1d1d', 950: '#3c0a0a',
        },
        washi: {
          50:  '#faf9f7', 100: '#f3f1ec', 200: '#e8e4dc', 300: '#d9d2c4',
          400: '#c3b9a5', 500: '#aa9e8a', 600: '#8f8271', 700: '#756a5c',
          800: '#60574b', 900: '#4e4740', 950: '#2a2520',
        },
        sumi: {
          700: '#2a2a35', 800: '#1e1e28', 900: '#14141c', 950: '#0d0d13',
        },
      },
      fontFamily: {
        sans:     ['"Noto Sans JP"', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['"Instrument Serif"', 'serif'],
        label:    ['Manrope', 'sans-serif'],
        japanese: ['"Noto Sans JP"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        sm:      '6px',
        lg:      '0.5rem',
        xl:      '0.75rem',
        full:    '9999px',
      },
    },
  },
  plugins: [],
}
