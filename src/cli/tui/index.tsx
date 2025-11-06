/**
 * Terminal UI Entry Point
 *
 * Launches the Ink-based command palette.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export function launchTerminalUI() {
  render(<App />);
}
