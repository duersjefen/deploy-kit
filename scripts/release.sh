#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
BUMP_TYPE=""
DRY_RUN=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    patch|minor|major)
      BUMP_TYPE=$1
      shift
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      echo "Usage: ./scripts/release.sh [patch|minor|major] [--dry-run] [--skip-tests]"
      exit 1
      ;;
  esac
done

# Set default if not provided
BUMP_TYPE=${BUMP_TYPE:-minor}

if [ "$BUMP_TYPE" != "patch" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "major" ]; then
  echo -e "${RED}❌ Invalid bump type: $BUMP_TYPE${NC}"
  echo "Usage: ./scripts/release.sh [patch|minor|major] [--dry-run] [--skip-tests]"
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}🔍 DRY RUN MODE - No changes will be made${NC}\n"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 Starting ${BUMP_TYPE} release workflow${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Rollback function
rollback() {
  local step=$1
  echo -e "\n${YELLOW}⚠️  Performing rollback from step ${step}...${NC}"

  if [ $step -ge 5 ]; then
    echo "  → Deleting git tag ${VERSION_TAG}..."
    git tag -d $VERSION_TAG 2>/dev/null || true
  fi

  if [ $step -ge 4 ]; then
    echo "  → Resetting version bump commit..."
    git reset --hard HEAD~1 2>/dev/null || true
  fi

  echo -e "${GREEN}✅ Rollback complete${NC}"
}

# Trap errors and rollback
trap 'echo -e "\n${RED}❌ Release failed at step $CURRENT_STEP${NC}"; rollback $CURRENT_STEP; exit 1' ERR

CURRENT_STEP=0

# Step 0: Pre-flight checks
echo -e "${BLUE}Step 0/9:${NC} Running pre-flight checks..."
CURRENT_STEP=0

# Check required commands
for cmd in git pnpm gh; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}❌ Required command not found: $cmd${NC}"
    exit 1
  fi
done

# Check gh authentication
if ! gh auth status &> /dev/null; then
  echo -e "${RED}❌ Not authenticated with GitHub CLI${NC}"
  echo "Run: gh auth login"
  exit 1
fi

echo -e "${GREEN}✅ Pre-flight checks passed${NC}\n"

# Step 1: Verify we're on main branch
echo -e "${BLUE}Step 1/9:${NC} Verifying branch..."
CURRENT_STEP=1

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
WORKTREE_ROOT=$(git rev-parse --show-toplevel)

# Must be on main branch
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${RED}❌ Not on main branch (current: $CURRENT_BRANCH)${NC}"

  if [[ "$WORKTREE_ROOT" =~ \.conductor ]]; then
    echo -e "${YELLOW}ℹ️  You're in Conductor worktree${NC}"
    echo "To release, run from the main worktree:"
    echo "  cd /Users/martijn/Documents/Projects/deploy-kit"
    echo "  ./scripts/release.sh $BUMP_TYPE"
  else
    echo "Please switch to main branch first:"
    echo "  git checkout main"
  fi
  exit 1
fi

echo -e "${GREEN}✅ On main branch${NC}\n"

# Step 2: Verify working directory is clean
echo -e "${BLUE}Step 2/9:${NC} Verifying working directory is clean..."
CURRENT_STEP=2

if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}❌ Working directory has uncommitted changes${NC}"
  git status --short
  echo "Please commit or stash changes first"
  exit 1
fi
echo -e "${GREEN}✅ Working directory is clean${NC}\n"

# Step 3: Run tests
if [ "$SKIP_TESTS" = false ]; then
  echo -e "${BLUE}Step 3/9:${NC} Running tests..."
  CURRENT_STEP=3

  echo "  → Building..."
  pnpm run build

  echo "  → Running unit tests..."
  if ! pnpm run test:unit; then
    echo -e "${RED}❌ Tests failed - aborting release${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ All tests passed${NC}\n"
else
  echo -e "${YELLOW}Step 3/9: Skipping tests (--skip-tests flag)${NC}\n"
  CURRENT_STEP=3
fi

# Step 4: Bump version
echo -e "${BLUE}Step 4/9:${NC} Bumping version (${BUMP_TYPE})..."
CURRENT_STEP=4

if [ "$DRY_RUN" = true ]; then
  CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
  echo -e "${YELLOW}[DRY RUN] Would bump version from ${CURRENT_VERSION}${NC}"
  # Calculate what the new version would be (simplified)
  IFS='.' read -r -a version_parts <<< "$CURRENT_VERSION"
  case $BUMP_TYPE in
    major) NEW_VERSION="$((version_parts[0] + 1)).0.0" ;;
    minor) NEW_VERSION="${version_parts[0]}.$((version_parts[1] + 1)).0" ;;
    patch) NEW_VERSION="${version_parts[0]}.${version_parts[1]}.$((version_parts[2] + 1))" ;;
  esac
else
  pnpm version $BUMP_TYPE --no-git-tag-version
  NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
fi

VERSION_TAG="v${NEW_VERSION}"
echo -e "${GREEN}✅ Version bumped to ${NEW_VERSION}${NC}\n"

# Step 5: Commit version bump
echo -e "${BLUE}Step 5/9:${NC} Committing version bump..."
CURRENT_STEP=5

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would commit: chore: Bump version to $NEW_VERSION${NC}\n"
else
  git add package.json pnpm-lock.yaml
  git commit -m "chore: Bump version to $NEW_VERSION"
  echo -e "${GREEN}✅ Version bump committed${NC}\n"
fi

# Step 6: Create git tag
echo -e "${BLUE}Step 6/9:${NC} Creating git tag ${VERSION_TAG}..."
CURRENT_STEP=6

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create tag: ${VERSION_TAG}${NC}\n"
else
  LAST_COMMIT_MSG=$(git log -1 --format=%s)
  git tag -a $VERSION_TAG -m "$VERSION_TAG: $LAST_COMMIT_MSG"
  echo -e "${GREEN}✅ Git tag created${NC}\n"
fi

# Step 7: Push to GitHub
echo -e "${BLUE}Step 7/9:${NC} Pushing to GitHub..."
CURRENT_STEP=7

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would push:${NC}"
  echo "  → git push origin HEAD:main"
  echo "  → git push origin ${VERSION_TAG}"
  echo ""
else
  echo "  → Pushing commit..."
  if ! git push origin HEAD:main; then
    echo -e "${RED}❌ Failed to push commit${NC}"
    exit 1
  fi

  echo "  → Pushing tag..."
  if ! git push origin $VERSION_TAG; then
    echo -e "${RED}❌ Failed to push tag${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ Pushed to GitHub${NC}\n"
fi

# Step 8: Build and publish
echo -e "${BLUE}Step 8/9:${NC} Building and publishing to GitHub Packages..."
CURRENT_STEP=8

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would publish to GitHub Packages${NC}\n"
else
  echo "  → Running prepublishOnly (if exists)..."
  if grep -q '"prepublishOnly"' package.json; then
    pnpm run prepublishOnly
  else
    echo "    (prepublishOnly script not found, skipping)"
  fi

  echo "  → Publishing package..."
  if ! GITHUB_TOKEN=$(gh auth token) pnpm publish --no-git-checks; then
    echo -e "${RED}❌ Publishing failed${NC}"
    echo "Package was NOT published, but version was committed and tagged."
    echo "You may need to manually publish or rollback the version."
    exit 1
  fi

  echo -e "${GREEN}✅ Published to GitHub Packages${NC}\n"
fi

# Step 9: Create GitHub release
echo -e "${BLUE}Step 9/9:${NC} Creating GitHub release..."
CURRENT_STEP=9

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create GitHub release for ${VERSION_TAG}${NC}\n"
else
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

  if ! gh release create $VERSION_TAG --title "$RELEASE_TITLE" --notes "$RELEASE_NOTES"; then
    echo -e "${YELLOW}⚠️  Failed to create GitHub release (non-fatal)${NC}"
    echo "Package was published successfully, but release creation failed."
    echo "You can manually create the release on GitHub."
  else
    echo -e "${GREEN}✅ GitHub release created${NC}\n"
  fi
fi

# Disable error trap (we succeeded!)
trap - ERR

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Release ${VERSION_TAG} complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

if [ "$DRY_RUN" = false ]; then
  echo -e "${YELLOW}📦 Next steps:${NC}"
  echo "1. Verify the release on GitHub: https://github.com/duersjefen/deploy-kit/releases/tag/${VERSION_TAG}"
  echo "2. Verify the package on GitHub Packages"
  echo "3. Update dependent projects to use @duersjefen/deploy-kit@${NEW_VERSION}"
  echo ""
else
  echo -e "${YELLOW}🔍 Dry run complete - no changes were made${NC}"
  echo "Run without --dry-run to perform the actual release"
  echo ""
fi
