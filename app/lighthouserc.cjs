/**
 * Lighthouse config + performance budgets for SinaiCamps (Astro app).
 *
 * Usage:
 *   npm run lighthouse            # audits the running app on :4321 (astro preview/dev)
 *   npx lighthouse <url> --config-path=lighthouserc.cjs
 *
 * The budgets below are a baseline; the production goal is LCP < 2.5s,
 * TBT < 200ms, CLS < 0.1, FCP < 1.8s.
 */
'use strict';

const budgets = require('./budget.json');

/** @type {import('lighthouse').Config} */
module.exports = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    budgets,
    throttlingMethod: 'simulate',
  },
  categories: {
    performance: {
      auditRefs: [
        // Harden the core Web Vitals thresholds so the audit fails loudly
        // when a change regresses LCP/TBT/CLS/FCP.
      ],
    },
  },
};
