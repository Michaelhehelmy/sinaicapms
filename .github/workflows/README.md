# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for automated testing and deployment.

## Workflows

### `ci.yml` — Tests (runs on every push/PR)
- **Backend Tests**: Runs `vitest` in `backend/`
- **Frontend Tests**: Runs `vitest` in `app/`
- **Integration Tests**: Runs root-level integration tests
- **Backend Lint**: Checks OpenAPI spec generation

### `deploy.yml` — Full Deployment (runs on push to `main` or `staging`)
- **Test Gate**: All tests must pass before deployment
- **Backend Deploy**: Applies D1 migrations, deploys Worker
- **Frontend Deploy**: Builds Astro app, deploys to Cloudflare Pages
- **E2E Verification**: Runs smoke tests against live site
- **Notify**: Posts deployment summary

## Required GitHub Secrets

Go to your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Description | How to get it |
|--------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers/Pages/D1 permissions | Cloudflare Dashboard → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare Dashboard → Right sidebar |

### Token Permissions Required

When creating the API token, select these permissions:
- **Account level**: `Workers Scripts: Edit`, `D1: Edit`, `Cloudflare Pages: Edit`
- **Zone level** (for `sinaicamps.com`): `Zone: Read`, `Workers Routes: Edit`

## Branch Strategy

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | https://sinaicamps.com |
| `staging` | Staging | https://staging.sinaicamps.com |
| PRs | Preview | Cloudflare Pages preview URLs |

## How It Works

1. **Push to `main`** → Tests run → Backend deploys to production → Frontend deploys to production → E2E smoke tests
2. **Push to `staging`** → Tests run → Backend deploys to staging → Frontend deploys to staging → E2E smoke tests
3. **Open PR** → Tests run only (no deployment)

## Manual Deploy

If you need to deploy manually (bypassing CI):

```bash
# Full deploy (production)
./deploy.sh

# Backend only
./deploy.sh --backend

# Frontend only
./deploy.sh --frontend

# Staging
./deploy.sh --staging
```

## Troubleshooting

### "Wrangler login failed"
The GitHub Actions runner can't do interactive browser auth. Ensure `CLOUDFLARE_API_TOKEN` is set in GitHub Secrets.

### "D1 migration failed"
Check if the migration file exists in `backend/migrations/`. The workflow runs `wrangler d1 migrations apply` which applies all pending migrations.

### "Pages deploy failed"
Ensure the Pages project exists in Cloudflare. Run `npx wrangler pages project create campmaster-marketplace` if needed.
