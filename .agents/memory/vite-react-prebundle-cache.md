---
name: Vite React prebundle cache
description: Diagnose persistent React/react-dom version mismatch errors after package versions are aligned.
---

When package resolution shows matching `react` and `react-dom` versions but the browser still reports a mismatch, suspect Vite's cached optimized dependencies before changing versions again.

**Why:** Vite can continue serving a prebundle produced before the package update, even after the workspace dependencies and lockfile are correct.

**How to apply:** Confirm resolved package versions first. If they match, clear the affected artifact's Vite dependency optimizer cache and restart its web workflow, then verify the browser console.
