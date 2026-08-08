---
name: create-feature
description: Scaffold and build a new feature or plugin modularly in SinaiCamps
---

## When to use
When asked to implement a new feature or modular extension.

## Steps

1. **Plan Architecture**
   - Identify extension points (hooks, routes, modules).
   - Do not hardcode logic inside core files unless necessary.

2. **Scaffold Files**
   - Create directories and files using the project's standard modular format.

3. **Write Tests**
   - Implement unit tests for all new functions/classes.

4. **Register with Core**
   - Hook into the main framework lifecycle.

5. **Verify**
   - Run unit and integration tests to ensure stability.
