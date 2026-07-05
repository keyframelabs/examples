import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../infinite-canvas/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          paper: "#f8fafc",
          ink: "#172033",
          grid: "#d9e2ec",
          accent: "#0f766e",
          amber: "#b7791f"
        }
      },
      boxShadow: {
        toolbar: "0 10px 30px rgb(15 23 42 / 0.12)",
        float: "0 20px 55px rgb(15 23 42 / 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
