# Analytics & Reports Guide

This guide covers the analytics dashboard in SinaiCamps — metrics, revenue breakdown, customer insights, and data export.

---

## Dashboard Tabs Overview

The analytics dashboard is accessible from the admin panel under **Reports**. It provides multiple views of your business performance.

| Tab | Focus |
|-----|-------|
| **occupancy** | Occupancy analytics (live) |
| **revenue** | Revenue analytics (live) |
| **bookings** | Bookings list (live) |

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
| **Split** | cash+card split (live values: cash\|card\|split; Paymob webhook covers booking orders only when PM_ENABLED=true) |

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

1. Navigate to the desired report tab (tenant panel has no Export button — exports live in super-admin templates as CSV/JSON, no PDF)
2. Set filters and date range

### Scheduled Reports

For recurring reporting needs:

1. Go to **Settings** → **Reports**
2. Configure report schedule:
   - Frequency (daily, weekly, monthly)
   - Recipients (email addresses)
   - Format preference
3. Reports are generated from templates (schedules persist in memory only, no email delivery)

### API Access

For programmatic access to analytics data:

- `GET /api/reports/revenue` — Revenue data
- `GET /api/reports/customer-metrics` — Customer metrics
- `GET /api/reports/top-products` — Product performance
- `GET /api/reports/low-stock` — Inventory status
- plus `occupancy, bookings, kitchen-performance, revenue-breakdown, seasonal`

All report endpoints require admin authentication.
