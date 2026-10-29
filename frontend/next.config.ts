import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: scripts, frames and connections may only go where
// the app already goes. 'unsafe-inline' stays for scripts because Next
// injects its own inline bootstrap scripts (a nonce would force every page to
// render per request); the origin lists still stop injected external code.
// Dev also needs eval and the HMR websocket.
const GOOGLE = ["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com"];
const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://*.razorpay.com"];
const CSP = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...GOOGLE, ...RAZORPAY],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    ...GOOGLE,
    "https://*.ggpht.com",
    "https://*.googleusercontent.com",
    "https://*.tile.openstreetmap.org",
    "https://tile.openstreetmap.org",
    ...RAZORPAY,
    // The UPI pay sheet's QR code (PAYMENT_PROVIDER=upi).
    "https://api.qrserver.com",
  ],
  "connect-src": ["'self'", ...GOOGLE, ...RAZORPAY, ...(dev ? ["ws://localhost:*", "http://localhost:*"] : [])],
  "frame-src": ["'self'", "https://*.google.com", "https://*.firebaseapp.com", ...RAZORPAY],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  // Nobody may frame the app (clickjacking on Join / Pay).
  "frame-ancestors": ["'none'"],
};

const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: Object.entries(CSP)
      .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
      .join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Nothing uses next/image (covers are plain <img> from /api/images), so the
  // /_next/image optimizer would be an unused public endpoint with its own
  // CVE history (GHSA-2464-fhr4-w9xw). Off.
  images: { unoptimized: true },
  // Next externalises firebase-admin by default, so at runtime Node loads it
  // from node_modules with plain require(). firebase-admin 14 -> jwks-rsa 4
  // -> jose 6, and jose 6 is ESM-only, so that require() throws
  // ERR_REQUIRE_ESM on any Node without require(esm) (< 22.12), which is what
  // the deployed Vercel functions hit. Listing it here opts it out of the
  // externals list so Turbopack bundles the whole chain and jose is inlined
  // as ESM, independent of the runtime's Node version.
  transpilePackages: ["firebase-admin"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
