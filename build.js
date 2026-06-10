// Build script

import {build} from 'esbuild';
import data from "./package.json" assert { type: 'json'};
import dts from 'npm-dts';

const result = new dts.Generator({
  entry: 'src/index.ts',
  output: 'dist/index.d.ts',
}).generate();

const sharedConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  external: Object.keys(data.dependencies).concat(Object.keys(data.devDependencies)),
};
build({
  ...sharedConfig,
  platform: 'node', // for CJS
  outfile: "dist/index.js",
});