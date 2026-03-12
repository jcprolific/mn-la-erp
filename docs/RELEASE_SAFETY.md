# Release and Update Safety

How to keep the app stable and roll back safely if something goes wrong.

## Known-good state

The current stable state is tagged in Git:

- **Tag:** `v1.0-stable` — backend and overall functionality verified working.

To see it: `git tag -l`. To go back to it: see *Rollback* below.

## Creating a new “known good” tag

After a release or big update that you’ve tested and want to keep as a new safe point:

```bash
git tag -a v1.1-stable -m "Stable after [brief description]"
git push origin v1.1-stable
```

Use whatever version or name you prefer (e.g. `release-2025-03-15`).

## Rollback

If the next update breaks something and you want to return to a known-good state:

**Option A — just look at the old code (detached HEAD):**

```bash
git checkout v1.0-stable
```

**Option B — restore `main` to that state (destructive; only if you’re sure):**

```bash
git checkout main
git reset --hard v1.0-stable
git push origin main --force
```

**Option C — work from the old state in a new branch (safest):**

```bash
git checkout -b recovery-from-stable v1.0-stable
# work or deploy from this branch
```

## Recommended workflow for updates

1. **Keep `main` stable** — avoid editing `main` directly for new features or big refactors.
2. **Use a branch for each change:**  
   `git checkout -b feature/your-feature` or `git checkout -b fix/your-fix`
3. Do your work and test on that branch.
4. If everything is good: merge into `main` (e.g. `git checkout main && git merge feature/your-feature`).
5. If something goes wrong: switch back to `main` and leave the branch; `main` stays unchanged.
6. **Before a risky or large change:** create a safety tag (e.g. `before-feature-xyz`) so you can roll back with `git checkout before-feature-xyz` or `git reset --hard before-feature-xyz` if needed.
