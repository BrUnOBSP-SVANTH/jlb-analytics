// ESLint flat config — JLB Analytics
// Foco em erros reais (rules-of-hooks, unused, tipos), não em estilo
// (formatação é do Prettier).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    // components/ui = kit shadcn vendorizado (mesma convenção do jlb-doctor)
    ignores: ["dist/", "node_modules/", "client/public/", "client/src/components/ui/", "*.config.{js,ts}", "scripts/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Regras de hooks quebradas = bug real → erro.
      "react-hooks/rules-of-hooks": "error",
      // Deps de efeito merecem revisão humana caso a caso → aviso.
      "react-hooks/exhaustive-deps": "warn",
      // Regras de preparação p/ React Compiler: padrões legais em runtime hoje
      // (ex.: setState síncrono em efeito, Date.now em render de display,
      // função de reconexão auto-referente). Ficam como aviso — backlog de
      // modernização, não bug.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // O codebase usa objetos de API externos tipados ad-hoc em fronteiras;
      // o tsc estrito já cobre o resto.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
