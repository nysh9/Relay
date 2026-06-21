import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // RELAY brand palette
        relay: {
          bg: "#0A0E1A",        // near-black page bg
          panel: "#111827",      // panel bg (gray-900)
          border: "#1F2937",     // panel border (gray-800)
          accent: "#3B82F6",     // primary blue
          "accent-dim": "#1D4ED8",
        },
        priority: {
          p1: "#EF4444",   // red   — critical
          p2: "#F59E0B",   // amber — urgent
          p3: "#3B82F6",   // blue  — non-urgent
          none: "#6B7280", // grey  — not yet triaged
        },
        escalation: {
          human: "#8B5CF6",  // purple — human operator
          "911": "#EF4444",  // red    — emergency services
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
