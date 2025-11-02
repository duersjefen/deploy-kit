# Deploy-Kit Development & Release Workflow

**Version:** 1.0
**Last Updated:** 2025-11-02

## Quick Reference

```bash
# Development
npm run build          # Build TypeScript
npm run watch         # Watch mode
npm test              # Run tests

# Release (ONE COMMAND!)
npm run release:minor # Release minor version
npm run release:patch # Release patch version
npm run release:major # Release major version
```

---

## ⚡ Development Workflow

### Setup
```bash
cd deploy-kit
npm install
npm run build
```

### Local Development
```bash
# Watch mode for development
npm run watch

# Run tests
npm test

# Build and test before committing
npm run build && npm test
```

### Code Organization

**Source Files:** `src/`
- `cli.ts` - Main CLI entry point
- `cli/commands/` - CLI commands (dev, deploy, etc.)
- `cli/dev-checks/` - Pre-flight checks for dev command
- `deployment/` - Deployment logic
- `lib/` - Utilities and shared code

**Compiled Output:** `dist/`
- Auto-generated from TypeScript
- Don't edit manually
- Included in npm package

### Making Changes

1. **Edit source files** in `src/`
2. **Run tests**: `npm test`
3. **Build**: `npm run build`
4. **Verify**: Check `dist/` files compile correctly
5. **Commit**: Include both `src/` and `dist/` changes

---

## 🎯 Release Workflow

### One-Command Release (Recommended)

**After merging a PR to main:**

```bash
npm run release:minor
```

This single command:
1. ✅ Bumps version in package.json
2. ✅ Commits version bump
3. ✅ Creates git tag (v2.x.x)
4. ✅ Pushes to GitHub main branch
5. ✅ Pushes git tag
6. ✅ Builds and tests
7. ✅ Publishes to GitHub Packages
8. ✅ Creates GitHub release with notes

**That's it!** No manual steps needed.

### Release Types

- **`npm run release:patch`** - Bug fixes (v2.6.0 → v2.6.1)
  - Backwards compatible fixes only
  - No new features or breaking changes

- **`npm run release:minor`** - New features (v2.6.0 → v2.7.0)
  - Backwards compatible additions
  - New CLI flags, improved output, etc.

- **`npm run release:major`** - Breaking changes (v2.6.0 → v3.0.0)
  - Breaking API changes
  - Major refactors

### What Happens Automatically

The `scripts/release.sh` script handles:

```
Step 1: Verify we're on main branch
Step 2: Verify working directory is clean
Step 3: Bump version (patch/minor/major)
Step 4: Commit version bump
Step 5: Create git tag
Step 6: Push to GitHub (main + tag)
Step 7: Build and test
Step 8: Publish to GitHub Packages
Step 9: Create GitHub release with auto-generated notes
```

### Monitoring the Release

The script shows colored output for each step:
```
🚀 Starting minor release workflow
Step 1/8: Verifying we're on main branch...
✅ On main branch

Step 2/8: Verifying working directory is clean...
✅ Working directory is clean

... (continues through all steps)

✅ Release v2.7.0 complete!

📦 Next steps:
1. Verify the release on GitHub: https://github.com/duersjefen/deploy-kit/releases/tag/v2.7.0
2. Verify the package on GitHub Packages
3. Update dependent projects
```

---

## 📦 Installation & Distribution

### GitHub Packages (Private)

The package is published to **GitHub Packages** (not public npm).

**Configuration:**

In your project's `.npmrc`:
```ini
@duersjefen:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**Installation:**
```bash
npm install @duersjefen/deploy-kit@latest
```

### Verifying Release

After running `npm run release:minor`:

1. **GitHub Release**: https://github.com/duersjefen/deploy-kit/releases
   - Should show latest version as "Latest"
   - Includes auto-generated release notes from commit

2. **GitHub Packages**: https://github.com/duersjefen/deploy-kit/pkgs/npm/deploy-kit
   - Should show new version published

3. **Git Tags**:
   ```bash
   git tag --list
   # Should show: v2.6.0, v2.7.0, etc.
   ```

---

## 🔄 PR & Merge Workflow

### Creating a Feature

1. **Create feature branch:**
   ```bash
   git checkout -b feat/issue-123-description
   ```

2. **Make changes:**
   - Edit `src/` files
   - Run `npm run build && npm test`
   - Commit with descriptive message

3. **Push and create PR:**
   ```bash
   git push -u origin feat/issue-123-description
   gh pr create --title "feat: Description" --body "..."
   ```

4. **Merge to main:**
   ```bash
   gh pr merge PR_NUMBER --squash
   ```

5. **Release:**
   ```bash
   git checkout main
   git pull origin main
   npm run release:minor
   ```

---

## 🐛 Troubleshooting

### Release script fails at step 6 (GitHub push)

**Problem:** `fatal: 'main' is already used by worktree`

**Solution:** You're in a Conductor workspace. The `scripts/release.sh` handles this:
```bash
git push origin HEAD:main  # Pushes current branch to main on origin
```

### Release script fails at step 7 (publish)

**Problem:** Tests fail during `npm run prepublishOnly`

**Solution:** Fix the failing tests before releasing:
```bash
npm test  # See what's failing
# Fix issues in src/
npm run build && npm test  # Verify fix
# Then try release again
npm run release:minor
```

### Release script fails at step 8 (GitHub release)

**Problem:** `gh release create` fails with permission error

**Solution:** Verify GitHub token:
```bash
gh auth status
# If not authenticated: gh auth login
```

### Want to manually debug?

Each step of the release can be run manually:

```bash
# Manual release (for debugging)
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: Bump version to X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin HEAD:main
git push origin vX.Y.Z
npm run prepublishOnly
npm run publish:gh
gh release create vX.Y.Z --title "..." --notes "..."
```

---

## 📝 Semantic Versioning

**Version Format:** `MAJOR.MINOR.PATCH`

- **MAJOR (2.0.0)**: Breaking changes to CLI or API
- **MINOR (2.1.0)**: New features (backwards compatible)
- **PATCH (2.0.1)**: Bug fixes (backwards compatible)

**Examples:**

```
v2.6.0 → v2.6.1  (patch)  - Bug fix in dev command
v2.6.0 → v2.7.0  (minor)  - New --native flag added
v2.6.0 → v3.0.0  (major)  - CLI rewritten, breaking changes
```

---

## 🔗 Important Files

| File | Purpose |
|------|---------|
| `package.json` | Package metadata, version, npm scripts |
| `scripts/release.sh` | One-command release automation |
| `src/cli.ts` | Main CLI entry point |
| `src/deployer.ts` | Deployment orchestration |
| `dist/` | Compiled output (auto-generated) |
| `.npmrc` | npm configuration (includes registry) |

---

## 🚀 Common Tasks

### "I made a fix, how do I release it?"
```bash
# Ensure code is on main
git checkout main && git pull

# Release!
npm run release:patch
```

### "I added a new feature, how do I release it?"
```bash
# Ensure code is on main
git checkout main && git pull

# Release!
npm run release:minor
```

### "I need to undo the last release"
```bash
# Delete local tag
git tag -d v2.7.0

# Delete remote tag
git push origin :refs/tags/v2.7.0

# Revert version commit
git revert HEAD

# Revert GitHub release
gh release delete v2.7.0

# Note: Package already published to GitHub Packages
# You can yank the version or just release a new patch with a fix
```

### "How do I test the package locally?"
```bash
# Build
npm run build

# Install locally in another project
npm install file:../deploy-kit
```

---

## ⚙️ Configuration

### GitHub Packages Authentication

The release script uses:
```bash
GITHUB_TOKEN=$(gh auth token)
```

This automatically uses your `gh` CLI authentication. Ensure you're authenticated:
```bash
gh auth status
```

### Verifying Configuration

Before releasing, verify:

1. **On main branch:** `git branch` shows `* main`
2. **Working directory clean:** `git status` shows no changes
3. **GitHub authenticated:** `gh auth status` shows ✓
4. **npm configured:** `.npmrc` has GitHub Packages registry

---

## 📚 References

- **CLI Code:** `src/cli.ts`
- **Release Script:** `scripts/release.sh`
- **Package Config:** `package.json`
- **Repository:** https://github.com/duersjefen/deploy-kit
- **Releases:** https://github.com/duersjefen/deploy-kit/releases

---

**Last Release:** v2.6.0 (2025-11-02)
**Maintained by:** Martijn
