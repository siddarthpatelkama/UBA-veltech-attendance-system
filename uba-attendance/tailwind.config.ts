import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        uba: {
          primary: '#FF5722',    // Main actions, highlights
          dark: '#E64A19',       // Hover states
          light: '#FF8A50',      // Lighter accents
          bg: '#FFFFFF',         // Pure White background
          surface: '#FFF9F5',    // Very light orange tint for cards
          text: '#111827',       // Dark Gray/Black for text
          muted: '#6B7280'       // Muted Gray for secondary text
        }
      }
    },
  },
  plugins: [],
};

export default config;