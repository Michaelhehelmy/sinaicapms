-- Migration 0097: Human-testing debug feedback reports.
--
-- Feedback is submitted through the floating debug widget (admin/POS SPAs and
-- public pages with ?debug=1) during the human-testing phase. Tester picks a
-- category, writes a message plus a personal point of view, and the widget
-- attaches an automatic screenshot (downscaled JPEG, base64, size-capped
-- client- and server-side). Reports land in the super-admin Feedback panel.
-- The screenshot is stored inline in the row (base64 JPEG ≈ 100–250 KB) for
-- the testing phase — deliberately NOT in R2/KV to avoid upload scoping and
-- free-plan write quota. Upgrade path: replace `screenshot` with an R2 key.
CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'pos', 'public')),
    author_id TEXT,
    author_name TEXT,
    author_email TEXT,
    role TEXT,
    category TEXT NOT NULL CHECK (category IN ('bug', 'missing', 'flow')),
    message TEXT NOT NULL,
    personal_view TEXT,
    page_url TEXT NOT NULL,
    user_agent TEXT,
    screenshot TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'archived')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenant_id);