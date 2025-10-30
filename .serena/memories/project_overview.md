# Deploy-Kit Project Overview

## Purpose
Reusable deployment system for SST + Next.js + DynamoDB applications with safety checks and CloudFront validation.

## Current Issues (from Gabs Massage deployment)
1. **SST build handling is wrong** - Lines 164-167 in deployer.ts call `npm run build` separately, but SST projects don't have this. SST's `sst deploy` command handles build internally.
2. **Error messages reference Makefiles** - e.g., "run: make recover-staging" - but the package should be self-contained
3. **Config path hardcoded** - `.deploy-config.json` is hardcoded in cli.ts:15
4. **No SST auto-detection** - Package doesn't detect if project uses SST and adjust behavior accordingly

## Tech Stack
- TypeScript (tsconfig.json present)
- Build: tsc (npm run build)
- CLI: bin/cli.js entry point
- Key dependencies: chalk, ora, execa, dotenv, node-fetch
- Node.js >=18.0.0

## Project Structure
- `bin/cli.js` - CLI entry point
- `src/cli.ts` - Command-line interface
- `src/deployer.ts` - Main deployment orchestrator (DeploymentKit class)
- `src/types.ts` - TypeScript types
- `src/health/checker.ts` - Health check validation
- `src/locks/manager.ts` - Lock management system
- `src/safety/pre-deploy.ts` - Pre-deployment checks
- `src/safety/post-deploy.ts` - Post-deployment checks
- `templates/` - Example configs
- `package.json` - Package metadata (name: @duersjefen/deploy-kit)

## Important Files
- Package name: `@duersjefen/deploy-kit`
- Published to: GitHub Packages (npm.pkg.github.com)
- Main export: dist/index.js
- CLI bin: deploy-kit (see package.json bin field)

## Code Style & Conventions
- TypeScript with strict types
- Classes for stateful components (DeploymentKit)
- Async/await pattern
- Spinner feedback (ora) for user feedback
- Chalk for colored output
- Error handling with try/catch
