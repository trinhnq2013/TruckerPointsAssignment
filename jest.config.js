/** Unit tests only: `*.spec.ts` files that live next to the code under test. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testMatch: ['<rootDir>/**/*.spec.ts'],
  transform: { '^.+[.]ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
