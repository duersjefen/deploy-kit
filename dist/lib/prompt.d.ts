/**
 * Interactive prompt utilities
 * Handles user input for CLI interactions
 */
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
export declare function promptYesNo(question: string, defaultAnswer?: boolean): Promise<boolean>;
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
export declare function promptText(question: string, defaultValue?: string): Promise<string>;
//# sourceMappingURL=prompt.d.ts.map