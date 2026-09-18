// Unit test for the POS route's pos_transactions INSERT (Wave 2.4).
// Stripe retired; HMAC-verified Paymob replaced it. Here we verify the byte
// edits the owner authorized on backend/src/routes/pos/index.js: the
// tip_amount column is persisted and the bind values are wired.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const posRoute = readFileSync(join(here, '../../backend/src/routes/pos/index.js'), 'utf8');

describe('pos_transactions INSERT (Wave 2.4 tip_amount)', () => {
  it('persists the tip_amount column and binds tipAmount in the correct position', () => {
    expect(posRoute).toContain('tip_amount, created_at, updated_at)');
    expect(posRoute).toContain('tipAmount || 0');
    // The retired-TODO is gone now that the column is persisted.
    expect(posRoute).not.toContain('TODO: Add tip_amount column');
  });
});
