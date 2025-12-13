import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
  // Main bundle (UMD for browser, ESM for bundlers)
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/slayops.js',
        format: 'umd',
        name: 'SlayOps',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/slayops.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
      }),
    ],
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/slayops.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
];
