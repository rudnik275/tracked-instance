import tseslint from 'typescript-eslint'

export default tseslint.config(
  {ignores: ['dist/', 'coverage/', 'node_modules/', '.scratch/', '.claude/']},
  ...tseslint.configs.recommended,
  {
    rules: {
      // The engine works with arbitrary user data shapes; `any` is deliberate.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      'no-trailing-spaces': 'error',
    },
  },
  {
    files: ['tests/**'],
    rules: {
      // Chai property-style assertions (expect(x).undefined) read as bare expressions.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
)
