/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Sage-Tech palette
        forest: "#102B19", // primary: headers, prominent buttons, emphasis
        leaf: "#2A804D", // secondary: positive metrics, points, success
        mineral: "#FAF9F5", // background
        card: "#FFFFFF",
        line: "#E2E1D9", // borders / dividers
        ink: "#102B19",
        muted: "#6B7B72",
        danger: "#C0492F",
      },
      fontFamily: {
        sans: ["Inter", "System"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};
