import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
        toolbar: "0 10px 30px rgb(15 23 42 / 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
