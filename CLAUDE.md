# Deploy-Kit - Project Context

**IMPORTANT:** See `.claude-code/GLOBAL_CLAUDE.md` for universal rules that apply to ALL projects.


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

**Two ways to release:**

### A) /ship-pr (Recommended for regular development)

Claude Code command that handles complete workflow: Commit → PR → Merge → Publish

```bash
# From your feature branch in Conductor worktree:
/ship-pr
```

**Automatically:**
1. Commits changes with descriptive message
2. Creates and merges PR
3. Updates local main worktree
4. Prompts for version bump (MAJOR/MINOR/PATCH/SKIP)
5. Runs build and tests
6. Publishes to npm
7. Creates GitHub release

**When to use:** Regular feature development with PR workflow

### B) pnpm release:* (For direct releases)

TypeScript release command for hotfixes or CI/CD:

```bash
pnpm run release:patch  # Bug fixes (2.8.0 → 2.8.1)
pnpm run release:minor  # New features (2.8.0 → 2.9.0)
pnpm run release:major  # Breaking changes (2.8.0 → 3.0.0)

# Or directly with dry-run
node dist/cli.js release patch --dry-run
```

**When to use:** Hotfixes, republishing, or automated CI/CD pipelines

**Note:** Both use `git -C` flag to operate on main worktree from anywhere, including Conductor worktrees.

---

## npm Publishing

Published to public npm registry as `@duersjefen/deploy-kit`.

**Installation:**
```bash
npm install -g @duersjefen/deploy-kit  # Global
npm install --save-dev @duersjefen/deploy-kit  # Dev dependency
npx @duersjefen/deploy-kit --version  # Direct usage
```

**Note:** `.npmrc` has GitHub Packages configuration commented out (switched to public npm).

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
