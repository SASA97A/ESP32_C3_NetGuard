/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "on-error": "#ffffff",
        "inverse-on-surface": "#eff1f3",
        "primary-container": "#0052ff",
        "primary": "#003ec7",
        "surface-variant": "#e0e3e5",
        "inverse-primary": "#b7c4ff",
        "tertiary-fixed": "#dae2fd",
        "on-background": "#191c1e",
        "on-secondary-container": "#54647a",
        "surface-container-highest": "#e0e3e5",
        "tertiary": "#464e64",
        "on-tertiary-fixed": "#131b2e",
        "primary-fixed": "#dde1ff",
        "secondary-fixed": "#d3e4fe",
        "inverse-surface": "#2d3133",
        "surface-container-lowest": "#ffffff",
        "on-surface": "#191c1e",
        "primary-fixed-dim": "#b7c4ff",
        "surface-container": "#eceef0",
        "surface-container-high": "#e6e8ea",
        "on-primary-fixed": "#001452",
        "surface-container-low": "#f2f4f6",
        "on-secondary-fixed": "#0b1c30",
        "tertiary-fixed-dim": "#bec6e0",
        "outline": "#737688",
        "tertiary-container": "#5e667d",
        "on-tertiary": "#ffffff",
        "secondary": "#505f76",
        "surface": "#f7f9fb",
        "background": "#f7f9fb",
        "secondary-fixed-dim": "#b7c8e1",
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-surface-variant": "#434656",
        "on-tertiary-fixed-variant": "#3f465c",
        "outline-variant": "#c3c5d9",
        "on-primary-container": "#dfe3ff",
        "on-secondary-fixed-variant": "#38485d",
        "on-primary": "#ffffff",
        "surface-dim": "#d8dadc",
        "surface-bright": "#f7f9fb",
        "surface-tint": "#004ced",
        "on-secondary": "#ffffff",
        "on-error-container": "#93000a",
        "on-tertiary-container": "#dde4ff",
        "secondary-container": "#d0e1fb",
        "on-primary-fixed-variant": "#0038b6"
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem"
      },
      spacing: {
        "inline-gap": "8px",
        base: "4px",
        "container-padding": "20px",
        "section-margin": "32px",
        "stack-gap": "12px"
      },
      fontFamily: {
        "headline-lg": ["Inter"],
        "headline-md": ["Inter"],
        "body-md": ["Inter"],
        "label-md": ["JetBrains Mono"],
        "body-lg": ["Inter"],
        "label-sm": ["JetBrains Mono"]
      },
      fontSize: {
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md": ["13px", { lineHeight: "16px", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-sm": ["11px", { lineHeight: "14px", fontWeight: "500" }]
      }
    },
  },
  plugins: [],
}

