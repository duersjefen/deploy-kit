/**
 * Interactive prompt utilities
 * Handles user input for CLI interactions
 */

import * as readline from 'readline';

/**
 * Prompt user for yes/no confirmation
 *
 * @param question - The question to ask
 * @param defaultAnswer - Default answer if user just presses Enter (true = yes, false = no)
 * @returns Promise resolving to true if user confirms, false otherwise
 *
 * @example
 * ```typescript
 * const shouldContinue = await promptYesNo('Continue with deployment?', true);
 * if (shouldContinue) {
 *   // Deploy
 * }
 * ```
 */
export async function promptYesNo(question: string, defaultAnswer: boolean = true): Promise<boolean> {
  // Check if we're in a CI/non-interactive environment
  if (!process.stdin.isTTY || process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true') {
    return defaultAnswer;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultAnswer ? '[Y/n]' : '[y/N]';

  return new Promise((resolve) => {
    rl.question(`${question} ${hint}: `, (answer) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();

      // Empty answer = use default
      if (normalized === '') {
        resolve(defaultAnswer);
        return;
      }

      // Check for yes/no
      if (normalized === 'y' || normalized === 'yes') {
        resolve(true);
      } else if (normalized === 'n' || normalized === 'no') {
        resolve(false);
      } else {
        // Invalid input, use default
        resolve(defaultAnswer);
      }
    });
  });
}

/**
 * Prompt user for text input
 *
 * @param question - The question to ask
 * @param defaultValue - Default value if user just presses Enter
 * @returns Promise resolving to user's input or default value
 *
 * @example
 * ```typescript
 * const stageName = await promptText('Which stage?', 'staging');
 * ```
 */
export async function promptText(question: string, defaultValue?: string): Promise<string> {
  // Check if we're in a CI/non-interactive environment
  if (!process.stdin.isTTY || process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true') {
    return defaultValue || '';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultValue ? ` [${defaultValue}]` : '';

  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      rl.close();

      const normalized = answer.trim();

      // Empty answer = use default
      if (normalized === '' && defaultValue) {
        resolve(defaultValue);
      } else {
        resolve(normalized);
      }
    });
  });
}
