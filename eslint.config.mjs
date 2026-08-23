import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Vendored tooling, not application code — linting it buries our own
    // findings under thousands of third-party ones.
    '.claude/**',
  ]),
  {
    // A leading underscore already means "deliberately unused" throughout this codebase:
    // params that exist to satisfy a base-class signature (`getFileExcerpt(_budget)`),
    // and the omit-by-destructuring idiom (`const { clients: _clients, ...post } = typed`).
    // The rule did not know the convention, so it warned on correct code and the noise
    // made the genuine findings easy to miss. Teach it the convention rather than edit
    // seven call sites that are each doing the right thing. Anything unused *without*
    // the underscore still warns, which is the part worth keeping.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
])

export default eslintConfig
