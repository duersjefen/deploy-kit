# Deploy-Kit - Project Context

**Package Manager:** pnpm (required for development)
**Last Updated:** 2025-11-05

---

## Workflow

Use `/ship-pr` for everything - it's all you need!

- `/ship-pr` - Regular development (commits, PR, merge, update main)
- `/ship-pr patch|minor|major` - Publishing releases (includes version bump + npm publish)

---

## Key Architecture

**Package Manager Detection:**
- `src/utils/package-manager.ts` - Detects user's package manager (pnpm/yarn/bun/npm)
- Used in: init command, quality tools, Makefile generation, error messages
- Deploy-Kit users can use any package manager - we detect and adapt

**Important Files:**
- `src/cli/commands/ccw.ts` - Claude Code for the Web setup (dk ccw)
- `src/cli/commands/remote-deploy.ts` - GitHub Actions workflow setup (dk remote-deploy)
- `src/cli/commands/release.ts` - TypeScript release command (for CI/CD)
- `src/cli/init/` - Project initialization with package manager detection

---

## Common Issues

**"Tests fail with AWS credentials error"**
- Expected - integration tests require AWS credentials
- Unit tests (like package-manager.test.ts) should pass
- Run specific tests: `node --test dist/path/to/test.js`

---

That's it! Everything else should be self-explanatory from the code.
