import { defineBuildConfig } from 'obuild/config';

// https://github.com/unjs/obuild
// 使用单独的 bundle 入口避免共享 chunks 导致的变量命名冲突
export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts', './src/cli.ts'],
    },
  ],
});
