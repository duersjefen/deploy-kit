#!/usr/bin/env node

// Simple wrapper that imports and runs the CLI
import('../dist/cli.js').catch(error => {
  console.error('Error loading CLI:', error);
  process.exit(1);
});
