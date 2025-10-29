# Phase 1: Critical Fixes for SST Projects

## Fix 1: Auto-detect SST and use correct build approach

**Current (wrong):**
```typescript
// deployer.ts:164-167
await execAsync('npm run build', { cwd: this.projectRoot });
// Then separately:
await execAsync(`npx sst deploy --stage ${sstStage}`, {...});
```

**Problem:** SST projects don't have `npm run build` script. SST's `sst deploy` handles everything internally.

**Solution:**
1. Detect if project has `sst.config.ts`
2. If SST: skip npm build, just run `sst deploy`
3. If not SST: run `npm run build` then custom deploy

**Location:** deployer.ts - `runBuild()` and `runDeploy()` methods

---

## Fix 2: Remove Makefile references from error messages

**Current (wrong):**
```
To force recovery, run: make recover-staging
```

**Problem:** Package user may not have Makefile. Message should be self-contained.

**Solution:**
Use CLI command in messages: `npx deploy-kit recover staging`

**Locations to search:**
- deployer.ts
- safety/pre-deploy.ts
- safety/post-deploy.ts
- health/checker.ts

---

## Fix 3: Make recovery command self-contained

**Current:** recover() method exists but error messages tell users to use Makefile

**Solution:** Ensure recover command gives complete next steps without assuming Makefile exists

**Location:** deployer.ts - `recover()` method and error messages in `deploy()`

---

## Implementation Order
1. Add SST detection helper function
2. Update `runBuild()` to skip npm build for SST projects
3. Update `runDeploy()` to handle both SST and non-SST builds
4. Search all files for "make " references and update to use CLI commands
5. Test with gabs-massage using npm link
