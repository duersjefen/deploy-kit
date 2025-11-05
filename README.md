# Deploy-Kit

> **Production-grade deployment orchestration for SST + Next.js + DynamoDB applications**

[![npm version](https://img.shields.io/npm/v/@duersjefen/deploy-kit.svg)](https://www.npmjs.com/package/@duersjefen/deploy-kit)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Deploy-Kit provides safe, automated deployments with comprehensive pre-flight checks, intelligent error recovery, and a sophisticated terminal UI. Deploy with confidence to AWS using SST.

```bash
# One-command setup
npx @duersjefen/deploy-kit init

# Deploy to staging
npx @duersjefen/deploy-kit deploy staging

# Start development server with pre-flight checks
npx @duersjefen/deploy-kit dev
```

---

## ✨ Key Features

### 🛡️ Safety-First Design
- **5-stage deployment pipeline** with automatic rollback guidance
- **Dual-lock system** prevents concurrent deployments
- **Pre-deployment checks** - Auto-run tests, typecheck, build before deploying
- **9 pre-flight checks** for dev server (AWS, locks, ports, config, etc.)
- **Health checks** with automatic validation after deployment

### 🤖 Intelligent Error Recovery
- **Pattern-based error matching** for common deployment issues
- **Hybrid auto-fix system** - Safe fixes applied automatically, risky fixes require approval
- **Actionable guidance** - Every error includes specific recovery steps

### 💎 Professional Experience
- **Sophisticated terminal UI** with progress indicators and visual timelines
- **Smart output filtering** - Reduces 200 SST messages to 2 lines
- **Interactive wizard mode** for guided setup and deployment
- **Deployment timeline** showing stage-by-stage timing breakdown

### 🚀 Developer Productivity
- **Pre-flight checks** catch issues before SST starts
- **Auto-fixes** for recursive scripts, Next.js canary features, stale locks
- **Port conflict resolution** - Automatically finds available port
- **Output profiles** - Silent, normal, verbose, debug modes

---

## 📦 Installation

```bash
# Install globally (recommended)
npm install -g @duersjefen/deploy-kit

# Or install as dev dependency
npm install --save-dev @duersjefen/deploy-kit

# Or use directly with npx
npx @duersjefen/deploy-kit --version
```

---

## 🚀 Quick Start

### 1. Initialize Your Project

```bash
npx @duersjefen/deploy-kit init
```

This creates:
- ✅ `.deploy-config.json` - Deployment configuration
- ✅ `package.json` scripts - Convenient npm commands

### 2. Configure Deployment

Edit `.deploy-config.json`:

```json
{
  "projectName": "my-app",
  "infrastructure": "sst-serverless",
  "stages": ["staging", "production"],
  "mainDomain": "example.com",
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com"
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true
    }
  },
  "healthChecks": [
    {
      "url": "/api/health",
      "expectedStatus": 200
    }
  ]
}
```

### 3. Deploy!

```bash
# Deploy to staging
npx @duersjefen/deploy-kit deploy staging

# Or use the dk alias (shorter)
dk deploy staging
```

**That's it!** Deploy-Kit handles:
- ✅ Pre-deployment checks (git, AWS, tests, SSL)
- ✅ Build and deployment via SST
- ✅ Post-deployment health checks
- ✅ CloudFront cache invalidation
- ✅ Deployment timing analysis

---

## 💻 Development Workflow

### Start Dev Server with Pre-Flight Checks

```bash
npx @duersjefen/deploy-kit dev
```

**What it does:**
1. **9 Pre-Flight Checks** - AWS credentials, SST locks, port availability, config validation, .sst directory health, reserved Lambda vars, recursive scripts, Next.js canary features, Pulumi outputs
2. **Auto-Fixes** - Resolves common issues automatically (stale locks, port conflicts, recursive scripts)
3. **Filtered Output** - Smart grouping reduces noise (200 Lambda messages → 2 lines)
4. **Error Translation** - Converts cryptic SST errors into actionable guidance

### Output Modes

```bash
# Silent (errors only)
deploy-kit dev --profile=silent

# Normal (default - filters noise)
deploy-kit dev

# Verbose (all messages)
deploy-kit dev --profile=verbose

# Interactive wizard
deploy-kit dev --interactive
```

---

## 📚 Documentation

### For New Users

- **[Getting Started](./docs/getting-started.md)** - Complete setup walkthrough
- **[Configuration Guide](./docs/configuration.md)** - All config options explained

### For Daily Development

- **[Dev Command Guide](./docs/dev-command.md)** - Pre-flight checks, auto-fixes, output filtering
- **[Pre-Deployment Checks Guide](./docs/pre-deployment-checks.md)** - Auto-run tests before deploying
- **[CLI Reference](./docs/cli-reference.md)** - All commands and flags

### For Production Deployments

- **[Best Practices](./docs/best-practices.md)** - Security, performance, CI/CD integration
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

### For Understanding the System

- **[Architecture](./docs/architecture.md)** - System design with Mermaid diagrams
- **[AWS Integration](./docs/aws-integration.md)** - How Deploy-Kit interacts with AWS

### Quick References

- **[Command Cheatsheet](./docs/cheatsheet.md)** - Common commands at a glance
- **[Error Reference](./docs/errors.md)** - All errors with solutions

---

## 🎯 Common Tasks

### Deploy to Production

```bash
# Step 1: Deploy to staging
npx @duersjefen/deploy-kit deploy staging

# Step 2: Verify staging works
curl https://staging.example.com/api/health

# Step 3: Deploy to production (requires confirmation)
npx @duersjefen/deploy-kit deploy production
```

### Recover from Failed Deployment

```bash
# Check what's blocking
npx @duersjefen/deploy-kit status

# Clear locks and retry
npx @duersjefen/deploy-kit recover staging
npx @duersjefen/deploy-kit deploy staging
```

### Validate Configuration

```bash
# Check config before deploying
npx @duersjefen/deploy-kit validate

# Run comprehensive diagnostics
npx @duersjefen/deploy-kit doctor
```

### Run Pre-Deployment Checks

```bash
# Checks run automatically on deploy (zero config)
npx @duersjefen/deploy-kit deploy staging

# Or skip for emergency hotfixes
npx @duersjefen/deploy-kit deploy production --skip-checks
```

> 💡 Auto-detects tests, typecheck, build from `package.json`. See [Pre-Deployment Checks Guide](./docs/pre-deployment-checks.md) for custom configuration.

### Debug Deployment Issues

```bash
# Verbose deploy (see all SST output)
npx @duersjefen/deploy-kit deploy staging --verbose

# Check health checks
npx @duersjefen/deploy-kit health staging

# Audit CloudFront distributions
npx @duersjefen/deploy-kit cloudfront audit
```

---

## 🔧 Configuration

### Minimal Configuration

```json
{
  "projectName": "my-app",
  "infrastructure": "sst-serverless",
  "stages": ["staging", "production"],
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com"
    },
    "production": {
      "domain": "example.com"
    }
  }
}
```

### With Health Checks

```json
{
  "projectName": "my-app",
  "infrastructure": "sst-serverless",
  "stages": ["staging", "production"],
  "mainDomain": "example.com",
  "stageConfig": {
    "staging": {
      "domain": "staging.example.com",
      "requiresConfirmation": false
    },
    "production": {
      "domain": "example.com",
      "requiresConfirmation": true
    }
  },
  "healthChecks": [
    {
      "url": "/api/health",
      "expectedStatus": 200,
      "timeout": 5000
    },
    {
      "url": "/",
      "searchText": "My App"
    }
  ]
}
```

**See [Configuration Guide](./docs/configuration.md) for all options.**

---

## 🤖 CI/CD Integration

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx @duersjefen/deploy-kit deploy staging
        env:
          AWS_REGION: us-east-1
```

**See [CI/CD Guide](./docs/cicd.md) for GitLab, CircleCI, and more.**

---

## 🆘 Need Help?

### Quick Diagnostics

```bash
# Run all system checks
npx @duersjefen/deploy-kit doctor
```

### Common Issues

| Problem | Solution |
|---------|----------|
| Deployment blocked by lock | `npx @duersjefen/deploy-kit status` → `recover` |
| Health checks failing | Check domain, wait 5-15min for CloudFront |
| Port conflict in dev | Deploy-kit auto-increments to next port |
| SST won't start | Run `deploy-kit dev` for pre-flight checks |

**See [Troubleshooting Guide](./docs/troubleshooting.md) for more.**

### Documentation & Support

- 📚 **[Complete Documentation](./docs/)** - Guides, references, best practices
- 🐛 **[Report Issues](https://github.com/duersjefen/deploy-kit/issues)** - Bug reports and feature requests
- 💬 **[Discussions](https://github.com/duersjefen/deploy-kit/discussions)** - Questions and community help

---

## 🏗️ Architecture

Deploy-Kit uses a **5-stage deployment pipeline**:

```
1. Pre-Deployment Checks
   ├─ Git status (clean working directory)
   ├─ AWS credentials (valid access)
   ├─ Tests (passing)
   └─ SSL certificates (valid)

2. Build & Deploy
   ├─ Build application
   └─ Deploy via SST

3. Post-Deployment Validation
   ├─ Health checks
   └─ CloudFront OAC validation

4. Cache Invalidation
   └─ Clear CloudFront cache

5. Verification
   └─ Deployment summary & timing
```

**See [Architecture Documentation](./docs/architecture.md) for system design and Mermaid diagrams.**

---

## 🛠️ Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/duersjefen/deploy-kit.git
cd deploy-kit

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode
npm run watch
```

### Running Tests

```bash
# All tests
npm test

# Performance tests only
npm test -- performance

# With coverage
npm test -- --coverage
```

### Publishing (Maintainers)

```bash
# Patch release (bug fixes)
npm run release:patch

# Minor release (new features)
npm run release:minor

# Major release (breaking changes)
npm run release:major
```

**See [CLAUDE.md](./CLAUDE.md) for development workflow and [@.claude/ccw.md](./.claude/ccw.md) for Claude Code for the Web (remote) setup.**

> **Note:** `.claude/ccw.md` is only used when running in remote CCW environments (detected via `CLAUDE_CODE_REMOTE=true`). It contains instructions for using APIs (GitHub, Linear) instead of CLI tools.

---

## 📊 Project Status

### Current Version: 2.7.0

**Recent Features:**
- ✅ Dev command with 9 pre-flight checks (PR #83)
- ✅ Smart output filtering and grouping (PR #83)
- ✅ Interactive wizard mode (PR #83)
- ✅ Comprehensive documentation with diagrams (PR #85)

**Test Coverage:** 9.3% → 30% (in progress)

### Roadmap

**Next Up:**
- Test coverage improvements (DEP-1)
- Blue-green deployments (DEP-4)
- Plugin architecture (DEP-3)

**See [Roadmap](./docs/roadmap.md) for planned features.**

---

## 🤝 Contributing

We welcome contributions! Please see:

- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** - Community guidelines
- **[Architecture Docs](./docs/architecture.md)** - System design

### Quick Contribution Workflow

1. Fork the repository
2. Create feature branch: `git checkout -b feat/my-feature`
3. Make changes and add tests
4. Run tests: `npm test`
5. Commit: `git commit -m "feat: Add my feature"`
6. Push: `git push origin feat/my-feature`
7. Create Pull Request

---

## 📜 License

MIT © 2024 Deploy-Kit Contributors

---

## 🙏 Acknowledgments

- **SST** - Serverless infrastructure framework
- **Next.js** - React framework for production
- **AWS** - Cloud infrastructure
- **Pulumi** - Infrastructure as code

---

<div align="center">

**[Documentation](./docs/) • [Architecture](./docs/architecture.md) • [Best Practices](./docs/best-practices.md) • [Report Issue](https://github.com/duersjefen/deploy-kit/issues)**

Made with ❤️ by the Deploy-Kit team

</div>
