---
description: Ship PR - commit, push, merge, sync, publish (optional)
argument-hint: [major|minor|patch]
---

# Ship PR

Fast workflow: Commit → PR → Merge → Sync → Publish (if version arg provided)

## Argument

- **No argument** - Skip package publishing entirely
- **major/minor/patch** - Bump version and publish to npm

## Workflow

**1. Push and create PR**
```bash
git add -A && git commit -m "[descriptive conventional commit message]"
# Format: "feat: Add X feature" or "fix: Resolve Y issue"
# Analyze git diff to understand WHAT changed, then write WHY it changed
git push -u origin $(git branch --show-current)

gh pr create --title "[title from commits]" --body "$(cat <<'EOF'
## Summary
[Detailed summary of what changed and why]

## Changes
- [Key changes as bullet points]

## Test Plan
[How to test/verify the changes]

[Linear: ISSUE-ID (if detected)]

🤖 Generated with Claude Code
EOF
)"
```

**2. Merge PR**
```bash
gh pr merge $(gh pr view --json number -q .number) --squash --delete-branch 2>&1 | grep -v "already used by worktree" || true
```

If merge fails due to conflicts:
```bash
git fetch origin main && git merge origin/main
pnpm run build  # Regenerate dist/
git add -A && git commit -m "Merge branch 'main'"
git push
# Retry merge command above
```

**3. Sync main worktree**

Detect if Conductor worktree:
```bash
if [[ $(git rev-parse --show-toplevel) == */.conductor/* ]]; then
  # Conductor: Update parent main
  git -C $(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||') pull origin main
else
  # Regular: Switch to main
  git checkout main && git pull origin main
fi
```

**4. Update Linear (if Linear issue detected in commits)**

Extract issue ID from commits, update to "Done" via Linear MCP.

**5. Publish (ONLY if version argument provided)**

If user provided `major|minor|patch` argument:

```bash
cd $(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||')  # Go to parent if Conductor
pnpm install  # Ensure dependencies installed
pnpm version [major|minor|patch] --no-git-tag-version
git add package.json && git commit -m "chore: Bump version to $(jq -r .version package.json)"
git push
pnpm publish --no-git-checks
```

## Tips

- **Descriptive commits**: Analyze `git diff` to write meaningful commit messages (conventional format)
- **Quality PRs**: Include Summary (why), Changes (what), Test Plan (how to verify)
- **Fast workflow**: Skip all package logic when no version arg provided
- **Auto-fix conflicts**: Rebuild `dist/` to regenerate TypeScript output
