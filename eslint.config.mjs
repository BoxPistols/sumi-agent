import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'node_modules/**',
      'next-env.d.ts',
      // Monolith (intentionally ts-nocheck / eslint-disable while refactoring)
      'src/app/RedactPro.tsx',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
]

export default config
