---
title: "docs/98-history/tester-guides"
aliases:
tags:
  - type/index
  - audience/tester
  - audience/owner
  - domain/testing
  - status/archived
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[98-history/README]]"
  - "[[testing-guide-owner]]"
  - "[[testing-guide-tester]]"
  - "[[04-testing/TESTING]]"
code-references:
  - "playwright.config.ts"
  - "scripts/seed-test-users.js"
  - "app/src/lib/routeZones.ts"
verified: never
---
# docs/98-history/tester-guides

Tester guides

Kept **separate** by an explicit boundary statement, not merged: only the owner tests the super-admin dashboard.

| Doc | What it is |
|---|---|
| [[testing-guide-owner]] | Owner-only: super-admin credentials, the Feedback in-box, the personal smoke list. **Do not share this file.** |
| [[testing-guide-tester]] | Shareable: tester credentials, the debug Feedback widget, the surfaces they may test, and the detailed action→expected appendix. |
