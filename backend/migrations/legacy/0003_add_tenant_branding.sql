-- Add new branding and contact columns to tenants table
ALTER TABLE tenants ADD COLUMN favicon_url TEXT;
ALTER TABLE tenants ADD COLUMN location TEXT;
ALTER TABLE tenants ADD COLUMN whatsapp_number TEXT;
ALTER TABLE tenants ADD COLUMN phone TEXT;
ALTER TABLE tenants ADD COLUMN email TEXT;
ALTER TABLE tenants ADD COLUMN description TEXT;
