# CCW Feature Task Template

This template shows how to execute a complete feature workflow in Claude Code for the Web (CCW) using helper scripts as MCP replacements.

## Prerequisites

**Environment Variables (set in CCW environment config):**
```
GITHUB_TOKEN=ghp_your_token_here
LINEAR_API_KEY=lin_api_your_key_here
NPM_TOKEN=npm_your_token_here
```

## Workflow Steps

### 1. Setup MCP-like capabilities

```bash
# Run at start of CCW session
source .claude-code/mcp-helpers/setup-mcp.sh
```

### 2. Get Linear issue details

```bash
# List my issues
linear_list_my_issues

# Get specific issue
linear_get_issue "DEP-17"
```

### 3. Create feature branch

```bash
git checkout -b feat/dep-17-feature-description
```

### 4. Implement feature

```typescript
// Make your changes here
// CCW will help with code implementation
```

### 5. Test changes

```bash
pnpm run build
pnpm test
```

### 6. Commit changes

```bash
git add -A
git commit -m "feat: Implement feature description (DEP-17)

## Summary
Brief description of changes

## Problem
Why this was needed

## Solution
How it was solved

Linear: DEP-17
🤖 Generated with Claude Code"
```

### 7. Push and create PR

```bash
git push -u origin feat/dep-17-feature-description

# Create PR using helper function
PR_NUMBER=$(github_create_pr \
  "feat: Implement feature description (DEP-17)" \
  "## Summary
Brief description

## Problem (Linear DEP-17)
Why needed

## Solution
How solved

## Test Results
✅ pnpm run build - No TypeScript errors
✅ pnpm test - All tests passing

Linear: DEP-17
🤖 Generated with Claude Code")

echo "Created PR #$PR_NUMBER"
```

### 8. Merge PR

```bash
# Merge using helper function
github_merge_pr "$PR_NUMBER"

# Delete feature branch
github_delete_branch "feat/dep-17-feature-description"
```

### 9. Update Linear issue

```bash
# Mark issue as Done
linear_update_issue_state "DEP-17" "Done"
```

### 10. Version bump and publish (packages only)

```bash
# For packages like deploy-kit, bump version
pnpm run release:patch  # or :minor or :major

# This automatically:
# - Bumps version in package.json
# - Builds TypeScript
# - Runs tests
# - Publishes to npm
# - Creates GitHub release
```

## Notes

- **For applications**: Skip step 10 (no version bumping needed)
- **For packages**: Always run release after merging feature
- **Conductor worktrees**: Use `git -C ../.. pull origin main` to sync local main after merge
- **Dry run**: Add `--dry-run` to release commands for testing

## Example Full Workflow

```bash
# 1. Setup
source .claude-code/mcp-helpers/setup-mcp.sh

# 2. Get issue
linear_get_issue "DEP-17"

# 3. Create branch
git checkout -b feat/dep-17-add-retry-logic

# 4. Implement (CCW helps here)
# ... make changes ...

# 5. Test
pnpm run build && pnpm test

# 6. Commit
git add -A
git commit -m "feat: Add retry logic to deployment checks (DEP-17)"

# 7. Push & PR
git push -u origin feat/dep-17-add-retry-logic
PR_NUMBER=$(github_create_pr "feat: Add retry logic (DEP-17)" "...")

# 8. Merge
github_merge_pr "$PR_NUMBER"
github_delete_branch "feat/dep-17-add-retry-logic"

# 9. Update Linear
linear_update_issue_state "DEP-17" "Done"

# 10. Release (packages only)
pnpm run release:minor
```
