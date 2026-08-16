import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  darkMode: "class",
  content: [
    "./entrypoints/**/*.{vue,ts,js}",
    "./components/**/*.{vue,ts,js}",
    "./composables/**/*.{vue,ts,js}",
    "./stores/**/*.{vue,ts,js}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Stetica", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary) / <alpha-value>)",
        "primary-foreground": "hsl(var(--primary-foreground))",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
