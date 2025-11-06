/**
 * Unified Command Registry
 *
 * Central source of truth for all Deploy-Kit commands.
 * Powers both terminal UI and web dashboard with rich metadata.
 */

import { z } from 'zod';
import type { DeploymentStage } from '../../types.js';

// ============================================================================
// COMMAND METADATA TYPES
// ============================================================================

export type CommandCategory =
  | 'setup'
  | 'development'
  | 'deployment'
  | 'management'
  | 'package';

export type DangerLevel = 'safe' | 'moderate' | 'high' | 'critical';

export type ParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'array';

export interface CommandParameter {
  name: string;
  type: ParameterType;
  description: string;
  required?: boolean;
  default?: any;
  flag?: string;  // CLI flag (e.g., '--skip-checks')
  options?: string[];  // For enum types
  placeholder?: string;  // UI placeholder
  validation?: z.ZodType<any>;  // Zod schema for runtime validation
}

export interface CommandExample {
  command: string;
  description: string;
}

export interface CommandMetadata {
  name: string;
  category: CommandCategory;
  description: string;
  longDescription: string;
  parameters: CommandParameter[];
  examples: CommandExample[];
  icon: string;  // Emoji or icon name
  keywords: string[];  // For fuzzy search
  estimatedDuration?: string;
  dangerLevel: DangerLevel;
  requiresConfig: boolean;  // Whether .deploy-config.json is needed
  aliases?: string[];  // Shorthand aliases
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const StageSchema = z.enum(['staging', 'production']);
const ReleaseTypeSchema = z.enum(['patch', 'minor', 'major']);
const RecoverTargetSchema = z.enum(['cloudfront', 'state', 'dev']);
const CloudFrontCommandSchema = z.enum(['audit', 'cleanup', 'report']);
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

export const commandRegistry: Record<string, CommandMetadata> = {
  // ==========================================================================
  // SETUP COMMANDS
  // ==========================================================================

  init: {
    name: 'init',
    category: 'setup',
    description: 'Initialize new Deploy-Kit project',
    longDescription: `
Set up a new project with Deploy-Kit. This command creates:
- .deploy-config.json configuration file
- Package scripts for deployment
- Optional: Husky + lint-staged for quality checks

Supports both interactive and non-interactive modes.
    `.trim(),
    parameters: [
      {
        name: 'configOnly',
        type: 'boolean',
        description: 'Only create config file',
        flag: '--config-only',
        default: false,
      },
      {
        name: 'scriptsOnly',
        type: 'boolean',
        description: 'Only add package scripts',
        flag: '--scripts-only',
        default: false,
      },
      {
        name: 'nonInteractive',
        type: 'boolean',
        description: 'Run without prompts',
        flag: '--non-interactive',
        default: false,
      },
      {
        name: 'withQualityTools',
        type: 'boolean',
        description: 'Setup Husky + lint-staged',
        flag: '--with-quality-tools',
        default: false,
      },
      {
        name: 'projectName',
        type: 'string',
        description: 'Project name',
        flag: '--project-name',
        placeholder: 'my-app',
      },
      {
        name: 'domain',
        type: 'string',
        description: 'Main domain',
        flag: '--domain',
        placeholder: 'example.com',
      },
      {
        name: 'awsProfile',
        type: 'string',
        description: 'AWS profile name',
        flag: '--aws-profile',
        placeholder: 'default',
      },
      {
        name: 'awsRegion',
        type: 'string',
        description: 'AWS region',
        flag: '--aws-region',
        default: 'eu-north-1',
        placeholder: 'eu-north-1',
      },
    ],
    examples: [
      {
        command: 'dk init',
        description: 'Interactive setup',
      },
      {
        command: 'dk init --non-interactive --project-name=my-app',
        description: 'Non-interactive with project name',
      },
      {
        command: 'dk init --with-quality-tools',
        description: 'Setup with Husky and lint-staged',
      },
    ],
    icon: '🎬',
    keywords: ['setup', 'start', 'create', 'new', 'initialize'],
    estimatedDuration: '1-2 minutes',
    dangerLevel: 'safe',
    requiresConfig: false,
  },

  validate: {
    name: 'validate',
    category: 'setup',
    description: 'Validate .deploy-config.json configuration',
    longDescription: `
Validates your .deploy-config.json file for:
- Required fields presence
- Correct types and formats
- AWS region validity
- Domain name format
- Profile configuration

Shows detailed error messages for any issues found.
    `.trim(),
    parameters: [],
    examples: [
      {
        command: 'dk validate',
        description: 'Validate config file',
      },
    ],
    icon: '✅',
    keywords: ['check', 'config', 'verify', 'lint'],
    estimatedDuration: '5 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  doctor: {
    name: 'doctor',
    category: 'setup',
    description: 'Run comprehensive health checks',
    longDescription: `
Comprehensive health check system that validates:
- AWS credentials and permissions
- SST configuration
- Node.js version
- Package dependencies
- Project structure
- Environment variables
- Git repository status

Provides actionable recommendations for any issues.
    `.trim(),
    parameters: [],
    examples: [
      {
        command: 'dk doctor',
        description: 'Run all health checks',
      },
    ],
    icon: '🏥',
    keywords: ['check', 'health', 'diagnostic', 'troubleshoot', 'fix'],
    estimatedDuration: '10-30 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  ccw: {
    name: 'ccw',
    category: 'setup',
    description: 'Setup Claude Code for the Web',
    longDescription: `
Configures your project for Claude Code for the Web environment:
- Creates .claude/ccw.md with environment-specific instructions
- Sets up API access patterns (curl instead of CLI tools)
- Configures remote development workflow

Essential for using Claude Code in browser-based environments.
    `.trim(),
    parameters: [],
    examples: [
      {
        command: 'dk ccw',
        description: 'Setup CCW environment',
      },
    ],
    icon: '🌐',
    keywords: ['claude', 'remote', 'web', 'browser', 'ai'],
    estimatedDuration: '10 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  'remote-deploy': {
    name: 'remote-deploy',
    category: 'setup',
    description: 'Setup GitHub Actions deployment workflow',
    longDescription: `
Creates a GitHub Actions workflow for automated deployments:
- Configures CI/CD pipeline
- Sets up staging/production workflows
- Adds quality checks gates
- Configures AWS credentials

After setup, deployments run automatically on push/PR merge.
    `.trim(),
    parameters: [],
    examples: [
      {
        command: 'dk remote-deploy',
        description: 'Setup GitHub Actions workflow',
      },
    ],
    icon: '🔄',
    keywords: ['ci', 'cd', 'github', 'actions', 'automation', 'pipeline'],
    estimatedDuration: '30 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  // ==========================================================================
  // DEVELOPMENT COMMANDS
  // ==========================================================================

  dev: {
    name: 'dev',
    category: 'development',
    description: 'Start SST dev server with enhanced monitoring',
    longDescription: `
Starts your SST application in development mode with:
- Pre-flight health checks (11 checks)
- Real-time web dashboard (http://localhost:5173)
- Live log streaming
- Hot module reload
- Resource status monitoring

The dashboard provides a beautiful interface to monitor your development server.
    `.trim(),
    parameters: [
      {
        name: 'skipChecks',
        type: 'boolean',
        description: 'Skip pre-flight checks',
        flag: '--skip-checks',
        default: false,
      },
      {
        name: 'port',
        type: 'number',
        description: 'Dashboard port',
        flag: '--port',
        default: 5173,
        placeholder: '5173',
      },
      {
        name: 'interactive',
        type: 'boolean',
        description: 'Run interactive setup wizard',
        flag: '--interactive',
        default: false,
      },
    ],
    examples: [
      {
        command: 'dk dev',
        description: 'Start dev server with dashboard',
      },
      {
        command: 'dk dev --skip-checks',
        description: 'Skip health checks',
      },
      {
        command: 'dk dev --port=3001',
        description: 'Use custom dashboard port',
      },
      {
        command: 'dk dev --interactive',
        description: 'Run with setup wizard',
      },
    ],
    icon: '🚀',
    keywords: ['start', 'develop', 'server', 'local', 'run'],
    estimatedDuration: '2-5 minutes',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  // ==========================================================================
  // DEPLOYMENT COMMANDS
  // ==========================================================================

  deploy: {
    name: 'deploy',
    category: 'deployment',
    description: 'Deploy to staging or production',
    longDescription: `
Full production deployment with 5-stage safety system:

1. SST Environment Checks - Fast feedback on config issues
2. Quality Checks - TypeScript, tests, build, lint
3. SST Deployment - Infrastructure provisioning
4. Post-Deployment Validation - CloudFront, SSL, OAC
5. Health Verification - Application health checks

Includes automatic rollback guidance on failures.
    `.trim(),
    parameters: [
      {
        name: 'stage',
        type: 'enum',
        description: 'Deployment stage',
        required: true,
        options: ['staging', 'production'],
        validation: StageSchema,
      },
      {
        name: 'skipChecks',
        type: 'boolean',
        description: 'Skip all quality checks',
        flag: '--skip-checks',
        default: false,
      },
      {
        name: 'dryRun',
        type: 'boolean',
        description: 'Preview without deploying',
        flag: '--dry-run',
        default: false,
      },
      {
        name: 'showDiff',
        type: 'boolean',
        description: 'Show AWS resource changes',
        flag: '--show-diff',
        default: false,
      },
      {
        name: 'verbose',
        type: 'boolean',
        description: 'Detailed logging',
        flag: '--verbose',
        default: false,
      },
      {
        name: 'benchmark',
        type: 'boolean',
        description: 'Show performance report',
        flag: '--benchmark',
        default: false,
      },
      {
        name: 'logLevel',
        type: 'enum',
        description: 'Log verbosity level',
        flag: '--log-level',
        options: ['debug', 'info', 'warn', 'error'],
        default: 'info',
        validation: LogLevelSchema,
      },
      {
        name: 'withMaintenanceMode',
        type: 'boolean',
        description: 'Show maintenance page during deploy',
        flag: '--with-maintenance-mode',
        default: false,
      },
      {
        name: 'maintenancePage',
        type: 'string',
        description: 'Custom maintenance page path',
        flag: '--maintenance-page',
        placeholder: './maintenance.html',
      },
    ],
    examples: [
      {
        command: 'dk deploy staging',
        description: 'Deploy to staging',
      },
      {
        command: 'dk deploy production',
        description: 'Deploy to production',
      },
      {
        command: 'dk deploy staging --dry-run',
        description: 'Preview staging deployment',
      },
      {
        command: 'dk deploy production --skip-checks',
        description: 'Emergency production hotfix',
      },
      {
        command: 'dk deploy staging --with-maintenance-mode',
        description: 'Deploy with maintenance page',
      },
    ],
    icon: '🚀',
    keywords: ['ship', 'release', 'publish', 'push'],
    estimatedDuration: '5-15 minutes',
    dangerLevel: 'high',
    requiresConfig: true,
  },

  status: {
    name: 'status',
    category: 'deployment',
    description: 'Check deployment status',
    longDescription: `
Analyzes current deployment state including:
- SST stack status
- CloudFront distribution status
- SSL certificate validity
- DNS configuration
- Resource health

Can check a specific stage or all stages.
    `.trim(),
    parameters: [
      {
        name: 'stage',
        type: 'enum',
        description: 'Deployment stage (optional)',
        options: ['staging', 'production'],
        validation: StageSchema.optional(),
      },
    ],
    examples: [
      {
        command: 'dk status',
        description: 'Check all stages',
      },
      {
        command: 'dk status staging',
        description: 'Check staging only',
      },
    ],
    icon: '📊',
    keywords: ['check', 'info', 'state', 'deployment'],
    estimatedDuration: '10-30 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  health: {
    name: 'health',
    category: 'deployment',
    description: 'Run health checks on deployed application',
    longDescription: `
Validates deployed application health:
- HTTP endpoints respond correctly
- SSL certificates valid
- CloudFront serving content
- Lambda functions operational
- Database connectivity

Returns exit code 0 if all checks pass, 1 if any fail.
    `.trim(),
    parameters: [
      {
        name: 'stage',
        type: 'enum',
        description: 'Deployment stage',
        required: true,
        options: ['staging', 'production'],
        validation: StageSchema,
      },
    ],
    examples: [
      {
        command: 'dk health staging',
        description: 'Check staging health',
      },
      {
        command: 'dk health production',
        description: 'Check production health',
      },
    ],
    icon: '🏥',
    keywords: ['check', 'test', 'verify', 'monitor'],
    estimatedDuration: '10-20 seconds',
    dangerLevel: 'safe',
    requiresConfig: true,
  },

  // ==========================================================================
  // MANAGEMENT COMMANDS
  // ==========================================================================

  recover: {
    name: 'recover',
    category: 'management',
    description: 'Recover from deployment failures',
    longDescription: `
Recovery tools for common failure scenarios:

- cloudfront: Fix stuck CloudFront distributions
- state: Repair corrupted Pulumi state
- dev: General dev environment recovery

Each recovery target has specific remediation steps.
    `.trim(),
    parameters: [
      {
        name: 'target',
        type: 'enum',
        description: 'Recovery target',
        required: true,
        options: ['cloudfront', 'state', 'dev'],
        validation: RecoverTargetSchema,
      },
    ],
    examples: [
      {
        command: 'dk recover dev',
        description: 'Fix dev environment',
      },
      {
        command: 'dk recover cloudfront',
        description: 'Fix CloudFront issues',
      },
      {
        command: 'dk recover state',
        description: 'Repair Pulumi state',
      },
    ],
    icon: '🔧',
    keywords: ['fix', 'repair', 'restore', 'troubleshoot'],
    estimatedDuration: '30-60 seconds',
    dangerLevel: 'moderate',
    requiresConfig: true,
  },

  cloudfront: {
    name: 'cloudfront',
    category: 'management',
    description: 'Manage CloudFront distributions',
    longDescription: `
CloudFront management commands:

- audit: Check all distributions for issues
- cleanup: Remove orphaned/old distributions
- report: Generate comprehensive distribution report

Helps maintain clean CloudFront configuration.
    `.trim(),
    parameters: [
      {
        name: 'subcommand',
        type: 'enum',
        description: 'CloudFront command',
        required: true,
        options: ['audit', 'cleanup', 'report'],
        validation: CloudFrontCommandSchema,
      },
    ],
    examples: [
      {
        command: 'dk cloudfront audit',
        description: 'Audit all distributions',
      },
      {
        command: 'dk cloudfront cleanup',
        description: 'Remove orphaned distributions',
      },
      {
        command: 'dk cloudfront report',
        description: 'Generate distribution report',
      },
    ],
    icon: '☁️',
    keywords: ['cdn', 'distribution', 'cache', 'aws'],
    estimatedDuration: '30-60 seconds',
    dangerLevel: 'moderate',
    requiresConfig: true,
  },

  // ==========================================================================
  // PACKAGE MANAGEMENT COMMANDS
  // ==========================================================================

  release: {
    name: 'release',
    category: 'package',
    description: 'Version, test, and publish package',
    longDescription: `
Automated release process for npm packages:

1. Run full test suite
2. Bump version (patch/minor/major)
3. Generate changelog
4. Create git tag
5. Publish to npm
6. Push to GitHub

Follows semantic versioning (semver) conventions.
    `.trim(),
    parameters: [
      {
        name: 'type',
        type: 'enum',
        description: 'Release type',
        required: true,
        options: ['patch', 'minor', 'major'],
        validation: ReleaseTypeSchema,
      },
      {
        name: 'dryRun',
        type: 'boolean',
        description: 'Preview without publishing',
        flag: '--dry-run',
        default: false,
      },
      {
        name: 'skipTests',
        type: 'boolean',
        description: 'Skip test validation (dangerous!)',
        flag: '--skip-tests',
        default: false,
      },
    ],
    examples: [
      {
        command: 'dk release patch',
        description: 'Bug fix release (2.8.0 → 2.8.1)',
      },
      {
        command: 'dk release minor',
        description: 'Feature release (2.8.0 → 2.9.0)',
      },
      {
        command: 'dk release major',
        description: 'Breaking change (2.8.0 → 3.0.0)',
      },
      {
        command: 'dk release minor --dry-run',
        description: 'Preview release without publishing',
      },
    ],
    icon: '📦',
    keywords: ['publish', 'version', 'npm', 'semver'],
    estimatedDuration: '2-5 minutes',
    dangerLevel: 'high',
    requiresConfig: false,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all commands in a category
 */
export function getCommandsByCategory(category: CommandCategory): CommandMetadata[] {
  return Object.values(commandRegistry).filter(cmd => cmd.category === category);
}

/**
 * Get command metadata by name
 */
export function getCommandMetadata(name: string): CommandMetadata | undefined {
  return commandRegistry[name];
}

/**
 * Get all command names
 */
export function getAllCommandNames(): string[] {
  return Object.keys(commandRegistry);
}

/**
 * Search commands by keyword (fuzzy matching)
 */
export function searchCommands(query: string): CommandMetadata[] {
  const lowerQuery = query.toLowerCase();

  return Object.values(commandRegistry).filter(cmd => {
    // Match name
    if (cmd.name.toLowerCase().includes(lowerQuery)) return true;

    // Match description
    if (cmd.description.toLowerCase().includes(lowerQuery)) return true;

    // Match keywords
    if (cmd.keywords.some(k => k.toLowerCase().includes(lowerQuery))) return true;

    // Match category
    if (cmd.category.toLowerCase().includes(lowerQuery)) return true;

    return false;
  });
}

/**
 * Get command categories
 */
export function getCategories(): CommandCategory[] {
  return ['setup', 'development', 'deployment', 'management', 'package'];
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: CommandCategory): string {
  const names: Record<CommandCategory, string> = {
    setup: 'Setup',
    development: 'Development',
    deployment: 'Deployment',
    management: 'Management',
    package: 'Package Management',
  };
  return names[category];
}

/**
 * Get danger level color (for UI)
 */
export function getDangerLevelColor(level: DangerLevel): string {
  const colors = {
    safe: 'green',
    moderate: 'yellow',
    high: 'orange',
    critical: 'red',
  };
  return colors[level];
}
