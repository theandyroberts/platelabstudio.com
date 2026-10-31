import {defineConfig} from '../viewer/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/composite-review/',build:{outDir:'dist',emptyOutDir:true},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:3107}});
