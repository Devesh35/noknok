import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Imports the browser must never pull in (AGENTS-B rules 1–2, PLATFORM_PLAN §9).
const SERVER_ONLY = [
  { name: "mongoose", message: "Database access lives in src/server/ (AGENTS-B rule 2)." },
  { name: "firebase-admin", message: "firebase-admin is imported only in src/server/firebase.ts." },
];
const SERVER_PATTERNS = [
  { group: ["@/server/*"], message: "Client code reaches the server through src/api/ (AGENTS-B rule 1)." },
  { group: ["firebase-admin/*"], message: "firebase-admin is imported only in src/server/firebase.ts." },
];
// The Firebase client SDK belongs to src/lib/firebase/ (AGENTS-B rule 1).
const FIREBASE_CLIENT = [{ regex: "^firebase(/|$)", message: "Use src/lib/firebase/* (AGENTS-B rule 18)." }];

const ENV_RULE = [
  "error",
  { object: "process", property: "env", message: "Read configuration through src/server/config.ts (AGENTS-B rule 3)." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: SERVER_ONLY, patterns: [...SERVER_PATTERNS.slice(1), ...FIREBASE_CLIENT] },
      ],
      "no-restricted-properties": ENV_RULE,
      // Firebase is an OTP mechanism, not a login state (AGENTS-B rule 18).
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name='onAuthStateChanged']",
          message: "Login state is our session cookie, not Firebase (AGENTS-B rule 18).",
        },
        {
          selector: "MemberExpression[property.name='currentUser'][object.name=/auth/i]",
          message: "Login state is our session cookie, not Firebase (AGENTS-B rule 18).",
        },
      ],
    },
  },
  // Client code: no server modules at all.
  {
    files: ["src/components/**", "src/views/**", "src/api/**", "src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: SERVER_ONLY, patterns: [...SERVER_PATTERNS, ...FIREBASE_CLIENT] },
      ],
    },
  },
  // Pages and layouts may read through services, but never models or the driver.
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: SERVER_ONLY,
          patterns: [
            { group: ["@/server/models", "@/server/models/*"], message: "Models live behind services (AGENTS-B rule 2)." },
            ...SERVER_PATTERNS.slice(1),
            ...FIREBASE_CLIENT,
          ],
        },
      ],
    },
  },
  // The few files allowed to do what everyone else may not.
  {
    files: ["src/server/**"],
    rules: { "no-restricted-imports": ["error", { patterns: FIREBASE_CLIENT }] },
  },
  { files: ["src/server/firebase.ts"], rules: { "no-restricted-imports": "off" } },
  {
    files: ["src/lib/firebase/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: SERVER_ONLY, patterns: SERVER_PATTERNS }],
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    // config.ts is the env reader; the browser's public config is read where
    // it's used; proxy.ts runs before the app; NODE_ENV checks are inlined.
    files: [
      "src/server/config.ts",
      "src/lib/maps/provider.ts",
      "src/proxy.ts",
      "src/components/AppShell.tsx",
      "src/lib/env.ts",
      "src/**/*.test.ts",
    ],
    rules: { "no-restricted-properties": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Raw credentials and console boilerplate, gitignored.
    "keys/**",
  ]),
]);

export default eslintConfig;
