-- Migration 0021: Consolidate room_types into pos_products
-- Adds accommodation-specific columns to pos_products, creates product_camps
-- junction table, migrates data, then drops legacy room_types/room_type_camps

-- 1. Add accommodation-specific columns to pos_products
ALTER TABLE pos_products ADD COLUMN capacity INTEGER DEFAULT 1;

-- 2. Create product_camps junction table (replaces room_type_camps)
CREATE TABLE IF NOT EXISTS product_camps (
  product_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  PRIMARY KEY (product_id, camp_id)
);

-- 3. Migrate capacity/image_url from room_types into existing pos_products (type='room')
UPDATE pos_products SET
  capacity = (SELECT capacity FROM room_types WHERE room_types.id = pos_products.id),
  image_url = (SELECT image_url FROM room_types WHERE room_types.id = pos_products.id)
WHERE pos_products.type = 'room'
  AND EXISTS (SELECT 1 FROM room_types WHERE room_types.id = pos_products.id);

-- 4. Migrate room_type_camps → product_camps
INSERT OR IGNORE INTO product_camps (product_id, camp_id)
SELECT room_type_id, camp_id FROM room_type_camps;

-- 5. Drop legacy room_type_camps only
DROP TABLE IF EXISTS room_type_camps;

-- 6. Create sync triggers to keep legacy room_types table updated
CREATE TRIGGER IF NOT EXISTS sync_room_type_insert
AFTER INSERT ON pos_products
WHEN NEW.type = 'room'
BEGIN
  INSERT OR IGNORE INTO room_types (id, tenant_id, name, capacity, base_price, description, image_url)
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.name,
    COALESCE(NEW.capacity, 1),
    COALESCE(NEW.selling_price, 0),
    NEW.description,
    NEW.image_url
  );
END;

CREATE TRIGGER sync_room_type_update
AFTER UPDATE ON pos_products
BEGIN
  -- Delete from legacy room_types if type changed away from room
  DELETE FROM room_types
  WHERE id = OLD.id AND OLD.type = 'room' AND NEW.type != 'room';

  -- Insert into legacy room_types if type changed to room
  INSERT OR IGNORE INTO room_types (id, tenant_id, name, capacity, base_price, description, image_url)
  SELECT NEW.id, NEW.tenant_id, NEW.name, COALESCE(NEW.capacity, 1), COALESCE(NEW.selling_price, 0), NEW.description, NEW.image_url
  WHERE OLD.type != 'room' AND NEW.type = 'room';

  -- Update legacy room_types if it remains a room
  UPDATE room_types SET
    name = NEW.name,
    capacity = COALESCE(NEW.capacity, 1),
    base_price = COALESCE(NEW.selling_price, 0),
    description = NEW.description,
    image_url = NEW.image_url,
    tenant_id = NEW.tenant_id
  WHERE id = NEW.id AND OLD.type = 'room' AND NEW.type = 'room';
END;

CREATE TRIGGER IF NOT EXISTS sync_room_type_delete
AFTER DELETE ON pos_products
WHEN OLD.type = 'room'
BEGIN
  DELETE FROM room_types WHERE id = OLD.id;
END;
