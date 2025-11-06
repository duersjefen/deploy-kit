/**
 * Terminal UI Entry Point
 *
 * Launches the Ink-based command palette with error handling.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import chalk from 'chalk';

/**
 * Launch the terminal UI with comprehensive error handling
 */
export function launchTerminalUI() {
  try {
    // Check terminal dimensions
    const { columns, rows } = process.stdout;
    if (columns < 80 || rows < 24) {
      console.log(chalk.yellow('\n⚠️  Terminal too small for optimal display'));
      console.log(chalk.gray(`   Current: ${columns}x${rows}, Recommended: 80x24 or larger\n`));
    }

    // Set up global error handlers
    process.on('uncaughtException', (error) => {
      console.error(chalk.red('\n❌ Fatal error in terminal UI:'));
      console.error(chalk.red(error.message));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error(chalk.red('\n❌ Unhandled promise rejection:'));
      console.error(chalk.red(String(reason)));
      process.exit(1);
    });

    // Render the app
    const { waitUntilExit } = render(<App />);

    // Handle clean exit
    waitUntilExit().catch((error) => {
      console.error(chalk.red('\n❌ Terminal UI crashed:'));
      console.error(chalk.red(error.message));
      process.exit(1);
    });

  } catch (error) {
    console.error(chalk.red('\n❌ Failed to start terminal UI:'));
    console.error(chalk.red((error as Error).message));
    console.error(chalk.gray('\nPlease report this issue with the error details above.\n'));
    process.exit(1);
  }
}
