import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rule overrides — pragmatic relaxation during active development
  {
    rules: {
      // Allow 'any' types — codebase has many legitimate dynamic patterns
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow 'this' aliasing — some older patterns need it
      "@typescript-eslint/no-this-alias": "warn",
      // Allow unused vars to be warnings only
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      // Allow require() imports for backward compatibility
      "@typescript-eslint/no-require-imports": "warn",
      // Allow let when const could be used
      "prefer-const": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bundled/vendored libraries
    "public/**",
    // Scripts (not part of the app build)
    "scripts/**",
    // Examples and test fixtures
    "examples/**",
    // Generated data files
    "data/**",
  ]),
]);

export default eslintConfig;
