import { build } from 'esbuild';
import { cp } from 'node:fs/promises';
await build({ entryPoints: ['src/main.ts'], outdir: 'dist', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' });
await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts', 'dist/fonts', { recursive: true });
