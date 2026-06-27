module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Intentional: the recommended preset surfaces these as errors. We keep
    // them as errors so they block CI, but configure no-unused-vars to not
    // flag the rest-sibling idiom (const { password, ...rest } = body) used
    // by audit.interceptor.sanitizeBody to strip sensitive fields. Removing
    // those "unused" names would silently re-open the PII-log leak fixed in
    // Issues_Observed.md §7.1.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        args: 'after-used',
        ignoreRestSiblings: true,
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-namespace': 'error',
    'prettier/prettier': ['error', {
      'endOfLine': 'auto'
    }]
  },
};
