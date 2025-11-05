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
git add -A && git commit -m "[conventional commit from git diff]"
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

- **Speed**: Commit message generated from `git diff`, not manual
- **Quality**: PR body includes Summary, Changes, Test Plan for good code review
- **Parallel**: Skip all package logic if no version arg
- **Auto-fix**: Merge conflicts resolved by rebuilding dist/
