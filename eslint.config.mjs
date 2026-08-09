import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Fetch-on-mount and controlled-dialog synchronization are intentional.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["*.config.js"],
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
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
]);
