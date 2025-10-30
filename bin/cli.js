#!/usr/bin/env node
import('./dist/cli.js').catch(error => {
  console.error('Failed to load deploy-kit CLI:', error);
  process.exit(1);
});
