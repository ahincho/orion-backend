# =============================================================================
# ORION Backend - ESLint flat config
# =============================================================================
# Lints TypeScript with strict rules aligned with TypeScript strict mode.
# Uses the new flat config format (ESLint 9+).
# =============================================================================

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.aws-sam/**',
      'coverage/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
    },
  },
);
