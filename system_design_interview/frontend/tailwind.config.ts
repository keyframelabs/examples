import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{ts,tsx}"]
  },
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        canvas: {
          paper: "hsl(var(--canvas-paper))",
          ink: "hsl(var(--canvas-ink))",
          grid: "hsl(var(--canvas-grid))",
          connection: "hsl(var(--canvas-connection))",
          "connection-selected": "hsl(var(--canvas-connection-selected))",
          "avatar-surface": "hsl(var(--canvas-avatar-surface))",
          node: {
            actor: "hsl(var(--canvas-node-actor))",
            "actor-foreground": "hsl(var(--canvas-node-actor-foreground))",
            service: "hsl(var(--canvas-node-service))",
            "service-foreground": "hsl(var(--canvas-node-service-foreground))",
            database: "hsl(var(--canvas-node-database))",
            "database-foreground": "hsl(var(--canvas-node-database-foreground))",
            table: "hsl(var(--canvas-node-table))",
            "table-header": "hsl(var(--canvas-node-table-header))",
            "table-foreground": "hsl(var(--canvas-node-table-foreground))",
            text: "hsl(var(--canvas-node-text))"
          }
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        toolbar: "0 10px 30px hsl(var(--shadow-color) / 0.12)",
        float: "0 20px 55px hsl(var(--shadow-color) / 0.24)"
      }
    }
  },
  plugins: [animate]
} satisfies Config;
