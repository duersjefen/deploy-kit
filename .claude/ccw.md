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
  bash .claude/gh_helper.sh pr create --title "..." --body "..."
  bash .claude/gh_helper.sh pr merge PR_NUMBER --squash
  ```

**DO NOT attempt to publish to npm:**
- `npm publish` requires authentication not available in CCW
- Publishing should be done from Desktop Claude Code or GitHub Actions
- You can bump versions, but cannot publish

### ✅ Commands Available in CCW

**GitHub Operations (via gh_helper.sh):**
```bash
# Create PR
bash .claude/gh_helper.sh pr create --title "..." --body "..."

# Merge PR
bash .claude/gh_helper.sh pr merge PR_NUMBER --squash

# Get PR status
bash .claude/gh_helper.sh pr view PR_NUMBER
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
bash .claude/gh_helper.sh pr create \
  --title "feat: Description (DEP-X)" \
  --body "## Summary
Changes made...

Linear: DEP-X"

# 7. Merge PR
bash .claude/gh_helper.sh pr merge PR_NUMBER --squash

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

## MCP Servers in CCW

After the DEP-17 fix, MCP servers should work correctly:
- ✅ Playwright - Browser automation
- ✅ Context7 - Library documentation
- ✅ Linear - Issue tracking

If MCP servers aren't working:
1. Check if this is your first CCW session (MCP loads at session start)
2. Start a new session if needed
3. Verify environment variables are set (LINEAR_API_KEY, etc.)

---

## Limitations in CCW

**Cannot do:**
- npm publish (no auth token)
- AWS deployments (no AWS credentials)
- Access to 1Password CLI (not installed)
- Docker operations (no Docker daemon)
- Some file system operations (limited permissions)

**Can do:**
- All git operations
- Build and test
- Create and merge PRs via gh_helper.sh
- Read/write files in project directory
- Run Node.js/pnpm/npm commands

---

## Tips for CCW Development

1. **Focus on feature development, not deployment**
   - CCW is perfect for writing code, tests, documentation
   - Leave deployment/publishing for Desktop or CI/CD

2. **Use gh_helper.sh for all GitHub operations**
   - It automatically falls back to curl if gh CLI unavailable
   - Handles authentication via GITHUB_TOKEN env var

3. **Check environment before operations**
   - Don't assume Desktop capabilities
   - Ask user if something requires Desktop or CI/CD

4. **Version bumps are OK, publishing is not**
   - You can run `npm version patch --no-git-tag-version`
   - Commit the version change
   - But don't try to publish

---

**End of CCW-specific instructions**
