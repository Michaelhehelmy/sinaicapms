import { describe, it, expect } from 'vitest';

// ─── Auth Schemas ─────────────────────────────────────────────
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../src/api/auth.js';

// ─── Admin Schemas ────────────────────────────────────────────
import {
  tenantUpdateSchema,
  bulkActionSchema,
  adminCreateSchema,
  adminUpdateSchema,
} from '../src/api/admin.js';

// ─── Category Schemas ─────────────────────────────────────────
import {
  categoryPostSchema,
  categoryPutSchema,
} from '../src/api/categories.js';

// ─── Lead Schemas ─────────────────────────────────────────────
import {
  leadPostSchema,
  leadPutSchema,
} from '../src/api/leads.js';

// ─── Meal Category Schemas ────────────────────────────────────
import {
  mealCategoryPostSchema,
  mealCategoryPutSchema,
} from '../src/api/meal-categories.js';

// ─── Meal Schedule Schemas ────────────────────────────────────
import {
  schedulePostSchema,
} from '../src/api/meal-schedules.js';

// ─── Plan Schemas (others.js) ─────────────────────────────────
import {
  planPostSchema,
  planPutSchema,
} from '../src/api/others.js';

// ─── Tenant Schemas ───────────────────────────────────────────
import {
  tenantPostSchema,
  tenantMePutSchema,
} from '../src/api/tenants.js';

// ─── Payment Schemas ──────────────────────────────────────────
import {
  paymentIntentSchema,
  confirmPaymentSchema,
} from '../src/api/payments.js';

// ══════════════════════════════════════════════════════════════
// AUTH SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('loginSchema', () => {
  it('accepts valid input with email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@test.com',
      password: 'secret123',
      tenantId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown tenant_id (camelCase-only contract)', () => {
    const result = loginSchema.safeParse({
      email: 'admin@test.com',
      password: 'secret123',
      tenant_id: 't1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_id).toBeUndefined();
      expect(result.data.tenantId).toBeUndefined();
    }
  });

  it('accepts input without any tenant identifier', () => {
    const result = loginSchema.safeParse({
      email: 'admin@test.com',
      password: 'secret123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({ password: 'secret123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Email is required');
    }
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ email: 'admin@test.com' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@test.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });

  it('strips unknown fields', () => {
    const result = loginSchema.safeParse({
      email: 'admin@test.com',
      password: 'secret123',
      evil: 'drop table',
      extra: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
      expect(result.data.extra).toBeUndefined();
    }
  });
});

describe('registerSchema', () => {
  it('accepts valid input', () => {
    const result = registerSchema.safeParse({
      name: 'John Admin',
      email: 'john@test.com',
      password: 'password123',
      tenantId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = registerSchema.safeParse({
      email: 'john@test.com',
      password: 'password123',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = registerSchema.safeParse({
      name: '',
      email: 'john@test.com',
      password: 'password123',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'not-an-email',
      password: 'password123',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Valid email is required');
    }
  });

  it('rejects missing email', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      password: 'password123',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      password: 'short',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password must be at least 8 characters');
    }
  });

  it('rejects missing password', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      tenantId: 't1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing tenantId', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty tenantId', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      password: 'password123',
      tenantId: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Tenant ID is required');
    }
  });

  it('accepts password with exactly 8 characters', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      password: '12345678',
      tenantId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      password: 'password123',
      tenantId: 't1',
      admin: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.admin).toBeUndefined();
    }
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid input with email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@test.com' });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with email and tenantId', () => {
    const result = forgotPasswordSchema.safeParse({
      email: 'user@test.com',
      tenantId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty email', () => {
    const result = forgotPasswordSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Email is required');
    }
  });

  it('tenantId is truly optional', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@test.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenantId).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = forgotPasswordSchema.safeParse({
      email: 'user@test.com',
      hacker: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hacker).toBeUndefined();
    }
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid input', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc-123-token',
      password: 'newpassword123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing token', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'newpassword123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = resetPasswordSchema.safeParse({
      token: '',
      password: 'newpassword123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Token is required');
    }
  });

  it('rejects missing password', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc-123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc-123',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password must be at least 8 characters');
    }
  });

  it('strips unknown fields', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc-123',
      password: 'newpassword123',
      extra: 'data',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extra).toBeUndefined();
    }
  });
});

describe('changePasswordSchema', () => {
  it('accepts valid input', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: 'newpass123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing currentPassword', () => {
    const result = changePasswordSchema.safeParse({
      newPassword: 'newpass123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty currentPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'newpass123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Current password is required');
    }
  });

  it('rejects missing newPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short newPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('New password must be at least 8 characters');
    }
  });

  it('accepts 8-character new password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: '12345678',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: 'newpass123',
      token: 'injected',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// ADMIN SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('tenantUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = tenantUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update', () => {
    const result = tenantUpdateSchema.safeParse({
      name: 'Updated Camp',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all fields', () => {
    const result = tenantUpdateSchema.safeParse({
      name: 'Camp',
      subdomain: 'my-camp',
      custom_domain: 'camp.com',
      logo_url: 'https://example.com/logo.png',
      favicon_url: 'https://example.com/favicon.ico',
      primary_color: '#ff0000',
      footer_text: 'All rights reserved',
      status: 'active',
      location: 'Sinai',
      whatsapp_number: '+201234567890',
      phone: '+201234567890',
      email: 'camp@test.com',
      description: 'A great camp',
      currency: 'EGP',
      admin_email: 'admin@camp.com',
      admin_password: 'password123',
      admin_first_name: 'Admin',
      admin_last_name: 'User',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = tenantUpdateSchema.safeParse({
      name: 'Camp',
      hack: 'DROP TABLE tenants',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

describe('bulkActionSchema', () => {
  it('accepts valid ids array', () => {
    const result = bulkActionSchema.safeParse({ ids: ['t1', 't2', 't3'] });
    expect(result.success).toBe(true);
  });

  it('accepts single-element ids array', () => {
    const result = bulkActionSchema.safeParse({ ids: ['t1'] });
    expect(result.success).toBe(true);
  });

  it('rejects empty ids array', () => {
    const result = bulkActionSchema.safeParse({ ids: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Tenant IDs array is required');
    }
  });

  it('rejects missing ids', () => {
    const result = bulkActionSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('rejects ids = string (not array)', () => {
    const result = bulkActionSchema.safeParse({ ids: 'not_an_array' });
    expect(result.success).toBe(false);
  });

  it('rejects ids = number (not array)', () => {
    const result = bulkActionSchema.safeParse({ ids: 123 });
    expect(result.success).toBe(false);
  });

  it('rejects ids with non-string elements', () => {
    const result = bulkActionSchema.safeParse({ ids: [123, true] });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = bulkActionSchema.safeParse({ ids: ['t1'], action: 'delete' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBeUndefined();
    }
  });
});

describe('adminCreateSchema', () => {
  it('accepts valid input with all required fields', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with optional fields', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin',
      tenantId: 't1',
      first_name: 'John',
      last_name: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = adminCreateSchema.safeParse({
      password: 'pass123',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = adminCreateSchema.safeParse({
      email: 'not-email',
      password: 'pass123',
      role: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Valid email is required');
    }
  });

  it('rejects missing password', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: '',
      role: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });

  it('rejects missing role', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: 'pass123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty role', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: 'pass123',
      role: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Role is required');
    }
  });

  it('strips unknown fields', () => {
    const result = adminCreateSchema.safeParse({
      email: 'admin@test.com',
      password: 'pass123',
      role: 'admin',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('adminUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = adminUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts is_active = true', () => {
    const result = adminUpdateSchema.safeParse({ is_active: true });
    expect(result.success).toBe(true);
  });

  it('accepts is_active = false', () => {
    const result = adminUpdateSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it('rejects is_active = string (not boolean)', () => {
    const result = adminUpdateSchema.safeParse({ is_active: 'yes' });
    expect(result.success).toBe(false);
  });

  it('accepts role update', () => {
    const result = adminUpdateSchema.safeParse({ role: 'super_admin' });
    expect(result.success).toBe(true);
  });

  it('accepts first_name and last_name', () => {
    const result = adminUpdateSchema.safeParse({
      first_name: 'John',
      last_name: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = adminUpdateSchema.safeParse({
      role: 'admin',
      hack: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// CATEGORY SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('categoryPostSchema', () => {
  it('accepts valid input with required field', () => {
    const result = categoryPostSchema.safeParse({ name: 'Camping Gear' });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all fields', () => {
    const result = categoryPostSchema.safeParse({
      name: 'Camping Gear',
      description: 'All camping gear',
      parent_id: 'cat_parent1',
      active: 1,
      position: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = categoryPostSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = categoryPostSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Category name is required');
    }
  });

  it('description is optional', () => {
    const result = categoryPostSchema.safeParse({ name: 'Gear' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('position accepts number value', () => {
    const result = categoryPostSchema.safeParse({ name: 'Gear', position: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBe(5);
    }
  });

  it('strips unknown fields', () => {
    const result = categoryPostSchema.safeParse({
      name: 'Gear',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('categoryPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = categoryPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update', () => {
    const result = categoryPutSchema.safeParse({
      name: 'Updated Category',
      position: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts name only', () => {
    const result = categoryPutSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts active value', () => {
    const result = categoryPutSchema.safeParse({ active: 0 });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = categoryPutSchema.safeParse({
      name: 'Category',
      hack: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// LEAD SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('leadPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all fields', () => {
    const result = leadPostSchema.safeParse({
      name: 'John Doe',
      email: 'john@test.com',
      phone: '+201234567890',
      subject: 'Inquiry',
      message: 'I want to book a camp',
      source: 'website',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = leadPostSchema.safeParse({ email: 'john@test.com' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = leadPostSchema.safeParse({ name: '', email: 'john@test.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects missing email', () => {
    const result = leadPostSchema.safeParse({ name: 'John' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'not-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Valid email is required');
    }
  });

  it('phone is optional', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it('subject is optional', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBeUndefined();
    }
  });

  it('message is optional', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = leadPostSchema.safeParse({
      name: 'John',
      email: 'john@test.com',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('leadPutSchema', () => {
  it('accepts valid status: new', () => {
    const result = leadPutSchema.safeParse({ status: 'new' });
    expect(result.success).toBe(true);
  });

  it('accepts valid status: contacted', () => {
    const result = leadPutSchema.safeParse({ status: 'contacted' });
    expect(result.success).toBe(true);
  });

  it('accepts valid status: converted', () => {
    const result = leadPutSchema.safeParse({ status: 'converted' });
    expect(result.success).toBe(true);
  });

  it('accepts valid status: archived', () => {
    const result = leadPutSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = leadPutSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = leadPutSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('invalid_type');
    }
  });

  it('strips unknown fields', () => {
    const result = leadPutSchema.safeParse({
      status: 'new',
      extra: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extra).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// MEAL CATEGORY SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('mealCategoryPostSchema', () => {
  it('accepts valid input', () => {
    const result = mealCategoryPostSchema.safeParse({ name: 'Breakfast' });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with position', () => {
    const result = mealCategoryPostSchema.safeParse({
      name: 'Lunch',
      position: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = mealCategoryPostSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = mealCategoryPostSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Meal category name is required');
    }
  });

  it('position is optional', () => {
    const result = mealCategoryPostSchema.safeParse({ name: 'Dinner' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = mealCategoryPostSchema.safeParse({
      name: 'Snacks',
      hack: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

describe('mealCategoryPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = mealCategoryPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts name update', () => {
    const result = mealCategoryPutSchema.safeParse({ name: 'Updated Category' });
    expect(result.success).toBe(true);
  });

  it('accepts position update', () => {
    const result = mealCategoryPutSchema.safeParse({ position: 3 });
    expect(result.success).toBe(true);
  });

  it('accepts both name and position', () => {
    const result = mealCategoryPutSchema.safeParse({
      name: 'Desserts',
      position: 5,
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = mealCategoryPutSchema.safeParse({
      name: 'Category',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// MEAL SCHEDULE SCHEMA
// ══════════════════════════════════════════════════════════════

describe('schedulePostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all fields', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      package_type: 'full_board',
      max_servings: 50,
    });
    expect(result.success).toBe(true);
  });

  it('applies default package_type = all', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.package_type).toBe('all');
    }
  });

  it('applies default max_servings = 100', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_servings).toBe(100);
    }
  });

  it('rejects missing camp_id', () => {
    const result = schedulePostSchema.safeParse({
      date: '2026-08-01',
      meal_id: 'm1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty camp_id', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: '',
      date: '2026-08-01',
      meal_id: 'm1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Camp ID is required');
    }
  });

  it('rejects invalid date format', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '08-01-2026',
      meal_id: 'm1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Date must be YYYY-MM-DD');
    }
  });

  it('rejects non-date string', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: 'not-a-date',
      meal_id: 'm1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Date must be YYYY-MM-DD');
    }
  });

  it('rejects missing date', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      meal_id: 'm1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing meal_id', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty meal_id', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Meal ID is required');
    }
  });

  it('accepts package_type = all', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      package_type: 'all',
    });
    expect(result.success).toBe(true);
  });

  it('accepts package_type = full_board', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      package_type: 'full_board',
    });
    expect(result.success).toBe(true);
  });

  it('accepts package_type = half_board', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      package_type: 'half_board',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid package_type', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      package_type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative max_servings', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      max_servings: -5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts max_servings = 0', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      max_servings: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer max_servings', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      max_servings: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = schedulePostSchema.safeParse({
      camp_id: 'c1',
      date: '2026-08-01',
      meal_id: 'm1',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// PLAN SCHEMAS (others.js)
// ══════════════════════════════════════════════════════════════

describe('planPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = planPostSchema.safeParse({
      name: 'Morning Hike',
      camp_id: 'c1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all fields', () => {
    const result = planPostSchema.safeParse({
      name: 'Morning Hike',
      description: 'A hike up the mountain',
      camp_id: 'c1',
      date: '2026-08-01',
      time: '08:00',
      capacity: 20,
      status: 'planned',
      category: 'adventure',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = planPostSchema.safeParse({ camp_id: 'c1' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = planPostSchema.safeParse({ name: '', camp_id: 'c1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects missing camp_id', () => {
    const result = planPostSchema.safeParse({ name: 'Activity' });
    expect(result.success).toBe(false);
  });

  it('rejects empty camp_id', () => {
    const result = planPostSchema.safeParse({ name: 'Activity', camp_id: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Camp ID is required');
    }
  });

  it('rejects capacity < 1', () => {
    const result = planPostSchema.safeParse({
      name: 'Activity',
      camp_id: 'c1',
      capacity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative capacity', () => {
    const result = planPostSchema.safeParse({
      name: 'Activity',
      camp_id: 'c1',
      capacity: -5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts capacity = 1', () => {
    const result = planPostSchema.safeParse({
      name: 'Activity',
      camp_id: 'c1',
      capacity: 1,
    });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = planPostSchema.safeParse({
      name: 'Activity',
      camp_id: 'c1',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('planPutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = planPutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update', () => {
    const result = planPutSchema.safeParse({
      name: 'Updated Activity',
      status: 'completed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects name = empty string', () => {
    const result = planPutSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects capacity = 0', () => {
    const result = planPutSchema.safeParse({ capacity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative capacity', () => {
    const result = planPutSchema.safeParse({ capacity: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts camp_id update', () => {
    const result = planPutSchema.safeParse({ camp_id: 'c2' });
    expect(result.success).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = planPutSchema.safeParse({
      name: 'Activity',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// TENANT SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('tenantPostSchema', () => {
  it('accepts valid minimal input', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Test Camp',
      subdomain: 'test-camp',
      admin_password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all fields', () => {
    const result = tenantPostSchema.safeParse({
      id: 'tenant_custom',
      name: 'Test Camp',
      subdomain: 'test-camp',
      custom_domain: 'testcamp.com',
      logo_url: 'https://example.com/logo.png',
      favicon_url: 'https://example.com/favicon.ico',
      primary_color: '#ff0000',
      footer_text: 'All rights reserved',
      location: 'Sinai, Egypt',
      whatsapp_number: '+201234567890',
      phone: '+201234567890',
      email: 'info@testcamp.com',
      description: 'A beautiful camp',
      hero_image_url: 'https://example.com/hero.jpg',
      gallery_images: 'https://example.com/g1.jpg',
      about_text: 'About us',
      faq_items: 'FAQ here',
      reviews: 'Great camp!',
      map_embed_url: 'https://maps.example.com',
      activities: 'hiking, swimming',
      capacity: 100,
      currency: 'USD',
      admin_email: 'admin@testcamp.com',
      admin_first_name: 'Admin',
      admin_last_name: 'User',
      admin_password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = tenantPostSchema.safeParse({
      subdomain: 'test',
      admin_password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = tenantPostSchema.safeParse({
      name: '',
      subdomain: 'test',
      admin_password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Name is required');
    }
  });

  it('rejects missing subdomain', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Test Camp',
      admin_password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty subdomain', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Test Camp',
      subdomain: '',
      admin_password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Subdomain is required');
    }
  });

  it('rejects missing admin_password', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Test Camp',
      subdomain: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty admin_password', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Test Camp',
      subdomain: 'test',
      admin_password: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Admin password is required');
    }
  });

  it('all other fields are optional', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Camp',
      subdomain: 'camp',
      admin_password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.custom_domain).toBeUndefined();
      expect(result.data.logo_url).toBeUndefined();
      expect(result.data.capacity).toBeUndefined();
      expect(result.data.currency).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = tenantPostSchema.safeParse({
      name: 'Camp',
      subdomain: 'camp',
      admin_password: 'password123',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

describe('tenantMePutSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = tenantMePutSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid partial update', () => {
    const result = tenantMePutSchema.safeParse({
      name: 'Updated Camp',
      location: 'New Location',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all fields', () => {
    const result = tenantMePutSchema.safeParse({
      name: 'Camp',
      logo_url: 'https://example.com/logo.png',
      favicon_url: 'https://example.com/favicon.ico',
      primary_color: '#ff0000',
      footer_text: 'Footer',
      location: 'Sinai',
      whatsapp_number: '+201234567890',
      phone: '+201234567890',
      email: 'camp@test.com',
      description: 'A camp',
      hero_image_url: 'https://example.com/hero.jpg',
      gallery_images: 'https://example.com/g1.jpg',
      about_text: 'About',
      faq_items: 'FAQ',
      reviews: 'Reviews',
      map_embed_url: 'https://maps.example.com',
      activities: 'hiking',
      capacity: 50,
      currency: 'EGP',
      admin_email: 'admin@camp.com',
      admin_first_name: 'Admin',
      admin_last_name: 'User',
      admin_password: 'newpass123',
      admin_id: 'adm_123',
    });
    expect(result.success).toBe(true);
  });

  it('admin_password is optional (unlike tenantPostSchema)', () => {
    const result = tenantMePutSchema.safeParse({
      name: 'Camp',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.admin_password).toBeUndefined();
    }
  });

  it('admin_id is optional', () => {
    const result = tenantMePutSchema.safeParse({
      name: 'Camp',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.admin_id).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = tenantMePutSchema.safeParse({
      name: 'Camp',
      evil: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evil).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// PAYMENT SCHEMAS
// ══════════════════════════════════════════════════════════════

describe('paymentIntentSchema', () => {
  it('accepts valid input', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 500,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with currency', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 500,
      currency: 'USD',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing orderId', () => {
    const result = paymentIntentSchema.safeParse({ amount: 500 });
    expect(result.success).toBe(false);
  });

  it('rejects empty orderId', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: '',
      amount: 500,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Order ID is required');
    }
  });

  it('rejects missing amount', () => {
    const result = paymentIntentSchema.safeParse({ orderId: 'ord_123' });
    expect(result.success).toBe(false);
  });

  it('rejects amount = 0', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Amount must be positive');
    }
  });

  it('rejects negative amount', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it('accepts small positive amount', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 0.01,
    });
    expect(result.success).toBe(true);
  });

  it('currency is optional', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBeUndefined();
    }
  });

  it('strips unknown fields', () => {
    const result = paymentIntentSchema.safeParse({
      orderId: 'ord_123',
      amount: 100,
      hack: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hack).toBeUndefined();
    }
  });
});

describe('confirmPaymentSchema', () => {
  it('accepts valid input', () => {
    const result = confirmPaymentSchema.safeParse({
      paymentIntentId: 'pi_mock_123',
      orderId: 'ord_123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing paymentIntentId', () => {
    const result = confirmPaymentSchema.safeParse({
      orderId: 'ord_123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty paymentIntentId', () => {
    const result = confirmPaymentSchema.safeParse({
      paymentIntentId: '',
      orderId: 'ord_123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Payment intent ID is required');
    }
  });

  it('rejects missing orderId', () => {
    const result = confirmPaymentSchema.safeParse({
      paymentIntentId: 'pi_mock_123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty orderId', () => {
    const result = confirmPaymentSchema.safeParse({
      paymentIntentId: 'pi_mock_123',
      orderId: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Order ID is required');
    }
  });

  it('strips unknown fields', () => {
    const result = confirmPaymentSchema.safeParse({
      paymentIntentId: 'pi_mock_123',
      orderId: 'ord_123',
      extra: 'data',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extra).toBeUndefined();
    }
  });
});
