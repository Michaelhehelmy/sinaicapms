import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO tenants (id, name) VALUES ('acaciacamp', 'Test Tenant');
    INSERT INTO tenants (id, name) VALUES ('michaelshouse', 'Tenant Two');

    CREATE TABLE room_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER,
      base_price REAL,
      description TEXT,
      image_url TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE room_type_camps (
      room_type_id TEXT NOT NULL,
      camp_id TEXT NOT NULL,
      PRIMARY KEY (room_type_id, camp_id),
      FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE
    );

    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
      organization_id INTEGER NOT NULL DEFAULT 1,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
      image_url TEXT,
      type TEXT CHECK(type IN ('room','menu','buffet','retail')) DEFAULT 'retail'
    );
  `);

  const triggerSql = readFileSync(
    join(import.meta.dirname, '../migrations/0021_room_types_to_pos_products.sql'),
    'utf8'
  );
  db.exec(triggerSql);

  return db;
}

describe('SQLite Triggers — room_types ↔ pos_products sync (migration 0021)', () => {
  let db;

  beforeAll(() => {
    db = createTestDb();
  });

  beforeEach(() => {
    db.exec('DELETE FROM pos_products');
    db.exec('DELETE FROM room_types');
    db.exec('DELETE FROM product_camps');
  });

  describe('INSERT trigger (sync_room_type_insert)', () => {
    it('should sync a room-type product into room_types', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, description, selling_price, image_url, type, capacity)
        VALUES ('prod_1', 'acaciacamp', 1, 'SKU-001', 'Beach Bungalow', 'Cozy bungalow', 120.50, 'http://img/bungalow.jpg', 'room', 3)
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_1');
      expect(rt).toBeDefined();
      expect(rt.id).toBe('prod_1');
      expect(rt.tenant_id).toBe('acaciacamp');
      expect(rt.name).toBe('Beach Bungalow');
      expect(rt.capacity).toBe(3);
      expect(rt.base_price).toBeCloseTo(120.50);
      expect(rt.description).toBe('Cozy bungalow');
      expect(rt.image_url).toBe('http://img/bungalow.jpg');
    });

    it('should NOT create a room_types row for a non-room product', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type)
        VALUES ('prod_2', 'acaciacamp', 1, 'SKU-002', 'Camp Chair', 'retail')
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_2');
      expect(rt).toBeUndefined();
    });

    it('should NOT create a room_types row for a menu product', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type, selling_price)
        VALUES ('prod_3', 'acaciacamp', 1, 'SKU-003', 'Grilled Fish', 'menu', 25.00)
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_3');
      expect(rt).toBeUndefined();
    });
  });

  describe('UPDATE trigger (sync_room_type_update)', () => {
    it('should update room_types when a room-type product is updated', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, description, selling_price, image_url, type, capacity)
        VALUES ('prod_10', 'acaciacamp', 1, 'SKU-010', 'Mountain Cabin', 'Rustic cabin', 200.00, 'http://img/cabin.jpg', 'room', 4)
      `).run();

      db.prepare(`
        UPDATE pos_products
        SET name = 'Mountain Suite', description = 'Luxury suite', selling_price = 350.00,
            image_url = 'http://img/suite.jpg', capacity = 6
        WHERE id = 'prod_10'
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_10');
      expect(rt).toBeDefined();
      expect(rt.name).toBe('Mountain Suite');
      expect(rt.description).toBe('Luxury suite');
      expect(rt.base_price).toBeCloseTo(350.00);
      expect(rt.image_url).toBe('http://img/suite.jpg');
      expect(rt.capacity).toBe(6);
    });

    it('should NOT update room_types when a non-room product is updated', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type)
        VALUES ('prod_11', 'acaciacamp', 1, 'SKU-011', 'Tent', 'retail')
      `).run();

      db.prepare(`UPDATE pos_products SET name = 'Deluxe Tent' WHERE id = ?`).run('prod_11');

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_11');
      expect(rt).toBeUndefined();
    });
  });

  describe('DELETE trigger (sync_room_type_delete)', () => {
    it('should delete room_types when a room-type product is deleted', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type, capacity, selling_price)
        VALUES ('prod_20', 'acaciacamp', 1, 'SKU-020', 'Desert Camp', 'room', 2, 80.00)
      `).run();

      expect(db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_20')).toBeDefined();

      db.prepare('DELETE FROM pos_products WHERE id = ?').run('prod_20');

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_20');
      expect(rt).toBeUndefined();
    });

    it('should NOT affect room_types when a non-room product is deleted', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type)
        VALUES ('prod_21', 'acaciacamp', 1, 'SKU-021', 'Firewood Bundle', 'retail')
      `).run();

      const roomCountBefore = db.prepare('SELECT COUNT(*) AS cnt FROM room_types').get().cnt;

      db.prepare('DELETE FROM pos_products WHERE id = ?').run('prod_21');

      const roomCountAfter = db.prepare('SELECT COUNT(*) AS cnt FROM room_types').get().cnt;
      expect(roomCountAfter).toBe(roomCountBefore);
    });
  });

  describe('COALESCE defaults', () => {
    it('should default capacity to 1 when NULL', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type)
        VALUES ('prod_30', 'acaciacamp', 1, 'SKU-030', 'Null Capacity Room', 'room')
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_30');
      expect(rt).toBeDefined();
      expect(rt.capacity).toBe(1);
    });

    it('should default base_price to 0 when selling_price is 0 (COALESCE path)', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type, selling_price)
        VALUES ('prod_31', 'acaciacamp', 1, 'SKU-031', 'Zero Price Room', 'room', 0)
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_31');
      expect(rt).toBeDefined();
      expect(rt.base_price).toBe(0);
    });

    it('should use actual values when not NULL', () => {
      db.prepare(`
        INSERT INTO pos_products (id, tenant_id, organization_id, sku, name, type, capacity, selling_price)
        VALUES ('prod_32', 'acaciacamp', 1, 'SKU-032', 'Explicit Values Room', 'room', 5, 250.75)
      `).run();

      const rt = db.prepare('SELECT * FROM room_types WHERE id = ?').get('prod_32');
      expect(rt).toBeDefined();
      expect(rt.capacity).toBe(5);
      expect(rt.base_price).toBeCloseTo(250.75);
    });
  });
});
