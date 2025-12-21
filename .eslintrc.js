module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
  ],
  env: {
    node: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-unused-vars': 'off',
  },
  ignorePatterns: [
    'out/',
    'dist/',
    'build/',
    'node_modules/',
    'openspec-server/',
    '*.js'
  ]
};