module.exports = function (api) {
  // Cache keyed on env so test vs app builds get the right preset set.
  const isTest = api.env("test");
  api.cache.using(() => process.env.NODE_ENV);

  const moduleResolver = [
    "module-resolver",
    {
      root: ["./"],
      alias: { "@": "./src" },
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  ];

  if (isTest) {
    // Pure logic tests don't need NativeWind/Reanimated (and NativeWind's
    // babel preset pulls in react-native-worklets which isn't used here).
    return {
      presets: ["babel-preset-expo"],
      plugins: [moduleResolver],
    };
  }

  // SDK 54 / Reanimated 4: babel-preset-expo injects the worklets plugin
  // automatically when react-native-worklets is installed, so we don't add it
  // (or the old reanimated plugin) manually here.
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [moduleResolver],
  };
};
