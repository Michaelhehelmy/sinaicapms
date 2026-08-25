-- 0070: Add meal plan category linkage to projects
-- When set, the booking flow shows meal plan options from this category
ALTER TABLE projects ADD COLUMN meal_plan_category_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_meal_plan_category ON projects(meal_plan_category_id);
