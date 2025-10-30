#!/usr/bin/env node
(async () => {
  const path = await import('path');
  const url = await import('url');
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  try {
    await import(cliPath);
  } catch (error) {
    console.error('Failed to load deploy-kit CLI:', error);
    process.exit(1);
  }
})();
