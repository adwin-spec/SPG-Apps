module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.service.ts', '**/*.ts', '!**/*.module.ts', '!main*.ts'],
};
