---
description: Publish package to npm with GitHub Release
argument-hint: [major|minor|patch]
---

# Publish Package

Bump version → Commit → Push → Publish → GitHub Release

## Argument

- **patch** - Bug fixes (2.10.0 → 2.10.1)
- **minor** - New features (2.10.0 → 2.11.0)
- **major** - Breaking changes (2.10.0 → 3.0.0)

## Workflow

**1. Bump version and publish**
```bash
cd $(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||')  # Go to parent if Conductor
pnpm install  # Ensure dependencies installed
pnpm version [argument] --no-git-tag-version
VERSION=$(jq -r .version package.json)
git add package.json && git commit -m "chore: Bump version to $VERSION"
git push
pnpm publish --no-git-checks
```

**2. Create GitHub Release**
```bash
# Get recent commits since last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline --pretty=format:"- %s" | head -20)
else
  COMMITS=$(git log $LAST_TAG..HEAD --oneline --pretty=format:"- %s")
fi

# Create release with auto-generated notes
gh release create "v$VERSION" \
  --title "v$VERSION" \
  --notes "## Changes

$COMMITS

🤖 Generated with Claude Code"
```

## Tips

- **Run from main branch** - Ensure you're on main before publishing
- **GitHub Release** - Automatically creates release notes from commits
- **npm registry** - Package appears at https://www.npmjs.com/package/@duersjefen/deploy-kit
