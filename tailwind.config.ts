import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        navy: {
          950: "#070D1E",
          900: "#0B132B",
          850: "#121C38",
          800: "#1C2541",
          750: "#243256",
          700: "#2A365C",
          600: "#3E4C7A",
        },
        brand: {
          teal: "#06B6D4",
          "teal-hover": "#0891B2",
          "teal-light": "#22D3EE",
          gold: "#F59E0B",
          "gold-hover": "#D97706",
          "gold-light": "#FBBF24",
          emerald: "#10B981",
          rose: "#F43F5E",
          indigo: "#6366F1",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(6, 182, 212, 0.25)",
        "gold-glow": "0 0 20px rgba(245, 158, 11, 0.25)",
        card: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "card-hover": "0 12px 40px 0 rgba(0, 0, 0, 0.45)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
        "spin-medium": "spin 3s linear infinite",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        "slide-up": "slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        "toast-in": "toastIn 0.22s ease-out forwards",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        slideUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateY(-8px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      spacing: {
        "header": "56px",
        "bottom-nav": "60px",
        "sidebar": "240px",
      },
    },
  },
  plugins: [],
};

export default config;
