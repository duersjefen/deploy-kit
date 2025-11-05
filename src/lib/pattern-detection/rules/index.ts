/**
 * Pattern Detection Rules Index (DEP-30)
 *
 * Exports all pattern detection rules for SST config validation
 */

import { stageVariableRule } from './stage-variable-rule.js';
import { domainConfigRule } from './domain-config-rule.js';
import { corsConfigRule } from './cors-config-rule.js';
import { envVariableRule } from './env-variable-rule.js';
import { pulumiOutputRule } from './pulumi-output-rule.js';
import { resourceDependencyRule } from './resource-dependency-rule.js';
import type { PatternRule } from '../types.js';

/**
 * All available pattern detection rules
 */
export const ALL_RULES: PatternRule[] = [
  stageVariableRule,
  domainConfigRule,
  corsConfigRule,
  envVariableRule,
  pulumiOutputRule,
  resourceDependencyRule,
];

/**
 * Get all enabled rules
 */
export function getEnabledRules(): PatternRule[] {
  return ALL_RULES.filter(rule => rule.enabled);
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): PatternRule | undefined {
  return ALL_RULES.find(rule => rule.id === id);
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): PatternRule[] {
  return ALL_RULES.filter(rule => rule.category === category);
}

// Re-export individual rules
export {
  stageVariableRule,
  domainConfigRule,
  corsConfigRule,
  envVariableRule,
  pulumiOutputRule,
  resourceDependencyRule,
};
