import type { Config } from "tailwindcss";
import uiPreset from "@kfl-system-design/ui/tailwind-preset";

export default {
  presets: [uiPreset],
  content: {
    relative: true,
    files: [
      "./index.html",
      "./src/**/*.{ts,tsx}",
      // Shared shadcn primitives contribute Tailwind classes from the ui package.
      "../ui/src/**/*.{ts,tsx}"
    ]
  },
  plugins: []
} satisfies Config;
