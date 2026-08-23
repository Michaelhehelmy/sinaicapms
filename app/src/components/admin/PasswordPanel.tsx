import React, { useState } from 'react';
import { useChangePasswordMutation } from '@/hooks/useQueryHooks';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function PasswordPanel() {
  const changePassword = useChangePasswordMutation();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.currentPassword) {
      errs.currentPassword = 'Current password is required';
    }
    if (!form.newPassword) {
      errs.newPassword = 'New password is required';
    } else if (form.newPassword.length < 8) {
      errs.newPassword = 'Password must be at least 8 characters';
    }
    if (form.newPassword !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await changePassword.mutateAsync({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setErrors({});
    } catch {
      // Error toast handled by useChangePasswordMutation hook
    }
  };

  return (
    <div data-testid="password-section">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Change Password</h2>

      <Card data-testid="password-form" padding="md">
        <div className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            error={errors.currentPassword}
            autoComplete="current-password"
          />

          <Input
            label="New Password"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            error={errors.newPassword}
            helperText={!errors.newPassword ? 'Must be at least 8 characters' : undefined}
            autoComplete="new-password"
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <div className="pt-2">
            <Button
              variant="success"
              size="md"
              loading={changePassword.isPending}
              onClick={handleSubmit}
            >
              Change Password
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
