module.exports = {
    env: { browser: true, es2020: true, node: true },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:react-hooks/recommended",
        "plugin:prettier/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: ["react-refresh", "prettier"],
    rules: {
        "react-refresh/only-export-components": "off",
        "prettier/prettier": "error",
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        "@typescript-eslint/no-explicit-any": "off", // Scheduled to be resolved in Phase 5 & 6
        "react-hooks/rules-of-hooks": "off", // Scheduled to be resolved in Phase 5 (PascalCase renames)
        "react-hooks/exhaustive-deps": "off", // Scheduled to be resolved in Phase 5
        "no-empty": ["error", { allowEmptyCatch: true }],
        "no-var": "error",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "no-case-declarations": "off",
        "no-inner-declarations": "off",
    },
};
