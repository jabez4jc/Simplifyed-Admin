module.exports = {
  env: {
    node: true,
    es2021: true,
    mocha: false
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['warn'],
    'no-console': 'off'
  }
};
