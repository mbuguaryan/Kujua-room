import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * Replaces eslint-config-next, which supplied the TypeScript parser and the
 * rules-of-hooks checks. Both matter here: the room screen leans heavily on
 * effect dependencies, and a stale dependency array is exactly the kind of bug
 * that only shows up on a live call.
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      ".next",
      "node_modules",
      "legacy",
      "indexnew.html",
      "supabase/functions",
      "scripts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // Deliberate: several feature-detection paths (wakeLock, mediaSession,
      // audioSession) must fail silently on browsers that lack the API.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // A warning, not an error. This rule is stricter than what
      // eslint-config-next enforced, and every current violation sits in the
      // microphone / stage / reconnection paths — code that four separate bug
      // fixes have already tuned against real devices. Rewriting those effects
      // to satisfy a newly-introduced rule would be an untested behavioural
      // change to the most fragile code in the app. Fix them deliberately, one
      // at a time, with a phone in hand.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
