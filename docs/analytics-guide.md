# Analytics & Reports Guide

This guide covers the analytics dashboard in SinaiCamps — metrics, revenue breakdown, customer insights, and data export.

---

## Dashboard Tabs Overview

The analytics dashboard is accessible from the admin panel under **Reports**. It provides multiple views of your business performance.

| Tab | Focus |
|-----|-------|
| **Overview** | High-level KPIs and trends |
| **Revenue** | Detailed revenue breakdown |
| **Customers** | Guest demographics and behavior |
| **Products** | Room and product performance |
| **Kitchen** | Meal sales and kitchen metrics |
| **Inventory** | Stock levels and movement |

---

## Revenue Breakdown

### By Product Type

The revenue tab breaks down income by source:

- **Room Revenue** — Income from room bookings
- **Meal Revenue** — Income from restaurant and meal orders
- **Service Revenue** — Income from bookable services
- **POS Revenue** — Income from retail/supermarket sales

Each category shows total revenue, percentage contribution, and trend over time.

### By Payment Method

Revenue is also categorized by how guests paid:

| Method | Tracking |
|--------|----------|
| **Cash** | Physical cash payments |
| **Card** | Credit/debit card transactions |
| **E-Wallet** | Mobile wallet payments |
| **Instapay** | Bank transfer payments |
| **Online** | Web payment gateway |

This breakdown helps reconcile payment processor settlements and cash flow.

### Time-Based Analysis

- **Daily** — Day-over-day comparison
- **Weekly** — Week-over-week trends
- **Monthly** — Month-over-month analysis
- **Custom Range** — Select specific date ranges

---

## Customer Metrics

### Key Metrics

| Metric | Description |
|--------|-------------|
| **Total Customers** | All registered guests |
| **New Customers** | First-time guests in the period |
| **Repeat Customers** | Returning guests (2+ visits) |
| **Average Order Value (AOV)** | Mean transaction amount |
| **Customer Lifetime Value (CLV)** | Total spend per customer over time |

### Customer Segments

Customers are automatically segmented by:

- **Booking Frequency** — One-time, occasional, regular
- **Spend Level** — Budget, standard, premium
- **Recency** — Recent (last 30 days), lapsed (90+ days)
- **Source** — Direct, referral, marketplace

### Retention Analysis

Track how many guests return:

- **30-day retention** — Guests who book again within 30 days
- **90-day retention** — Guests who book again within 90 days
- **Annual retention** — Year-over-year return rate

---

## Exporting Data

### Export Options

All report data can be exported for external analysis:

1. Navigate to the desired report tab
2. Set filters and date range
3. Click **Export**
4. Choose format:
   - **CSV** — For spreadsheets and data analysis
   - **PDF** — For sharing and presentations

### Scheduled Reports

For recurring reporting needs:

1. Go to **Settings** → **Reports**
2. Configure report schedule:
   - Frequency (daily, weekly, monthly)
   - Recipients (email addresses)
   - Format preference
3. Reports are generated and delivered automatically

### API Access

For programmatic access to analytics data:

- `GET /api/reports/revenue` — Revenue data
- `GET /api/reports/customers` — Customer metrics
- `GET /api/reports/products` — Product performance
- `GET /api/reports/inventory` — Inventory status

All report endpoints require admin authentication.
