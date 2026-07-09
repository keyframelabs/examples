import type { Config } from "tailwindcss";
import uiPreset from "#theme/tailwind-preset";

export default {
  presets: [uiPreset],
  content: {
    relative: true,
    files: ["./src/**/*.{ts,tsx}"]
  },
  plugins: []
} satisfies Config;
