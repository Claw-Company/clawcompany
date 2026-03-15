import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  // Bundle all workspace packages (they're not on npm)
  // Keep npm dependencies external (they install normally)
  noExternal: [
    '@clawcompany/shared',
    '@clawcompany/providers',
    '@clawcompany/model-router',
    '@clawcompany/task-orchestrator',
    '@clawcompany/agent-runtime',
    '@clawcompany/tools',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
