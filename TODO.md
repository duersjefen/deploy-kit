# Deploy-Kit TODO

Quick reference for future development priorities.  
See `ANALYSIS_REPORT.md` for detailed analysis and implementation guidance.

---

## 🔴 Next Up (High Priority)

### 1. Add CI/CD Pipeline
**Effort:** 4 hours  
**Why:** Automated testing on every PR, catch issues early  
**How:** Create `.github/workflows/test.yml`

### 2. Increase Test Coverage
**Effort:** 40 hours (2 weeks)  
**Why:** Critical modules untested (orchestrator, sst-deployer, operations)  
**Target:** 9.3% → 30% coverage

### 3. Type AWS API Responses
**Effort:** 16 hours  
**Why:** Replace 33 `any` types with proper interfaces  
**Benefit:** Better IDE autocomplete, catch errors at compile time

---

## 🟡 Later (Medium Priority)

- Refactor large files (orchestrator.ts 380 LOC → split into 3 modules)
- Add more performance benchmarks
- Document architecture (module diagrams)
- Improve error handling consistency

---

## 🟢 Someday/Maybe (Ideas)

### Advanced Features
- Plugin architecture (extensibility)
- Blue-green deployments (zero-downtime)
- Multi-cloud support (GCP, Azure)
- Observability integration (DataDog, Prometheus)

### Performance
- Parallelize health checks (3-5x faster)
- Add caching layer (50% fewer AWS calls)
- Connection pooling

### CLI Features
- Interactive deployment wizard
- Deployment dry-run mode
- Diff preview before deployment
- Deployment scheduling (cron)

---

## ✅ Recently Completed

- **v2.1.0** - Complete JSDoc for utilities
- **v2.2.0** - E2E deployment workflow tests
- **v2.3.0** - Performance benchmarking infrastructure
- **v2.4.0** - AWS CLI utilities extraction

---

**Last Updated:** 2025-11-01  
**Current Version:** 2.4.0  
**Architecture Grade:** B+ (82/100)
