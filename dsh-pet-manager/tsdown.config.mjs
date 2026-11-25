// tsdown 配置：与官方 DSH 客户端插件同构（src → lib）。
//   1) 浏览器半侧（client → lib/client.js）：react / react-dom / @deepseek-ai/* 外部化，
//      产物再包一层 IIFE，避免 bundle 被重复执行时顶层声明重定义报 SyntaxError。
//   2) 宿主半侧（index → lib/index.js）：保持 ESM，由 DSH 的 Loader import。
import { defineConfig } from 'tsdown';

const shared = {
  format: ['esm'],
  platform: 'node',
  target: 'es2020',
  dts: false,
  outDir: 'lib',
  clean: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { client: 'src/client/index.ts' },
    external: [/^@deepseek-ai\//, /^react/, /^node:/],
    outputOptions: { banner: ';(()=>{', footer: '})();' },
  },
  {
    ...shared,
    entry: { index: 'src/host/index.ts' },
    external: [/^@deepseek-ai\//, /^node:/],
  },
]);
