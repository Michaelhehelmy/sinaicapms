-- Migration 0017: Create POS Activity Logs Table
CREATE TABLE IF NOT EXISTS pos_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    new_values TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
