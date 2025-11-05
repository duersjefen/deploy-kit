# Claude Code - Global Configuration

**Universal principles for ALL projects.**

**Version:** 3.4
**Last Updated:** 2025-11-04
**Location:** `~/.claude/CLAUDE.md`

---

## ⚡ QUICK REFERENCE

**Critical Behaviors:**
- **2 failures** → Stop guessing, investigate root cause
- **Poor decision** → Challenge with professional guidance
- **Security/data risk** → Block execution, require confirmation
- **Deployment** → 10x more careful than coding (irreversible changes)

**Key Workflows:**
- Context7: Use for library implementation (60-70% time savings) → Current APIs → No hallucinations
- Next.js: Use `nextjs_runtime` before changes → Query state, errors, routes first
- Serena: Use symbol tools for code navigation → `find_symbol`, `get_symbols_overview`
- Testing: Pure function tests (no mocks) + Real E2E against staging → Delete mock-heavy tests
- Contract-First: OpenAPI spec → Contract tests → Implementation
- Pure Functions: In `/data/`, `/composables/` only - no side effects
- Deployment: Read config → Plan rollback → Ask confirmation → Deploy via Deploy-Kit → Verify
- Worktrees (Conductor): After merging PR → Update local main from worktree: `git -C "$PROJECT_ROOT" pull origin main`

**Development Server Control:**
- 🚫 **NEVER start the development server** (make dev, npm run dev, npm start, etc.)
- ✅ **ONLY the user starts/stops the dev server**
- ✅ Run builds instead: `npm run build`, `npm run preview`

**Project-Specific Overrides:**
- See `<project>/CLAUDE.md` for project-specific rules

---

## 📋 CRITICAL BEHAVIORS

### 1. The 2-Failure Rule

**After 2 failed attempts, find root cause instead of guessing.**

```
Attempt 1: Try the obvious fix
Attempt 2: Try a variation
Attempt 3+: STOP. Investigate the system.
```

**Investigation steps:**
1. Write test that reproduces issue
2. Check system state (server, database, dependencies, env)
3. Question architecture (is the approach fundamentally wrong?)
4. Fix root cause → Verify test passes

**AI-Accessible Debugging:**
- ✅ Pure function tests, Real E2E tests, HTML debug panels, error logs
- ❌ console.log / print() (not accessible to AI)

---

### 2. Professional Guidance

**Challenge poor decisions based on severity.**

| Severity | Issue | Action |
|----------|-------|--------|
| 🔴 BLOCK | Security vulnerabilities, data loss, production breaking | STOP, explain risk, require confirmation |
| 🟡 WARN | Architectural debt, performance anti-patterns | Challenge with alternative, proceed if user insists |
| 🟢 SUGGEST | Sub-optimal patterns | Mention briefly, proceed |

**Template:**
```
"This will cause [problems] because [reasons].
Instead, [better solution] which [benefits]."
```

---

### 3. Context7: Up-to-Date Documentation

**USE Context7 to access current library documentation during implementation (proven 60-70% time savings on complex features).**

Context7 fetches **version-specific** documentation directly from official sources, eliminating hallucinated APIs and outdated patterns. It's one of the most effective MCP tools available.

**Primary Use Cases:**

1. **During Implementation** (Most Important)
   ```
   User: "Implement OAuth with Stripe"
   Assistant: [Uses Context7] → Gets latest Stripe OAuth API → Implements correctly

   User: "Add Redis caching"
   Assistant: [Uses Context7 for redis] → Gets current client API → Code works first try
   ```

2. **Before Suggesting Dependencies**
   ```
   User: "What Node version should I use?"
   Assistant: [Uses Context7] → "Node 24 LTS is recommended. Node 18 reaches EOL April 2025."
   ```

3. **When Debugging API Issues**
   ```
   Error: "Method 'createSession' not found"
   Assistant: [Uses Context7] → "That method was renamed to 'create' in v5.0"
   ```

**Workflow:**
```
Implementation Task
├─→ Identify library/framework involved
├─→ Use mcp__context7__resolve-library-id for library
├─→ Use mcp__context7__get-library-docs with topic (e.g., "authentication", "routing")
├─→ Implement using current API from Context7 docs
└─→ Code works first try (no outdated methods)
```

**Coverage:**
- 6,000+ libraries across 15+ programming languages
- Version-specific docs (crucial for projects not on "latest")
- Community-maintained, continuously expanding

**IF/THEN:**
- IF implementing feature with specific library → THEN use Context7 in prompt
- IF suggesting package → THEN verify with Context7 first
- IF code fails with "method not found" → THEN check Context7 for API changes
- IF outdated version detected → THEN proactively suggest upgrade with reasoning
- IF working with modern frameworks (Next.js 15, Rails 8, etc.) → THEN Context7 is essential

**Why Context7 Works:**
- Eliminates hallucinated APIs (methods that never existed)
- Removes outdated code patterns from LLM training data
- Provides version-specific context (not just "latest")
- Reduces debugging time (code works on first implementation)

**Real-World Impact:**
- 60-70% reduction in time for complex features
- Fewer bugs from using correct, current APIs
- Less context switching to official documentation
- Consistent architectural patterns

---

### 4. Next.js Runtime (MCP)

**USE Next.js Devtools proactively for all Next.js projects.**

**When to use `nextjs_runtime`:**
- **Before implementing ANY changes** - Query routes, components, runtime state
- **For diagnostics** - "What's wrong?", "Show errors", "What routes exist?"
- **As FIRST CHOICE** - Check running app before static codebase search

**Other tools:**
- `nextjs_docs` - Search official Next.js docs
- `browser_eval` - Verify pages in browser (not curl)
- `enable_cache_components` - One-command Cache Components setup
- `upgrade_nextjs_16` - Automated upgrade with codemod

**IF/THEN:**
- IF Next.js project → THEN query runtime state before changes
- IF diagnostic question → THEN check runtime errors/logs first
- IF verifying page → THEN use browser automation (not HTTP requests)

---

### 5. Serena: Semantic Code Navigation (MCP)

**USE Serena for intelligent code reading/editing.**

**Tools:**
- `get_symbols_overview` - File structure
- `find_symbol` - Locate class/function
- `find_referencing_symbols` - Track usage
- `replace_symbol_body` - Precise edits

**IF/THEN:**
- IF searching for class/function → THEN use `find_symbol` (not grep)
- IF editing method → THEN use symbol tools (more precise than regex)
- IF understanding file → THEN get overview first (don't read entire file)

---

## 🚨 DEPLOYMENT & INFRASTRUCTURE

**CRITICAL: Deployments are irreversible. DNS takes 5-60 min, CloudFront 5-15 min, database migrations can lose data.**

### Deployment Workflow (Deploy-Kit Automated)

**Deploy-Kit handles automatically:**
- CloudFront cache invalidation & OAC validation
- SSL certificate detection & injection
- Post-deployment health checks
- Pulumi state lock recovery
- 5-stage safety checks with rollback guidance

```bash
# All projects use Deploy-Kit for safe deployments:
npx @duersjefen/deploy-kit deploy staging
npx @duersjefen/deploy-kit deploy production
```

**Before ANY deployment:**

1. **Read Config Files**
   ```bash
   # Understand what will be deployed:
   cat sst.config.ts          # AWS resources
   cat <project>/CLAUDE.md    # AWS profile, domains
   cat .env.production        # Secrets (if applicable)
   ```

2. **Plan Rollback**
   - How to undo if it fails?
   - DNS: `node ~/.scripts/namecheap.js add domain CNAME old-value`
   - Code: `git revert HEAD && npx deploy-kit deploy [stage]`
   - Database: Document migration rollback (if applicable)

3. **Ask User Confirmation**
   ```
   "I'm about to deploy to [staging/production].
   Changes: [list what will change]
   Rollback plan: [procedure]
   Proceed? (yes/no)"
   ```

4. **Deploy ONE stage at a time**
   - Dev → Test → Staging → Verify → Production
   - NEVER skip staging for production deployments

---

### Deployment Anti-Patterns (NEVER)

#### ❌ 1. Running Commands Without Understanding Them
```bash
# ❌ FORBIDDEN: Deploying without reading config
npx sst deploy --stage production

# ✅ CORRECT: Read config first
cat sst.config.ts && cat <project>/CLAUDE.md
# Then: npx @duersjefen/deploy-kit deploy production
```

#### ❌ 2. Deploying to Production First
```bash
# ❌ FORBIDDEN: Skipping staging
npx deploy-kit deploy production

# ✅ CORRECT: Test in staging first
npx deploy-kit deploy staging
# Verify works, then:
npx deploy-kit deploy production
```

#### ❌ 3. Changing Multiple Things at Once
```bash
# ❌ FORBIDDEN: DNS + code + DB + SSL simultaneously
# ✅ CORRECT: One change at a time, verify each
```

#### ❌ 4. Ignoring Deploy-Kit Warnings
```bash
# If Deploy-Kit shows warnings or errors:
# ❌ FORBIDDEN: Proceed anyway
# ✅ CORRECT: STOP, investigate, fix root cause
```

#### ❌ 5. Trusting Previous Success
```bash
# ❌ FORBIDDEN: "Worked yesterday, will work today"
# ✅ CORRECT: Read config files EVERY deployment
# Production config differs from staging (domains, secrets, DB)
```

---

### Emergency Rollback

**If Deploy-Kit deployment fails:**

```bash
# 1. Stay calm - most issues are recoverable
# 2. Read error message completely
# 3. Execute rollback plan:

# Code rollback
git revert HEAD
npx @duersjefen/deploy-kit deploy [stage]

# DNS rollback (5-60 min propagation)
node ~/.scripts/namecheap.js add domain.com CNAME subdomain old-value 300

# Database rollback (DANGEROUS - may lose data)
# Only if migration failed AND data loss acceptable
```

**Document the incident:**
- What failed?
- Root cause?
- How fixed?
- Prevention for next time?

---

## 🏗️ ARCHITECTURE PRINCIPLES

### 1. Clean Code Organization

**Name what it IS, not what it WAS:**
```javascript
// ✅ CORRECT
useAPI.js

// ❌ WRONG - historical baggage
useUnifiedAPI.js    // Was there a non-unified version?
processDataNew.js   // What happened to the old one?
```

**Rules:**
- No `New`, `Updated`, `Fixed`, `Unified`, `v2`, `2024` in names
- When refactoring → RENAME to current purpose
- Flat structure when possible (avoid unnecessary nesting)

---

### 2. Contract-Driven Development

**API specifications are immutable contracts.**

**Workflow:**
1. Write OpenAPI spec → Define exact API behavior
2. Write contract tests → Validate implementation matches spec
3. Implement backend → Code to pass contract tests
4. Frontend uses contracts → Never depends on backend implementation

**IF/THEN:**
- IF creating API endpoint → THEN write OpenAPI spec BEFORE implementation (BLOCK)
- IF changing API response → THEN update spec AND tests first
- IF frontend depends on implementation → THEN refactor to use contract

---

### 3. Functional Core, Imperative Shell

**Directory Structure:**
```
# Backend
app/data/      # PURE FUNCTIONS - business logic
app/main.py    # I/O ORCHESTRATION - side effects

# Frontend
src/composables/   # PURE FUNCTIONS - transformations
src/stores/        # STATE + I/O - reactive boundaries
```

**Pure Function Rules:**
- Deterministic (same inputs → same outputs)
- No side effects (no mutations, no API calls)
- All inputs as parameters (no hidden dependencies)
- Return new objects (don't mutate)
- NO classes for business logic

**Edge Cases (Allowed):**
- ✅ Logging (remove before production), UUIDs/timestamps, Dataclasses
- ❌ Database calls, API requests, File I/O (always in imperative shell)

---

### 4. Testing Strategy: Pure Functions + Real E2E

**🔴 Mock-heavy tests provide false confidence - they test mocks, not reality.**

**Three-Step Approach:**

**DELETE:**
- API route tests with mocked AWS services
- Integration tests with mocked S3/DynamoDB/Lambda
- Tests using aws-sdk-client-mock, vi.mock(fetch)

**KEEP:**
- Pure functions: schemas (Zod), utilities, domain logic
- State management: Zustand slices, Redux reducers (no I/O)

**ADD:**
- 5-10 E2E tests against staging with NO mocks
- Tests hit real AWS services, catch real bugs
- Run in deployment pipeline before production

**Comparison:**

| Metric | Mock-Heavy | Pure + E2E |
|--------|------------|------------|
| Bugs caught | 0 (testing mocks) | Real AWS issues |
| Duration | ~30s | ~3s pure + 2min E2E |
| Confidence | False | Real |

**E2E Example:**

```typescript
test('Upload → Process → Download', async ({ page }) => {
  await page.goto(`${STAGING_URL}/dashboard`)
  await page.setInputFiles('input[type="file"]', 'fixtures/test.psd')
  await expect(page.locator('text=/Complete/i')).toBeVisible({ timeout: 60000 })
  const download = await page.waitForEvent('download')
  expect(download.suggestedFilename()).toMatch(/translated.*\.zip/)
})
```

**Deployment:**
```bash
# Staging deploy (fast, no E2E):
npm run deploy:staging       # Type check → Unit tests → Build → Deploy

# Production deploy (safe, E2E gate):
npm run deploy:production    # Type check → Unit tests → Build → E2E against staging → Deploy
```

**E2E Strategy:**
- Staging: NO E2E tests (fast iteration)
- Production: E2E tests run against staging BEFORE deploying (safety gate)

**Rules:**
- **100% pass rate required** - Fix or delete failing tests immediately
- Pure function tests for ALL features (schemas, utilities, domain logic)
- E2E tests for critical workflows only (5-10 max)
- UI styling = visual inspection, NOT tests

---

### 5. Environment Configuration

**Per-Component .env Files (multi-component apps):**

```
myapp/
├── backend/.env.development    # DB, SMTP, secrets
├── frontend/.env.development   # API URL only
```

**Rationale:**
- ✅ Security: Frontend never receives backend secrets
- ✅ Clarity: Clear ownership of variables
- ✅ Single source of truth per variable

---

## 🌳 DEVELOPMENT WORKFLOWS

### Feature Implementation

```
New Feature
├─→ Write OpenAPI spec (if API endpoint)
├─→ Implement in pure functions (/data/, /composables/)
├─→ Wire up imperative shell (API route/store)
├─→ Write pure function tests (schemas, utilities, domain logic)
├─→ Add E2E test if critical workflow (runs against staging, no mocks)
├─→ Run tests → Pass? → Commit
```

### Root Cause Investigation (After 2 Failures)

```
2 Failures
├─→ STOP micro-debugging
├─→ Write test reproducing issue
├─→ Check system state
├─→ Question architecture
└─→ Fix root cause → Verify
```

### Development Server Management

**🚫 CRITICAL: NEVER START THE DEV SERVER UNLESS EXPLICITLY REQUESTED 🚫**

The dev server is **usually already running** in a separate terminal. Starting it again causes port conflicts, multiple processes, and confusion.

**Rules:**
- ❌ **NEVER** run `make dev`, `npm run dev`, `npm start`, or any server command
- ❌ **NEVER** run dev server in background (`npm run dev &`)
- ✅ **ONLY** start if user explicitly says "start the server" or "run make dev"
- ✅ **ALWAYS** assume HMR is working (changes appear instantly)
- ✅ **ALWAYS** assume the server is already running

**IF/THEN:**
- IF you want to test something → THEN assume server is running, use Playwright
- IF code changes made → THEN trust HMR (no restart needed)
- IF .env changes made → THEN tell user "restart your dev server"

**Key Principles:**
- Trust HMR - Modern dev servers have instant hot reload
- Test production builds - Dev mode ≠ Production mode (use `make preview`)
- User controls the server - Not you
- Modern tools auto-increment ports (3000 → 3001) - no manual management needed

---

### Frontend Iteration

```
UI Change
├─→ Styling? → Make change → See instantly (HMR) → Screenshot
├─→ Behavior? → Extract logic to composable → Write test
└─→ State? → Business logic in /composables/, I/O in /stores/
```

**Techniques:**
- Screenshot-driven: Mockup → Claude compares → 2-3 iterations converge
- Visual debug panels: Render state as HTML
- Parallel Read/Edit: Batch independent file operations

---

## 🔧 TOOL USAGE PATTERNS

### Bash & Scripting

**Multi-Line Scripts - Use Heredocs:**

```bash
# ✅ CORRECT - No temp files
python3 << 'EOF'
import re
with open('file.py') as f:
    content = f.read()
content = content.replace('old', 'new')
with open('file.py', 'w') as f:
    f.write(content)
EOF

# ❌ AVOID - Temporary script files
```

**Web Fetching:**

```bash
# Static HTML - curl
curl -s "https://example.com"

# SPAs (React/Vue) - Playwright
npx -y playwright screenshot https://spa.com shot.png
```

---

### Git & Deployment

**NEVER push/deploy unless explicitly requested:**

```bash
# ❌ NEVER: git push, make deploy, npx deploy-kit deploy
# ✅ ALLOWED: git commit, git status, git add, branches
```

**🔴 CRITICAL: NEVER bypass git hooks:**

```bash
# ❌ ABSOLUTELY FORBIDDEN: git commit --no-verify, git push --no-verify
# ✅ CORRECT: Fix the actual issue, let hooks run

# Git hooks exist for safety (tests, linting, security checks)
# Bypassing them hides problems and breaks the build
# If hooks fail → Fix the root cause, don't bypass
```

---

### Linear Issues & Pull Requests

**🔴 CRITICAL: Use Linear for issue tracking, NOT GitHub issues**

**Issue Management:**
- Use Linear MCP tools to list, create, update, and close issues
- GitHub is only used for PRs and code management
- Linear issue identifiers: `DEP-10`, `PROJ-42`, etc.

**Two Workflow Types:**

**A) Regular Projects (packages like deploy-kit):**
```
Linear Issue (DEP-10)
├─→ Create feature branch: git checkout -b feat/dep-10-description
├─→ Make changes, test, commit with descriptive message
├─→ Push to remote: git push -u origin feat/dep-10-description
├─→ Create PR: gh pr create --title "feat: Description (DEP-10)"
├─→ Merge when ready: gh pr merge PR_NUMBER --squash
├─→ Switch to main: git checkout main
├─→ Pull updates: git pull origin main
├─→ Update Linear: mcp__linear__update_issue (set state to "Done")
├─→ Bump version: npm version [MAJOR|MINOR|PATCH] --no-git-tag-version
├─→ Commit version: git add package.json && git commit -m "chore: Bump version"
└─→ Push to main: git push
```

**B) Conductor Projects (applications like mawave-psd):**
```
Linear Issue (MAW-10)
├─→ Work in conductor directory: .conductor/project-name/
├─→ Make changes, test, commit with descriptive message
├─→ Push to remote: git push -u origin feat/maw-10-description
├─→ Create PR: gh pr create --title "feat: Description (MAW-10)"
├─→ Merge when ready: gh pr merge PR_NUMBER --squash
├─→ Update main from conductor: git -C ../.. pull origin main
├─→ Update Linear: mcp__linear__update_issue (set state to "Done")
└─→ NO version bumping (applications don't need versions)
```

**Worktree Workflow Details (Conductor):**

When working in Conductor's worktree (`.conductor/project-name/`), local main lives in the parent directory. After merging a PR, update local main WITHOUT leaving the worktree:

```bash
# Current state after PR merge:
# - origin/main: ✅ Has your changes (squash merged)
# - local main: ❌ Still outdated (at commit A)
# - You are in: .conductor/project-name/ (feature worktree)

# Update main worktree from feature worktree:
git -C ../.. pull origin main
# OR dynamically calculate project root:
PROJECT_ROOT=$(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||')
git -C "$PROJECT_ROOT" pull origin main

# Now everything is in sync:
# - origin/main: ✅ Up-to-date
# - local main: ✅ Up-to-date
# - Feature worktree: Can be deleted or reused
```

**Why this matters:**
- Conductor uses git worktrees (feature branch in `.conductor/`, main in parent)
- `git checkout main` fails with "worktree already in use"
- `git -C <path>` updates another worktree without leaving current one
- Must update local main after EVERY merged PR to stay in sync
- **NO version bumping for applications** - only for packages like deploy-kit

**Semantic Versioning:**
- **MAJOR (1.0.0)**: Breaking changes, new architecture
- **MINOR (1.1.0)**: New features, new checks/tests
- **PATCH (1.0.1)**: Bug fixes, type safety, documentation

**Branch Naming:**
- `feat/dep-X-description` - New features (Linear issue DEP-X)
- `fix/dep-X-description` - Bug fixes
- `docs/dep-X-description` - Documentation
- `test/dep-X-description` - Tests

**PR Message Template:**
```markdown
## Summary
[1-2 sentences of what changed]

## Problem (Linear DEP-X)
[Why this change was needed]

## Solution
[How the issue was solved]

## Test Results
✅ npm run build - No TypeScript errors
✅ npm test - All tests passing

Linear: DEP-X
🤖 Generated with Claude Code
```

---

### Documentation Files

**🚫 CRITICAL: NEVER CREATE DOCUMENTATION FILES WITHOUT EXPLICIT REQUEST 🚫**

**Applies to ALL file extensions:** `.md`, `.txt`, `.rst`, `.adoc`, `README*`, `CHANGELOG*`, `CONTRIBUTING*`, `NOTES*`, `TODO*`, `DOCS*`, etc.

**Rule:** Do NOT create ANY documentation file unless the user explicitly says:
- "Create a README"
- "Write documentation"
- "Make a .md file"
- "Document this in a file"

```bash
# ❌ ABSOLUTELY FORBIDDEN (unless user explicitly asks):
touch README.md
touch IMPLEMENTATION.md
touch notes.txt

# ✅ CORRECT - Provide information verbally in chat
```

**Why:**
- User doesn't want files cluttering the repo
- Documentation files get outdated quickly
- User has their own documentation system
- If documentation is needed, user will explicitly request it

**What to do instead:**
- Provide summaries and explanations **in your chat response**
- Point to existing documentation in the codebase
- Suggest what COULD be documented if the user wants it

---

### 1Password CLI

**Use `op run` to group multiple calls:**

```bash
# ✅ CORRECT - Single authorization
op run -- bash -c '
  SMTP=$(op item get "Email" --fields label=password --reveal)
  DB=$(op item get "DB" --fields label=url --reveal)
  echo "SMTP=$SMTP" >> .env
  echo "DB=$DB" >> .env
'

# ❌ AVOID - Multiple prompts
op item get "Email" ...
op item get "DB" ...
```

---

## ⚙️ INFRASTRUCTURE & DEVOPS

### AWS Profile Management

**CRITICAL:** Check project CLAUDE.md for required AWS_PROFILE before ANY AWS operation.

**Workflow:**

```
AWS Command
├─→ Check project CLAUDE.md for AWS_PROFILE requirement
├─→ Set profile if specified: export AWS_PROFILE=project-name
├─→ Execute command
└─→ If error → Verify profile exists
```

**Example:**
```bash
cd /project && export AWS_PROFILE=project-name && npx sst deploy --stage staging
```

**IF/THEN:**
- IF running AWS command → THEN check project CLAUDE.md for profile first
- IF credentials error → THEN verify correct profile set

---

### AWS EC2 Server Access

**ALWAYS use AWS SSM (not SSH):**

```bash
# Run command
aws ssm send-command \
  --instance-ids i-INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /app && ls"]' \
  --query 'Command.CommandId' \
  --output text

# Get results
aws ssm get-command-invocation \
  --command-id $COMMAND_ID \
  --instance-id i-INSTANCE_ID
```

**Why SSM:** No SSH keys, IAM-based, logged, efficient for non-interactive commands.

---

### Namecheap DNS Management

**Location:** `~/.scripts/namecheap.js`

**Usage:**
```bash
# List records
node ~/.scripts/namecheap.js list domain.com

# Add/update record
node ~/.scripts/namecheap.js add domain.com CNAME staging d1s38.cloudfront.net 1800

# ACM validation for SST
node ~/.scripts/namecheap.js add domain.com CNAME _validation _acm.aws 300
```

**Common Use Cases:**
1. SST deployment → ACM certificate → Add validation CNAME → Wait 2-10min → Redeploy
2. Point to CloudFront → Get distribution URL → Update DNS

---

### Deploy-Kit: Deployment System

**Purpose:** Unified, safe deployment for SST + Next.js + DynamoDB projects.

**Location:** `github:duersjefen/deploy-kit` (Git dependency)

**Setup:**
```json
{
  "dependencies": {
    "@duersjefen/deploy-kit": "github:duersjefen/deploy-kit"
  }
}
```

**Usage:**
```bash
# Deploy with automatic safety checks
npx @duersjefen/deploy-kit deploy staging
npx @duersjefen/deploy-kit deploy production

# Check deployment status
npx @duersjefen/deploy-kit status

# Run health checks
npx @duersjefen/deploy-kit health
```

**Features:**
- CloudFront cache invalidation & OAC validation
- SSL certificate auto-detection
- Real-time SST output streaming
- Post-deployment health verification
- Automatic Pulumi state lock recovery
- Deployment locking (prevents concurrent deploys)

**IF/THEN:**
- IF deploying SST project → THEN use Deploy-Kit (handles safety checks)
- IF Deploy-Kit shows errors → THEN STOP and investigate (don't bypass)

---

## 📋 DEVELOPMENT RULES

### ✅ ALWAYS

- **Use Context7 for libraries** - During implementation, not just version checking (60-70% time savings)
- **Check project AWS profile** - Before any AWS operation
- **Use Makefile commands** - Never manual server commands
- **Write pure function tests** - Test schemas, utilities, domain logic (no mocks, deterministic)
- **Add E2E tests for critical workflows** - 5-10 tests against staging with NO mocks
- **Test behavior, NOT appearance** - Visual inspection for UI
- **Follow architecture principles** - Contract-first, pure functions
- **Test production builds** - Before deploying (`make preview`)
- **Run test suite** - Before committing (`make test`)
- **Use parallel tool calls** - Read/Edit independent files simultaneously
- **Trust HMR** - No restart needed for code changes

---

### ❌ NEVER

- **🚫 START DEV SERVER** - Never run `make dev`, `npm run dev`, `npm start`. Never use background (`&`). Only user manages dev server. Allowed: `npm run build`, `npm run preview`
- **🚫 RUN DEV SERVER IN BACKGROUND** - Never use `npm run dev &` or `npm run dev > /dev/null 2>&1 &`
- **🚫 COMMIT FAILING TESTS** - ONLY write tests that pass. 100% pass rate required. If test fails → fix immediately or delete it. Never commit with `--no-verify` to bypass test failures
- **🚫 MOCK AWS SERVICES IN TESTS** - Never use aws-sdk-client-mock. Delete API route tests, integration tests with mocked I/O. Write pure function tests + real E2E instead
- **Skip writing pure function tests** - Always test schemas, utilities, domain logic (no I/O)
- **console.log debugging** - AI can't see it
- **Violate architecture** - No classes for logic, no side effects in pure functions
- **Sequential file ops** - Use parallel Read/Edit when possible
- **Push/deploy without request** - Wait for user to say "push" or "deploy"
- **🚫 CREATE DOCUMENTATION FILES** - Never create `.md`, `.txt`, `README*`, etc. unless user explicitly requests

---

## 🔀 CONFLICT RESOLUTION HIERARCHY

**Priority order:**

1. **🔴 Security & Data Safety** - Overrides all
2. **🟡 Project-Specific CLAUDE.md** - Overrides global
3. **🟢 This File** - Universal principles
4. **🔵 User Preferences** - If explicitly stated

**Examples:**
- Security vs speed → Security wins
- Project "port 8080" vs Global "standard ports" → Project wins

---

## 🔗 PROJECT-SPECIFIC DOCUMENTATION

**For project-specific details, see `<project>/CLAUDE.md`:**

- Architecture patterns (framework choices, directory structure)
- Development commands (project-specific Makefile targets)
- Deployment specifics (AWS account, domain names, SSL certificates)
- Testing strategies (project-specific test infrastructure)
- Third-party integrations (APIs, services, credentials)

---

**End of Configuration**
