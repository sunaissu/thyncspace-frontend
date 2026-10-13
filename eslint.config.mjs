import { defineConfig, globalIgnores } from "eslint/config";
import ts from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import accessibility from "eslint-plugin-jsx-a11y";
import imports from "eslint-plugin-import";
import globals from "globals";

export default defineConfig([
  ...ts.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    plugins: { react, "react-hooks": hooks, "jsx-a11y": accessibility, import: imports },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "import/no-anonymous-default-export": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
    },
  },
  {
    rules: {
      // Fetch-on-mount and controlled-dialog synchronization are intentional.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["*.config.js", "test/*.cjs", "scripts/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/components/activeNoteEditor.tsx"],
    rules: {
      // Toolbar callbacks capture editor refs but only read them on user events.
      "react-hooks/refs": "off",
    },
  },
  globalIgnores(["public/pdf-worker-*.mjs", ".next/**", "out/**", "next-env.d.ts"]),
]);
