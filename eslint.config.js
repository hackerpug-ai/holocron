import js from '@eslint/js'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.reactNative,
        ...globals.node,
        ...globals.browser,
        React: true,
        __DEV__: true,
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: {
        version: 'detect'
      },
      'react-native': {}
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-control-regex': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'args': 'after-used',
        'ignoreRestSiblings': true
      }]
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      }
    }
  },
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      '.claude/**',
      'expo/**',
      'supabase/**',
      'dist/**',
      'build/**',
      '**/*.stories.tsx',
      'convex/_generated/**',
      'holocron-mcp/**',
      'holocron-mcp.backup/**',
      'holocron-general-mcp.old/**',
      'scripts/**',
      'metro.config.cjs'
    ]
  }
]
