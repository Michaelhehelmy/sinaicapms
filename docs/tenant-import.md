# Tenant Import — go live from a single JSON manifest

`POST /api/tenants/import` lets you populate a camp with its **tenant branding, products, rooms, rate
plans, menu, and POS users in one HTTP call** (or one paste in the admin panel). A fully-working
sample lives at [`docs/examples/tenant-manifest.example.json`](examples/tenant-manifest.example.json).

The wire contract is **camelCase end-to-end**: you send `logoUrl`, `basePrice`, `pricePerNight`,
`mealCategoryId`, `firstName`, `productName`, `categoryName`, … exactly as in the sample. The backend
`toSnake()`s the body and validates it against a snake_case Zod schema (unknown keys are stripped, so a
top-level `images`/`identity` documentation block is inert when the request has no `identity`).

## Two modes

| Mode | Who | What happens |
| --- | --- | --- |
| **Existing tenant** (default) | Any admin of the tenant (`scope.user.role` `super_admin` or `admin`) | Manifests import into the requester's tenant. Best for tenant admins going live from the admin panel |
| **Super-admin identity** | `scope.user.role === 'super_admin'` | Adding an `identity` block provisions a **brand-new tenant**: tenant row (`subdomain`, `type`, `businessType`), active tenant admin (bcrypt, `role='admin'`, `is_active=1`), POS org + store + mapping (via `ensureTenantOrg`), a default `projects` row (slug from subdomain), **then** imports the rest of the manifest → `201` with `created: { tenantId, adminId, organizationId }` |

Every other caller who includes `identity` gets **403 `Only super-admin can provision new tenants`**.

```jsonc
// Super-admin "spin up a brand-new tenant" manifest (subset shown)
{
  "identity": {
    "name": "Acacia Camp",
    "subdomain": "acaciacamp",
    "type": "camp",                          // camp|supermarket|transportation|other
    "email": "owner@acaciacamp.com",
    "password": "supersecret123",            // min 8 chars
    "firstName": "Nour",
    "lastName": "Adel",
    "businessType": "glamping"               // optional
  },
  "tenant": { "currency": "EGP", "primaryColor": "#0f766e" },
  "products": [
    { "name": "Standard Tent", "basePrice": 900, "type": "room" }
  ]
}
```

> **Do not** ship the `identity` object inside a tenant-admin import: any truthy `identity` routes the
> request into creation mode and fails. Keep identity-mode manifests separate.

## Sections reference

### `identity` *(optional, super-admin)*
`name`, `subdomain` (lowercase alphanumerics + hyphens, 1 char or 3–63 chars; 2-char rejected), `type`, `email`, `password` (≥ 8),
`firstName`, `lastName`, `businessType?`. `subdomain` and admin `email` are checked for uniqueness
(400 if taken).

### `tenant` *(optional — existing-tenant profile update)*
`name`, `logoUrl`, `faviconUrl`, `heroImageUrl`, `primaryColor`, `currency`, `footerText`,
`location`, `whatsappNumber`, `phone`, `email`, `description`, `galleryImages`, `aboutText`,
`faqItems`, `reviews`, `mapEmbedUrl`, `activities`, `capacity`, `menuConfig`.
All fields are `COALESCE`d over the existing row — omitted fields are left untouched. JSON-string
columns (`galleryImages`, `faqItems`, `reviews`, `activities`, `menuConfig`) are stored verbatim as
strings (send the JSON-encoded string).

### `project` *(optional)*
`name`, `location`, `capacity`, `status` (`active|inactive|planning|completed`). Sets/updates the
tenant's default project for camp scoping.

### `products` *(≤ 200)*
`id?`, **`name`**, `sku?`, `basePrice?`, `capacity?`, `description?`, `shortDescription?`,
`imageUrl?`, `categoryId?`, `isActive?` (0/1), `type?` (`room|menu|buffet|retail`), `campId?`.
IDs default to a generated `prod_…`; SKUs default to `PROD-<ID>`. Duplicate SKU/ID → 409. Products
are the **FK target** referenced by `rooms` and `ratePlans` (see below).

### `rooms` *(≤ 200, land in `rooms_new`)*
`id?`, **`name`**, `productId?` **or** `productName?` (resolved against imported + existing tenant
products), `floor?`, `status?` (default `available`), `bedType?`, `maxGuests?` (defaults to the
referenced product's `capacity`), `basePrice?`, `notes?`, `isActive?`.
Rooms are inserted via a tenant-scoped `INSERT … SELECT` guard into **`rooms_new`**; the product is
mirrored into the `products` table for the FK via `ensureProductInProductsTable`. Referencing an
unknown product → 400; a product/camp outside the tenant → 404.

### `ratePlans` *(≤ 200, land in `rate_plans_new`)*
`id?`, `productId?` **or** `productName?`, **`name`**, **`pricePerNight`** (positive),
`startDate?`, `endDate?`, `season?` (default `all`), `minStay?` (default 1), `isActive?`.
Products must belong to the tenant (same guard → 404 otherwise).

### `menu` *(≤ 50 categories, ≤ 200 meals)*
- `categories`: `**name**`, `position?` → `meal_categories` + `meal_categories_lang` (`lang='en'`).
- `meals`: `id?`, **`name`**, `mealCategoryId?` **or** `categoryName?` (resolved), `price?`,
  `description?`, `imageUrl?`, `isActive?` → `meals` + `meal_lang` (`lang='en'`).

### `posUsers` *(≤ 100)*
**`email`**, `username?` (defaults to email), **`password`** (≥ 8), **`firstName`**, **`lastName`**,
`phone?`, `role?` (`cashier|manager|admin`, default `cashier`), `department?`, `employeeId?`,
`storeId?` (defaults to the org's first store).
**Use `firstName`/`lastName` only — the `pos_users.name` column is GENERATED; inserting `name`
directly is forbidden.** Duplicate email/username → 409.

## Images (base64 + URLs)

Any image field (`tenant.logoUrl`, `tenant.faviconUrl`, `tenant.heroImageUrl`, `product.imageUrl`,
`meal.imageUrl`) accepts three forms:

| Form | Behavior |
| --- | --- |
| `data:image/<ext>;base64,…` where `ext ∈ jpg\|jpeg\|png\|webp\|gif`, ≤ **8 MB** | Auto-uploads to R2 (`MEDIA_BUCKET`) → stores the returned `/api/media/…` URL |
| `http://` / `https://` URL | Passed through unchanged |
| `/api/media/…` URL | Passed through unchanged (already-uploaded asset) |

Anything else (wrong ext, oversize, malformed data URI, `MEDIA_BUCKET` unbound) resolves to `null`.
The `images` block in the sample is **illustrative only** — the manifest schema strips it; attach
values to the real image fields instead.

## Error semantics

| HTTP | Meaning |
| --- | --- |
| `200` | Imported into the existing tenant → `{ success, tenantId, counts }` |
| `201` | Identity mode: new tenant + admin + org + project provisioned → `{ …200, created }` |
| `400` | Zod validation failure (missing/invalid fields, `pricePerNight ≤ 0`), unknown `productName` reference, bad/duplicate `subdomain`, or admin `email` already taken |
| `401` | No tenant context in existing-tenant mode |
| `403` | `identity` present but caller is not `super_admin` |
| `404` | Room/rate-plan guard found no matching tenant camp/product |
| `409` | Tenant not POS-provisioned, or duplicate SKU/ID/email/username (UNIQUE constraint) |

`counts` = `{ products, rooms, ratePlans, mealCategories, meals, posUsers }`.

## Usage

**Admin panel** (tenant admin): *Settings → Tenant Import* → paste the manifest or *Load from file* →
preview shows per-section counts → **Import**. A toast confirms with the counts breakdown.

**curl** (existing tenant, admin JWT):

```bash
curl -sS -X POST https://sinaicamps.com/api/tenants/import \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  --data-binary @docs/examples/tenant-manifest.example.json
```

**curl** (super-admin, brand-new tenant via identity):

```bash
curl -sS -X POST https://sinaicamps.com/api/tenants/import \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  --data-binary @identity-manifest.json
```

> The import never writes to KV (free-plan 1,000 writes/day quota) — image assets go to R2 only, and
> caching stays header-only.

## Verification

`cd backend && npx vitest run tests/tenant-import-smoke.test.js` imports the shipped sample end-to-end
through the real route against a stateful in-memory D1 mock and asserts 4/4: fixture-source logging,
complete import with all `counts` > 0, no spurious R2 uploads on URL-only samples, and that
products/rooms/rate_plans/meals/POS users are queryable afterwards.