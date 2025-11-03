#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get bump type from argument (patch, minor, major)
BUMP_TYPE=${1:-minor}

if [ "$BUMP_TYPE" != "patch" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "major" ]; then
  echo -e "${RED}❌ Invalid bump type: $BUMP_TYPE${NC}"
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 Starting ${BUMP_TYPE} release workflow${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Step 1: Verify we're on main
echo -e "${BLUE}Step 1/8:${NC} Verifying we're on main branch..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}❌ Not on main branch (current: $CURRENT_BRANCH)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ On main branch${NC}\n"

# Step 2: Verify working directory is clean
echo -e "${BLUE}Step 2/8:${NC} Verifying working directory is clean..."
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}❌ Working directory has uncommitted changes${NC}"
  echo "Please commit or stash changes first"
  exit 1
fi
echo -e "${GREEN}✅ Working directory is clean${NC}\n"

# Step 3: Bump version
echo -e "${BLUE}Step 3/8:${NC} Bumping version (${BUMP_TYPE})..."
pnpm version $BUMP_TYPE --no-git-tag-version > /dev/null
NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
VERSION_TAG="v${NEW_VERSION}"
echo -e "${GREEN}✅ Version bumped to ${NEW_VERSION}${NC}\n"

# Step 4: Commit version bump
echo -e "${BLUE}Step 4/8:${NC} Committing version bump..."
git add package.json pnpm-lock.yaml
git commit -m "chore: Bump version to $NEW_VERSION" > /dev/null
echo -e "${GREEN}✅ Version bump committed${NC}\n"

# Step 5: Create git tag
echo -e "${BLUE}Step 5/8:${NC} Creating git tag ${VERSION_TAG}..."
LAST_COMMIT_MSG=$(git log -1 --format=%s)
git tag -a $VERSION_TAG -m "$VERSION_TAG: $LAST_COMMIT_MSG" > /dev/null 2>&1
echo -e "${GREEN}✅ Git tag created${NC}\n"

# Step 6: Push to GitHub
echo -e "${BLUE}Step 6/8:${NC} Pushing to GitHub..."
git push origin HEAD:main > /dev/null 2>&1
git push origin $VERSION_TAG > /dev/null 2>&1
echo -e "${GREEN}✅ Pushed to GitHub${NC}\n"

# Step 7: Build and publish
echo -e "${BLUE}Step 7/8:${NC} Building and publishing to GitHub Packages..."
pnpm run prepublishOnly > /dev/null 2>&1
GITHUB_TOKEN=$(gh auth token) pnpm publish --no-git-checks > /dev/null 2>&1
echo -e "${GREEN}✅ Published to GitHub Packages${NC}\n"

# Step 8: Create GitHub release
echo -e "${BLUE}Step 8/8:${NC} Creating GitHub release..."
COMMIT_MSG=$(git log -1 --pretty=%B)
RELEASE_TITLE="$VERSION_TAG: $(echo "$LAST_COMMIT_MSG" | sed 's/^[^:]*: //')"

# Build release notes from commit message
RELEASE_NOTES=$(cat <<EOF
## Changes

$COMMIT_MSG

## Installation

\`\`\`bash
# npm
npm install @duersjefen/deploy-kit@${NEW_VERSION}

# pnpm
pnpm add @duersjefen/deploy-kit@${NEW_VERSION}

# yarn
yarn add @duersjefen/deploy-kit@${NEW_VERSION}
\`\`\`

Configure your project to use GitHub Packages:

\`\`\`bash
echo "@duersjefen:registry=https://npm.pkg.github.com" >> .npmrc
export GITHUB_TOKEN=\$(gh auth token)
\`\`\`

---

**Full Changelog**: https://github.com/duersjefen/deploy-kit/compare/$(git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo 'initial')...${VERSION_TAG}
EOF
)

gh release create $VERSION_TAG --title "$RELEASE_TITLE" --notes "$RELEASE_NOTES" > /dev/null 2>&1
echo -e "${GREEN}✅ GitHub release created${NC}\n"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Release ${VERSION_TAG} complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📦 Next steps:${NC}"
echo "1. Verify the release on GitHub: https://github.com/duersjefen/deploy-kit/releases/tag/${VERSION_TAG}"
echo "2. Verify the package on GitHub Packages"
echo "3. Update dependent projects to use @duersjefen/deploy-kit@${NEW_VERSION}\n"
