module.exports = {
  rootDir: './src',
  testRegex: '(kpi|users)\\.permissions\\.spec\\.ts$',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ES2023',
          esModuleInterop: true,
          isolatedModules: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
};
