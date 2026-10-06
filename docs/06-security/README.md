---
title: "docs/06-security — Security"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/security
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[security-guide]]"
  - "[[docs/06-security/security-guide]]"
  - "[[docs/98-history/audits/AUDIT_SECURITY_FINDINGS]]"
  - "[[docs/98-history/audits/AUTH_SYSTEM_AUDIT]]"
code-references:
  - "backend/src/middleware/requireAuth.js"
  - "backend/src/middleware/rateLimit.js"
  - "backend/src/middleware/tenant.js"
  - "backend/src/index.js:147"
  - "app/src/lib/utils.ts:3"
  - "app/src/lib/routeZones.ts"
verified: never
---
# docs/06-security — Security

Security architecture and the rules that follow from it.

| Doc | What it is |
|---|---|
| [`security-guide.md`](security-guide.md) | **Canonical security architecture prose**, refreshed 2026-10-02: auth, tenant isolation, sanitisation, where the escHtml verdict landed. |
