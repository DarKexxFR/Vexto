/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Sage-Tech palette — keep in sync with src/theme/colors.ts
      colors: {
        forest: { DEFAULT: "#102B19", soft: "#1E4A2E" }, // primary: headers, prominent buttons
        leaf: { DEFAULT: "#2A804D", soft: "#E3F1E8", bright: "#6CCB8B" }, // success / points
        mineral: "#FAF9F5", // background
        card: "#FFFFFF",
        line: "#E2E1D9", // borders / dividers
        ink: "#102B19",
        muted: "#6B7B72",
        faint: "#A3AEA7",
        danger: { DEFAULT: "#C0492F", soft: "#FBE9E4" },
        amber: { DEFAULT: "#D98B1F", soft: "#FDF1DC" }, // streaks
        sky: { DEFAULT: "#2F6FDE", soft: "#E4EDFC" }, // transit / info
        violet: { DEFAULT: "#7A5AF8", soft: "#EEE9FE" },
      },
      fontFamily: {
        sans: ["Inter", "System"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};
