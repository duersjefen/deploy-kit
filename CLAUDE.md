# Deploy-Kit - Project Context

**IMPORTANT:** See your global CLAUDE.md for universal rules that apply to ALL projects.
- **Local users:** Use `~/.claude/CLAUDE.md` (your personal global file)
- **CCW users:** Use `.claude/GLOBAL_CLAUDE.md` (auto-setup by `dk ccw`)

**Package Manager:** pnpm (required for development)
**Last Updated:** 2025-11-05

---

## Workflow

We use `/ship-pr` for everything - it's all you need!

### Regular Development (No Publishing)

```bash
/ship-pr
```

**Does:**
1. Commits changes with descriptive conventional message
2. Creates PR with proper description (Summary, Changes, Test Plan)
3. Merges PR with squash
4. Updates local main worktree (Conductor-aware)
5. Updates Linear issue to "Done" (if detected)

**Use for:** Feature branches, bug fixes, refactoring - anything that doesn't need publishing

### Publishing (With Version Bump)

```bash
/ship-pr patch   # Bug fixes (2.9.3 → 2.9.4)
/ship-pr minor   # New features (2.9.3 → 2.10.0)
/ship-pr major   # Breaking changes (2.9.3 → 3.0.0)
```

**Does everything above PLUS:**
6. Bumps version in package.json
7. Commits version bump
8. Publishes to npm

**Use for:** Releasing new versions of the package

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
