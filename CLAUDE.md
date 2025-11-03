# Deploy-Kit - Project Context

**Package Manager:** pnpm (required for development)
**Last Updated:** 2025-11-03

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

**One command does everything:**

```bash
pnpm run release:patch  # Bug fixes (2.7.0 → 2.7.1)
pnpm run release:minor  # New features (2.7.0 → 2.8.0)
pnpm run release:major  # Breaking changes (2.7.0 → 3.0.0)
```

This automatically:
1. Bumps version in package.json
2. Commits and tags
3. Pushes to GitHub (main + tag)
4. Builds and publishes to GitHub Packages
5. Creates GitHub release with notes

**Note:** Requires clean git state and main branch. See `scripts/release.sh` for details.

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
- `scripts/release.sh` - Automated release workflow
- `src/cli/init/` - Project initialization with package manager detection
- `dist/` - Compiled output (auto-generated, committed to repo)

---

## Common Issues

**"Tests fail with AWS credentials error"**
- Expected - integration tests require AWS credentials
- Unit tests (like package-manager.test.ts) should pass
- Run specific tests: `node --test dist/path/to/test.js`

**"Release script fails at step 6"**
- Conductor workaround: `git push origin HEAD:main` (already in script)

---

That's it! Everything else should be self-explanatory from the code.
