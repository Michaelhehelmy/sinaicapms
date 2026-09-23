-- Migration 0045: Drop dead tables
-- Uses PRAGMA defer_foreign_keys = true (D1-specific) to bypass FK checks during drops.

PRAGMA defer_foreign_keys = true;

-- Phase 1: Drop children first (FK → room_types, rooms)
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS rate_plans;
DROP TABLE IF EXISTS room_types;

-- Phase 2: Drop remaining dead tables
DROP TABLE IF EXISTS camps_new;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS loyalty_transactions;
DROP TABLE IF EXISTS pos_payments;

PRAGMA defer_foreign_keys = false;
