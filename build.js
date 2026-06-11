// Build script

import { build } from 'esbuild';
import { execSync } from 'child_process';
import data from "./package.json" with { type: 'json' };

execSync('npx tsc --emitDeclarationOnly --outDir dist', { stdio: 'inherit' });

const sharedConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'node',
  external: [
    ...Object.keys(data.dependencies),
    ...Object.keys(data.devDependencies),
    ...Object.keys(data.peerDependencies ?? {}),
  ],
};

build({
  ...sharedConfig,
  outfile: "dist/index.js",
});