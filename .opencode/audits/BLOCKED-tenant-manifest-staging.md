# BLOCKED: tenant-manifest UI walkthrough on staging

## What was attempted
Task 2 walkthrough of the tenant-manifest download/upload/preview flow on
https://acacia.staging.sinaicamps.com/admin (7 steps).

## Finding
Staging does not have the feature code. Last staging deploy ran 11:52 local;
the four feature commits landed 17:56–18:04 local (2ca750c, 45bb7ff, 037790f,
439ae33) plus SW cleanup 7cae710 at 20:44. The Download Template button,
identity guard, and banner do not exist on the live staging bundle.

## Exact evidence
- `git log`: feature commits dated 2026-09-22 17:56+; G6.5 SATISFIED 12:07.
- Last staging deploy log (/tmp/staging-deploy4.log) timestamped pre-feature.
- No code change can fix this from the agent side.

## What is required
Owner runs `./deploy.sh --staging`, confirms `Uploaded
campmaster-marketplace-staging`, then agent reruns Task 2 steps 1–7.

## Who decides
Owner (deploy.sh is owner-only per mission hard rules).
