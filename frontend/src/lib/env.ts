// Build mode for the browser. NODE_ENV is inlined at build time, so prototype
// copy and dev-only links drop out of production bundles.
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
