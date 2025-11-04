# Deploy-Kit - Project Context

**Package Manager:** pnpm (required for development)
**Last Updated:** 2025-11-04

---

## Development

```bash
pnpm install        # Install dependencies
pnpm run build      # Build TypeScript
pnpm run watch      # Watch mode
pnpm test           # Run tests
```

---

## Release Workflow

**TypeScript release command:**

```bash
# Using npm scripts
pnpm run release:patch  # Bug fixes (2.8.0 → 2.8.1)
pnpm run release:minor  # New features (2.8.0 → 2.9.0)
pnpm run release:major  # Breaking changes (2.8.0 → 3.0.0)

# Or directly
node dist/cli.js release patch
node dist/cli.js release minor --dry-run  # Preview changes
```

**The release command automatically:**
1. Finds or creates main worktree (works from Conductor!)
2. Verifies clean git state
3. Runs build and tests
4. Bumps version in package.json
5. Commits and creates git tag
6. Pushes to GitHub (main + tag)
7. Publishes to GitHub Packages
8. Creates GitHub release with notes
9. Auto-rollback on failure

**Flags:**
- `--dry-run` - Preview all steps without making changes
- `--skip-tests` - Skip test validation (use with caution)

**Note:** Uses `git -C` flag to operate on main worktree from anywhere, including Conductor worktrees.

---

## GitHub Packages

Published to `@duersjefen/deploy-kit` on GitHub Packages (not public npm).

**.npmrc configuration:**
```ini
@duersjefen:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

---

## Key Architecture

**Package Manager Detection:**
- `src/utils/package-manager.ts` - Detects user's package manager (pnpm/yarn/bun/npm)
- Used in: init command, quality tools, Makefile generation, error messages
- Deploy-Kit users can use any package manager - we detect and adapt

**Important Files:**
- `src/cli/commands/release.ts` - TypeScript release command (replaces bash script)
- `src/cli/init/` - Project initialization with package manager detection
- `dist/` - Compiled output (auto-generated, committed to repo)

---

## Common Issues

**"Tests fail with AWS credentials error"**
- Expected - integration tests require AWS credentials
- Unit tests (like package-manager.test.ts) should pass
- Run specific tests: `node --test dist/path/to/test.js`

---

That's it! Everything else should be self-explanatory from the code.
