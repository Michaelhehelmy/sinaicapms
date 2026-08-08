# Safety and Security Rules — SinaiCamps

These rules are non-negotiable for all AI agents working in this repository.

## 1. Coding and Pattern Guidelines

### Framework Rules (Astro + React)

### Language Rules (TypeScript frontend, JavaScript backend)
- Strict typing: Avoid using `any`. Define interfaces/types for all functions, endpoints, and database models.

### Styling Rules (Tailwind CSS)
- **Tailwind Usage**: Use Tailwind utility classes. Avoid inline style attributes unless calculating dynamic runtime positions (e.g., animations, chart bars).
- **Theme Constraints**: Restrict color, spacing, and font values to the Tailwind configuration values. Do not use arbitrary values like `bg-[#123456]` unless authorized.

## 2. Database & Migration Rules

### Database Rules (Cloudflare D1 — SQLite)
- **Database**: Cloudflare D1 (distributed SQLite). Never reference a local `.db` file — there is none.
- **Locks and Transactions**: Always handle write transactions carefully to prevent SQLite database locks. Avoid keeping transactions open during slow external API requests.
- **Query Pattern**: Always use Cloudflare D1's parameterized query API: `.prepare().bind()` for all database operations. Never compose or execute raw SQL strings with interpolated values.
- **Migrations**: Every schema modification must be made via migration SQL files in `backend/migrations/`. Apply with `wrangler d1 migrations apply`.
- **Access Control**: Every query must be scoped by the tenant identifier (e.g., `site_id` or `tenant_id`). Cross-tenant leaks are critical security failures.
- **Generated Columns**: `pos_users.name` is a GENERATED column (`first_name || ' ' || last_name`). INSERT with `first_name`/`last_name` only — never insert into `name` directly.
- **KV Write Quota (free plan)**: Cloudflare free plan allows **1,000 KV writes/day**. Do NOT add a KV `put()` per request (rate limiting does this and fails closed at the quota → full API 429 outage). Keep `RATE_LIMIT_KV_ENABLED="false"` in `backend/wrangler.toml` unless the plan has adequate KV quota. The frontend must never read/write KV — only the backend Worker via bindings.

## 3. Testing Rules

- **Coverage**: Maintain a minimum test coverage. Ensure new modules have accompanying unit tests.
- **Idempotency**: All tests must be idempotent — they must produce the same result regardless of the order they are run or the number of executions.
- **Zero Failures**: Never skip a failing test to pass validation. Always debug and fix the root cause.

## 4. Front-End, UX, and Dynamic Configuration Rules

- **Authentication State Logic**:
  - Always handle authentication state dynamically in the UI. If a user is logged in, hide all sign-in and registration actions. Instead, display their name, avatar, role, and a Sign Out button.
  - Render appropriate role-specific navigation/dashboard links (e.g., master/admin dashboards vs client portals) depending on session data.
  - Implement full loading/pending states during authentication verification to prevent UI flickers.
- **Zero Hardcoded Data**:
  - Do not hardcode page copy, pricing tiers, camp listings, site settings, or branding colors.
  - All content and values must be editable/changeable from the frontend dashboard or custom settings interface.
  - Configurable settings must be fetched from backend endpoints (e.g., D1 DB or KV cache APIs).
- **Backend API & Route Security**:
  - Every setting modified on the frontend must have a corresponding, secure backend API route (Hono routes on Cloudflare Workers) to save/load it.
  - All backend endpoints updating configurations must have strict authentication/session checks and authorization checks (e.g., verify role is admin or owner/manager).
  - Implement request validation (e.g., schema validation) on backend APIs to reject bad inputs and return clean JSON error payloads.
  - Ensure tenant isolation: always check and scope settings queries/updates by tenant/site ID.
- **Premium UX Standards**:
  - Avoid simple MVPs. Use vibrant gradients, rounded borders, glassmorphism, responsive grids, and smooth CSS transitions/animations.
  - Provide inline alerts, loading spinners (`Loader2`), disabled form states, and explicit success messages for all actions.

## 5. Git & Commit Rules

- **Secrets**: Never commit credentials, passwords, API tokens, `.env` files, or production configurations.
- **Ignore List**: Ensure all temporary execution files, test results, logs, and coverage reports are ignored in `.gitignore`.
- **Commit Messages**: Write meaningful, standardized commit messages (e.g. `feat: ...`, `fix: ...`, `chore: ...`).
