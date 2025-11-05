# Deploy-Kit - Claude Code for Web (CCW) Environment

**IMPORTANT:** This file is only loaded in CCW environments (when CLAUDE_CODE_REMOTE=true).

---

## Environment Detection

You are currently in **Claude Code for Web (CCW)** environment. This is detected by:
- `CLAUDE_CODE_REMOTE=true` environment variable
- Running in a cloud-based development environment
- Limited permissions compared to Desktop Claude Code

---

## CCW-Specific Rules

### ❌ Commands NOT Available in CCW

**DO NOT use `/ship-pr` command:**
- This command is not available in CCW environment
- Use manual git workflow instead:
  ```bash
  git add -A
  git commit -m "message"
  git push -u origin branch-name
  bash .claude/scripts/gh_helper.sh pr create --title "..." --body "..."
  bash .claude/scripts/gh_helper.sh pr merge PR_NUMBER --squash
  ```

**DO NOT attempt to publish to npm:**
- `npm publish` requires authentication not available in CCW
- Publishing should be done from Desktop Claude Code or GitHub Actions
- You can bump versions, but cannot publish

### ✅ Commands Available in CCW

**GitHub Operations (via gh_helper.sh):**
```bash
# Create PR
bash .claude/scripts/gh_helper.sh pr create --title "..." --body "..."

# Merge PR
bash .claude/scripts/gh_helper.sh pr merge PR_NUMBER --squash

# Get PR status
bash .claude/scripts/gh_helper.sh pr view PR_NUMBER
```

**Linear Operations (via linear_helper.sh):**
```bash
# Get issue details
bash .claude/scripts/linear_helper.sh get-issue DEP-21

# List recent issues
bash .claude/scripts/linear_helper.sh list-issues DEP 10

# Update issue state
bash .claude/scripts/linear_helper.sh update-state 011CUpqCxQnHnpkdk2UzQKi1 Done
```

**Git Operations:**
- All standard git commands work
- `git commit`, `git push`, `git fetch`, `git pull`
- Branch management

**Development:**
- All build/test commands work
- TypeScript compilation
- Running tests
- Code analysis

---

## CCW Workflow for Deploy-Kit

### Regular Development (No Publishing)

```bash
# 1. Make changes
# 2. Build
pnpm run build

# 3. Test
pnpm test

# 4. Commit
git add -A
git commit -m "feat: Description"

# 5. Push
git push -u origin branch-name

# 6. Create PR
bash .claude/scripts/gh_helper.sh pr create \
  --title "feat: Description (DEP-X)" \
  --body "## Summary
Changes made...

Linear: DEP-X"

# 7. Merge PR
bash .claude/scripts/gh_helper.sh pr merge PR_NUMBER --squash

# 8. Fetch updated main
git fetch origin main:main
git checkout main
```

### When Publishing Is Needed

**Stop and inform the user:**
```
⚠️  This change requires publishing to npm, which cannot be done from CCW.

Options:
1. Switch to Desktop Claude Code to complete the workflow
2. Have a maintainer publish manually
3. Use GitHub Actions to publish (if configured)

I can prepare the version bump and PR, but publishing must be done elsewhere.
```

---

## CLI Tools in .claude/scripts/

Deploy-Kit provides CLI wrappers for common operations:

### gh_helper.sh
- GitHub operations without MCP
- Automatic fallback from gh CLI to curl
- Requires: `GITHUB_TOKEN` environment variable

### linear_helper.sh
- Linear operations without MCP
- Direct GraphQL API access
- Requires: `LINEAR_API_KEY` environment variable

**Why CLI tools instead of MCP?**
- MCP servers load at container start, before SessionStart hook runs
- No way to configure them automatically in CCW
- CLI tools work immediately, no container restart needed
- Simpler, more predictable behavior

---

## Limitations in CCW

**Cannot do:**
- npm publish (no auth token)
- AWS deployments (no AWS credentials)
- Access to 1Password CLI (not installed)
- Docker operations (no Docker daemon)
- Some file system operations (limited permissions)
- MCP server integration (timing issue with SessionStart hooks)

**Can do:**
- All git operations
- Build and test
- Create and merge PRs via gh_helper.sh
- Linear operations via linear_helper.sh
- Read/write files in project directory
- Run Node.js/pnpm/npm commands

---

## Tips for CCW Development

1. **Use CLI tools for GitHub and Linear**
   - `.claude/scripts/gh_helper.sh` for GitHub operations
   - `.claude/scripts/linear_helper.sh` for Linear operations
   - Both work immediately, no setup needed

2. **Focus on feature development, not deployment**
   - CCW is perfect for writing code, tests, documentation
   - Leave deployment/publishing for Desktop or CI/CD

3. **Check environment before operations**
   - Don't assume Desktop capabilities
   - Ask user if something requires Desktop or CI/CD

4. **Version bumps are OK, publishing is not**
   - You can run `npm version patch --no-git-tag-version`
   - Commit the version change
   - But don't try to publish

---

**End of CCW-specific instructions**
