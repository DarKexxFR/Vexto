const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// zustand's ESM build ("import" export condition) uses `import.meta.env`,
// which crashes the classic-script web bundle with "Cannot use 'import.meta'
// outside a module" (blank page). On web, resolve zustand to its CommonJS build.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && /^zustand(\/.*)?$/.test(moduleName)) {
    return { type: "sourceFile", filePath: require.resolve(moduleName) };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
