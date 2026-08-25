# Supermarket / POS Guide

This guide covers setting up and managing a supermarket or retail operation using the SinaiCamps POS system.

---

## POS Setup

### Accessing the POS

The POS terminal runs as a separate SPA at `/pos` on a tenant domain:

- **URL**: `https://{tenant}.sinaicamps.com/pos`
- **Login**: Use your cashier credentials (identifier + password)
- **Note**: `sinaicamps.com/pos` (marketplace domain) returns a branded 404 — POS is tenant-only

### Creating Products

1. Log in to the POS terminal
2. Navigate to **Products**
3. Click **Add Product**
4. Fill in product details:
   - **Name** — Product name
   - **Price** — Selling price
   - **SKU** — Stock keeping unit (barcode)
   - **Category** — Product category
   - **Stock Quantity** — Initial inventory count
5. Save the product

Products appear in the POS register and can be added to orders.

---

## Promotions

The POS supports multiple promotion types:

### Buy One Get One (BOGO)

- Buy X items, get Y free (or discounted)
- Configure: buy quantity, get quantity, eligible products/categories
- Applies automatically at checkout when conditions are met

### Percentage Discount

- Reduce price by a fixed percentage
- Set minimum quantity to trigger
- Apply to specific products or entire categories

### Fixed Discount

- Reduce price by a fixed amount (e.g., $5 off)
- Set minimum purchase amount
- Can be limited to specific date ranges

### Configuring Promotions

Navigate to the **Promotions** section in the POS admin:

1. Select promotion type
2. Set trigger conditions (quantity, products, date range)
3. Set discount value
4. Activate the promotion

Promotions stack according to priority rules configured in settings.

---

## Inventory Management

### Viewing Inventory

The **Inventory** panel shows current stock levels for all products:

- Filter by category, stock status, or name
- Sort by quantity, name, or last updated
- Search by product name or SKU

### Low-Stock Alerts

Set minimum stock thresholds per product:

1. Open a product's inventory settings
2. Set **Low Stock Threshold** (e.g., 10 units)
3. When stock falls below this level, the product appears in the low-stock alert list
4. The POS dashboard displays a low-stock warning badge

### Stock Adjustments

Manually adjust inventory when needed:

1. Navigate to **Inventory**
2. Select the product to adjust
3. Choose adjustment type:
   - **Restock** — Add received inventory
   - **Damage** — Remove damaged items
   - **Correction** — Fix count discrepancies
4. Enter the quantity and reason
5. Save the adjustment

All adjustments are logged with timestamps and operator info for audit trails.

---

## Processing a Sale

### Register Workflow

1. Open a shift (enter starting cash amount)
2. Add products to the cart by scanning barcode or searching
3. Apply promotions (auto-applied or manual entry)
4. Select payment method:
   - **Cash** — Enter amount received, system calculates change
   - **Card** — Process card payment
   - **E-Wallet** — Mobile payment options
5. Complete the transaction
6. Print or skip receipt

### End of Shift

1. Navigate to **Shifts**
2. Click **End Shift**
3. Enter closing cash count
4. System calculates variance (expected vs. actual)
5. Confirm and close

Shift reports are generated automatically and available in the Reports panel.
