import React, { useState, useCallback } from 'react';
import * as api from '@/lib/api';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  useHrEmployeesQuery,
  useHrLeaveTypesQuery,
  useHrLeaveRequestsQuery,
  useHrPayrollRunsQuery,
  useHrJobPostsQuery,
  queryKeys,
} from '@/hooks/useQueryHooks';

type Tab = 'employees' | 'leave-types' | 'leave-requests' | 'payroll' | 'recruitment';

// ─── Employee Form ─────────────────────────────────────────────────────────
interface EmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hireDate: string;
  department: string;
  position: string;
  salaryType: string;
  salaryAmount: string;
  currency: string;
  bankAccount: string;
  taxId: string;
}

const emptyEmployeeForm: EmployeeForm = {
  firstName: '', lastName: '', email: '', phone: '', hireDate: '',
  department: '', position: '', salaryType: 'monthly', salaryAmount: '',
  currency: 'USD', bankAccount: '', taxId: '',
};

// ─── Leave Type Form ───────────────────────────────────────────────────────
interface LeaveTypeForm {
  name: string;
  accrualRate: string;
  isPaid: boolean;
}

const emptyLeaveTypeForm: LeaveTypeForm = { name: '', accrualRate: '', isPaid: true };

// ─── Leave Request Form ────────────────────────────────────────────────────
interface LeaveRequestForm {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: string;
  notes: string;
}

const emptyLeaveRequestForm: LeaveRequestForm = {
  employeeId: '', leaveTypeId: '', startDate: '', endDate: '', days: '', notes: '',
};

// ─── Job Post Form ─────────────────────────────────────────────────────────
interface JobPostForm {
  title: string;
  description: string;
  department: string;
  location: string;
}

const emptyJobPostForm: JobPostForm = { title: '', description: '', department: '', location: '' };

// ─── Applicant Form ────────────────────────────────────────────────────────
interface ApplicantForm {
  jobPostId: string;
  name: string;
  email: string;
  phone: string;
}

const emptyApplicantForm: ApplicantForm = { jobPostId: '', name: '', email: '', phone: '' };

const SALARY_TYPE_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
];

const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'terminated', label: 'Terminated' },
];

const PAYROLL_STATUS_MAP: Record<string, { text: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  draft: { text: 'Draft', variant: 'warning' },
  processing: { text: 'Processing', variant: 'info' },
  completed: { text: 'Completed', variant: 'success' },
  posted: { text: 'Posted', variant: 'info' },
};

const LEAVE_STATUS_MAP: Record<string, { text: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { text: 'Pending', variant: 'warning' },
  approved: { text: 'Approved', variant: 'success' },
  rejected: { text: 'Rejected', variant: 'danger' },
  canceled: { text: 'Canceled', variant: 'neutral' },
};

export default function HRPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('employees');
  const [saving, setSaving] = useState(false);

  // TanStack Query hooks
  const employeesQuery = useHrEmployeesQuery();
  const leaveTypesQuery = useHrLeaveTypesQuery();
  const leaveRequestsQuery = useHrLeaveRequestsQuery();
  const payrollRunsQuery = useHrPayrollRunsQuery();
  const jobPostsQuery = useHrJobPostsQuery();

  const employees = (employeesQuery.data as any[]) || [];
  const leaveTypes = (leaveTypesQuery.data as any[]) || [];
  const leaveRequests = (leaveRequestsQuery.data as any[]) || [];
  const payrollRuns = (payrollRunsQuery.data as any[]) || [];
  const jobPosts = (jobPostsQuery.data as any[]) || [];
  const loading = employeesQuery.isLoading || leaveTypesQuery.isLoading || leaveRequestsQuery.isLoading || payrollRunsQuery.isLoading || jobPostsQuery.isLoading;

  const invalidateHr = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'hr'] });
  }, [queryClient]);

  // Modals
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);

  const [showLeaveTypeForm, setShowLeaveTypeForm] = useState(false);
  const [leaveTypeForm, setLeaveTypeForm] = useState<LeaveTypeForm>(emptyLeaveTypeForm);

  const [showLeaveRequestForm, setShowLeaveRequestForm] = useState(false);
  const [leaveRequestForm, setLeaveRequestForm] = useState<LeaveRequestForm>(emptyLeaveRequestForm);

  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [payrollPeriodStart, setPayrollPeriodStart] = useState('');
  const [payrollPeriodEnd, setPayrollPeriodEnd] = useState('');

  const [showJobPostForm, setShowJobPostForm] = useState(false);
  const [jobPostForm, setJobPostForm] = useState<JobPostForm>(emptyJobPostForm);

  const [showApplicantForm, setShowApplicantForm] = useState(false);
  const [applicantForm, setApplicantForm] = useState<ApplicantForm>(emptyApplicantForm);

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; item: any } | null>(null);

  // ── Employee handlers ────────────────────────────────────────────────────
  const openAddEmployee = useCallback(() => { setEditingEmployeeId(null); setEmployeeForm(emptyEmployeeForm); setShowEmployeeForm(true); }, []);
  const openEditEmployee = useCallback((emp: any) => {
    setEditingEmployeeId(emp.id);
    setEmployeeForm({
      firstName: emp.firstName || emp.first_name || '',
      lastName: emp.lastName || emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      hireDate: emp.hireDate || emp.hire_date || '',
      department: emp.department || '',
      position: emp.position || '',
      salaryType: emp.salaryType || emp.salary_type || 'monthly',
      salaryAmount: String(emp.salaryAmount || emp.salary_amount || ''),
      currency: emp.currency || 'USD',
      bankAccount: emp.bankAccount || emp.bank_account || '',
      taxId: emp.taxId || emp.tax_id || '',
    });
    setShowEmployeeForm(true);
  }, []);

  const handleSaveEmployee = useCallback(async () => {
    if (!employeeForm.firstName.trim() || !employeeForm.lastName.trim()) { showToast('Name is required.', 'warning'); return; }
    if (!employeeForm.email.trim()) { showToast('Email is required.', 'warning'); return; }
    if (!employeeForm.hireDate) { showToast('Hire date is required.', 'warning'); return; }
    setSaving(true);
    try {
      const payload = {
        firstName: employeeForm.firstName.trim(),
        lastName: employeeForm.lastName.trim(),
        email: employeeForm.email.trim(),
        phone: employeeForm.phone || undefined,
        hireDate: employeeForm.hireDate,
        department: employeeForm.department || undefined,
        position: employeeForm.position || undefined,
        salaryType: employeeForm.salaryType as any,
        salaryAmount: parseFloat(employeeForm.salaryAmount) || 0,
        currency: employeeForm.currency,
        bankAccount: employeeForm.bankAccount || undefined,
        taxId: employeeForm.taxId || undefined,
      };
      if (editingEmployeeId) {
        await api.updateHrEmployee(editingEmployeeId, payload);
      } else {
        await api.createHrEmployee(payload);
      }
      showToast(editingEmployeeId ? 'Employee updated.' : 'Employee created.', 'success');
      setShowEmployeeForm(false);
      setEditingEmployeeId(null);
      setEmployeeForm(emptyEmployeeForm);
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [employeeForm, editingEmployeeId, showToast, invalidateHr]);

  // ── Leave Type handlers ──────────────────────────────────────────────────
  const handleSaveLeaveType = useCallback(async () => {
    if (!leaveTypeForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.createHrLeaveType({
        name: leaveTypeForm.name.trim(),
        accrualRate: parseFloat(leaveTypeForm.accrualRate) || 0,
        isPaid: leaveTypeForm.isPaid,
      });
      showToast('Leave type created.', 'success');
      setShowLeaveTypeForm(false);
      setLeaveTypeForm(emptyLeaveTypeForm);
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [leaveTypeForm, showToast, invalidateHr]);

  // ── Leave Request handlers ───────────────────────────────────────────────
  const handleSaveLeaveRequest = useCallback(async () => {
    if (!leaveRequestForm.employeeId || !leaveRequestForm.leaveTypeId) { showToast('Employee and leave type are required.', 'warning'); return; }
    if (!leaveRequestForm.startDate || !leaveRequestForm.endDate) { showToast('Start and end dates are required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.createHrLeaveRequest({
        employeeId: leaveRequestForm.employeeId,
        leaveTypeId: leaveRequestForm.leaveTypeId,
        startDate: leaveRequestForm.startDate,
        endDate: leaveRequestForm.endDate,
        days: parseFloat(leaveRequestForm.days) || 1,
        notes: leaveRequestForm.notes || undefined,
      });
      showToast('Leave request submitted.', 'success');
      setShowLeaveRequestForm(false);
      setLeaveRequestForm(emptyLeaveRequestForm);
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [leaveRequestForm, showToast, invalidateHr]);

  const handleApproveReject = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.approveHrLeaveRequest(id, status);
      showToast(`Leave request ${status}.`, 'success');
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, invalidateHr]);

  // ── Payroll handlers ─────────────────────────────────────────────────────
  const handleCreatePayrollRun = useCallback(async () => {
    if (!payrollPeriodStart || !payrollPeriodEnd) { showToast('Period dates are required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.createHrPayrollRun({ periodStart: payrollPeriodStart, periodEnd: payrollPeriodEnd });
      showToast('Payroll run created.', 'success');
      setShowPayrollForm(false);
      setPayrollPeriodStart('');
      setPayrollPeriodEnd('');
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [payrollPeriodStart, payrollPeriodEnd, showToast, invalidateHr]);

  // ── Payslip download ───────────────────────────────────────────────────
  const handleDownloadPayslip = useCallback((pr: any) => {
    const periodStart = pr.periodStart || pr.period_start || '';
    const periodEnd = pr.periodEnd || pr.period_end || '';
    const totalGross = pr.totalGross || pr.total_gross || 0;
    const totalDeductions = pr.totalDeductions || pr.total_deductions || 0;
    const totalNet = pr.totalNet || pr.total_net || 0;
    const status = pr.status || 'draft';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip ${periodStart} to ${periodEnd}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 40px; color: #1a1a1a; }
  .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { font-size: 24px; color: #1e40af; margin-bottom: 4px; }
  .header p { font-size: 14px; color: #6b7280; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
  .label { font-weight: 600; color: #374151; min-width: 200px; }
  .value { color: #111827; }
  .section { margin-top: 24px; }
  .section h2 { font-size: 16px; color: #1e40af; border-bottom: 1px solid #dbeafe; padding-bottom: 6px; margin-bottom: 12px; }
  .total-row { display: flex; justify-content: space-between; padding: 12px 0; font-size: 16px; font-weight: 700; border-top: 2px solid #2563eb; margin-top: 8px; }
  .green { color: #059669; }
  .red { color: #dc2626; }
  .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #9ca3af; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <h1>PAYSLIP</h1>
  <p>Pay Period: ${periodStart} &mdash; ${periodEnd}</p>
</div>
<div class="section">
  <h2>Earnings</h2>
  <div class="row"><span class="label">Gross Pay</span><span class="value">${formatCurrency(totalGross)}</span></div>
</div>
<div class="section">
  <h2>Deductions</h2>
  <div class="row"><span class="label">Total Deductions</span><span class="value red">${formatCurrency(totalDeductions)}</span></div>
</div>
<div class="total-row">
  <span>Net Pay</span>
  <span class="green">${formatCurrency(totalNet)}</span>
</div>
<div class="section">
  <div class="row"><span class="label">Status</span><span class="value">${status}</span></div>
</div>
<div class="footer">
  <p>Generated by SinaiCamps HR &mdash; ${new Date().toLocaleDateString()}</p>
</div>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 300);
    }
  }, []);

  // ── Job Post handlers ────────────────────────────────────────────────────
  const handleSaveJobPost = useCallback(async () => {
    if (!jobPostForm.title.trim()) { showToast('Title is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.createHrJobPost({
        title: jobPostForm.title.trim(),
        description: jobPostForm.description || undefined,
        department: jobPostForm.department || undefined,
        location: jobPostForm.location || undefined,
      });
      showToast('Job post created.', 'success');
      setShowJobPostForm(false);
      setJobPostForm(emptyJobPostForm);
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [jobPostForm, showToast, invalidateHr]);

  // ── Applicant handlers ───────────────────────────────────────────────────
  const handleSaveApplicant = useCallback(async () => {
    if (!applicantForm.jobPostId || !applicantForm.name.trim() || !applicantForm.email.trim()) {
      showToast('Job, name, and email are required.', 'warning'); return;
    }
    setSaving(true);
    try {
      await api.createHrApplicant({
        jobPostId: applicantForm.jobPostId,
        name: applicantForm.name.trim(),
        email: applicantForm.email.trim(),
        phone: applicantForm.phone || undefined,
      });
      showToast('Application submitted.', 'success');
      setShowApplicantForm(false);
      setApplicantForm(emptyApplicantForm);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [applicantForm, showToast]);

  // ── Delete handler ───────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'employee') {
        await api.deleteHrEmployee(deleteTarget.item.id);
      }
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
      invalidateHr();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, invalidateHr]);

  if (loading) return <LoadingSpinner text="Loading HR data..." />;

  return (
    <Card padding="none" className="p-6" data-testid="hr-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">HR & Payroll</h2>
        {tab === 'employees' && <Button variant="success" size="md" onClick={openAddEmployee} data-testid="add-employee-btn">Add Employee</Button>}
        {tab === 'leave-types' && <Button variant="success" size="md" onClick={() => { setLeaveTypeForm(emptyLeaveTypeForm); setShowLeaveTypeForm(true); }} data-testid="add-leave-type-btn">Add Leave Type</Button>}
        {tab === 'leave-requests' && <Button variant="success" size="md" onClick={() => { setLeaveRequestForm(emptyLeaveRequestForm); setShowLeaveRequestForm(true); }} data-testid="add-leave-request-btn">New Request</Button>}
        {tab === 'payroll' && <Button variant="success" size="md" onClick={() => setShowPayrollForm(true)} data-testid="create-payroll-btn">Create Payroll Run</Button>}
        {tab === 'recruitment' && <Button variant="success" size="md" onClick={() => { setJobPostForm(emptyJobPostForm); setShowJobPostForm(true); }} data-testid="add-job-post-btn">New Job Post</Button>}
      </div>
      <p className="text-sm text-gray-500 mb-4">Manage employees, leave, payroll, and recruitment.</p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {(['employees', 'leave-types', 'leave-requests', 'payroll', 'recruitment'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}
          >
            {t === 'leave-types' ? 'Leave Types' : t === 'leave-requests' ? `Leave Requests (${leaveRequests.length})` : t === 'payroll' ? 'Payroll' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Employees Tab ──────────────────────────────────────── */}
      {tab === 'employees' && (
        employees.length === 0 ? (
          <EmptyState title="No employees" description="Add your first employee to get started." action={{ label: 'Add Employee', onClick: openAddEmployee }} />
        ) : (
          <DataTable
            columns={[
              { key: 'first_name', header: 'Name', sortable: true, render: (e: any) => <strong className="text-gray-900">{e.firstName || e.first_name} {e.lastName || e.last_name}</strong> },
              { key: 'email', header: 'Email', render: (e: any) => <span className="text-sm text-gray-600">{e.email}</span> },
              { key: 'department', header: 'Department', render: (e: any) => <span className="text-sm text-gray-600">{e.department || '-'}</span> },
              { key: 'position', header: 'Position', render: (e: any) => <span className="text-sm text-gray-600">{e.position || '-'}</span> },
              { key: 'status', header: 'Status', render: (e: any) => <Badge variant={e.status === 'active' ? 'success' : e.status === 'on_leave' ? 'warning' : 'danger'} dot size="sm">{e.status}</Badge> },
              { key: 'salary_amount', header: 'Salary', render: (e: any) => <span className="font-medium">{formatCurrency(e.salaryAmount || e.salary_amount || 0)}</span> },
            ]}
            data={employees}
            emptyMessage="No employees."
            actions={(e: any) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditEmployee(e)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'employee', item: e })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Leave Types Tab ────────────────────────────────────── */}
      {tab === 'leave-types' && (
        leaveTypes.length === 0 ? (
          <EmptyState title="No leave types" description="Create leave types (e.g. Vacation, Sick Leave)." action={{ label: 'Add Leave Type', onClick: () => { setLeaveTypeForm(emptyLeaveTypeForm); setShowLeaveTypeForm(true); } }} />
        ) : (
          <DataTable
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (lt: any) => <strong className="text-gray-900">{lt.name}</strong> },
              { key: 'accrual_rate', header: 'Accrual Rate', render: (lt: any) => <span className="text-sm text-gray-600">{lt.accrualRate ?? lt.accrual_rate ?? 0} days/year</span> },
              { key: 'is_paid', header: 'Paid', render: (lt: any) => <Badge variant={Number(lt.isPaid ?? lt.is_paid) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(lt.isPaid ?? lt.is_paid) === 1 ? 'Yes' : 'No'}</Badge> },
            ]}
            data={leaveTypes}
            emptyMessage="No leave types."
          />
        )
      )}

      {/* ── Leave Requests Tab ─────────────────────────────────── */}
      {tab === 'leave-requests' && (
        leaveRequests.length === 0 ? (
          <EmptyState title="No leave requests" description="Submit a leave request for an employee." action={{ label: 'New Request', onClick: () => { setLeaveRequestForm(emptyLeaveRequestForm); setShowLeaveRequestForm(true); } }} />
        ) : (
          <DataTable
            columns={[
              { key: 'first_name', header: 'Employee', sortable: true, render: (lr: any) => <strong className="text-gray-900">{lr.firstName || lr.first_name} {lr.lastName || lr.last_name}</strong> },
              { key: 'leave_type_name', header: 'Type', render: (lr: any) => <span className="text-sm text-gray-600">{lr.leaveTypeName || lr.leave_type_name || '-'}</span> },
              { key: 'start_date', header: 'Dates', render: (lr: any) => <span className="text-sm text-gray-600">{lr.startDate || lr.start_date} - {lr.endDate || lr.end_date}</span> },
              { key: 'days', header: 'Days', render: (lr: any) => <span className="font-medium">{lr.days}</span> },
              { key: 'status', header: 'Status', render: (lr: any) => { const s = LEAVE_STATUS_MAP[lr.status] || { text: lr.status, variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{s.text}</Badge>; } },
            ]}
            data={leaveRequests}
            emptyMessage="No leave requests."
            actions={(lr: any) => lr.status === 'pending' ? (
              <div className="flex gap-1.5">
                <Button variant="success" size="sm" onClick={() => handleApproveReject(lr.id, 'approved')}>Approve</Button>
                <Button variant="danger" size="sm" onClick={() => handleApproveReject(lr.id, 'rejected')}>Reject</Button>
              </div>
            ) : null}
          />
        )
      )}

      {/* ── Payroll Tab ────────────────────────────────────────── */}
      {tab === 'payroll' && (
        payrollRuns.length === 0 ? (
          <EmptyState title="No payroll runs" description="Create a payroll run for the current period." action={{ label: 'Create Payroll Run', onClick: () => setShowPayrollForm(true) }} />
        ) : (
          <DataTable
            columns={[
              { key: 'period_start', header: 'Period', sortable: true, render: (pr: any) => <span className="text-sm text-gray-900">{pr.periodStart || pr.period_start} - {pr.periodEnd || pr.period_end}</span> },
              { key: 'status', header: 'Status', render: (pr: any) => { const s = PAYROLL_STATUS_MAP[pr.status] || { text: pr.status, variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{s.text}</Badge>; } },
              { key: 'total_gross', header: 'Gross', render: (pr: any) => <span className="font-medium">{formatCurrency(pr.totalGross || pr.total_gross || 0)}</span> },
              { key: 'total_deductions', header: 'Deductions', render: (pr: any) => <span className="font-medium text-red-600">{formatCurrency(pr.totalDeductions || pr.total_deductions || 0)}</span> },
              { key: 'total_net', header: 'Net', render: (pr: any) => <span className="font-medium text-green-600">{formatCurrency(pr.totalNet || pr.total_net || 0)}</span> },
            ]}
            data={payrollRuns}
            emptyMessage="No payroll runs."
            actions={(pr: any) => (
              <Button variant="ghost" size="sm" onClick={() => handleDownloadPayslip(pr)}>Download Payslip</Button>
            )}
          />
        )
      )}

      {/* ── Recruitment Tab ────────────────────────────────────── */}
      {tab === 'recruitment' && (
        jobPosts.length === 0 ? (
          <EmptyState title="No job posts" description="Create a job post to start recruiting." action={{ label: 'New Job Post', onClick: () => { setJobPostForm(emptyJobPostForm); setShowJobPostForm(true); } }} />
        ) : (
          <DataTable
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (jp: any) => <strong className="text-gray-900">{jp.title}</strong> },
              { key: 'department', header: 'Department', render: (jp: any) => <span className="text-sm text-gray-600">{jp.department || '-'}</span> },
              { key: 'location', header: 'Location', render: (jp: any) => <span className="text-sm text-gray-600">{jp.location || '-'}</span> },
              { key: 'status', header: 'Status', render: (jp: any) => <Badge variant={jp.status === 'open' ? 'success' : jp.status === 'filled' ? 'info' : 'neutral'} dot size="sm">{jp.status}</Badge> },
            ]}
            data={jobPosts}
            emptyMessage="No job posts."
            actions={(jp: any) => (
              <Button variant="ghost" size="sm" onClick={() => { setApplicantForm({ ...emptyApplicantForm, jobPostId: jp.id }); setShowApplicantForm(true); }}>Apply</Button>
            )}
          />
        )
      )}

      {/* ── Employee Form Modal ────────────────────────────────── */}
      <FormModal open={showEmployeeForm} title={editingEmployeeId ? 'Edit Employee' : 'Add Employee'} onClose={() => { setShowEmployeeForm(false); setEditingEmployeeId(null); }} onSubmit={handleSaveEmployee} submitLabel={saving ? 'Saving...' : editingEmployeeId ? 'Update' : 'Create'} submitDisabled={saving}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="First Name *" value={employeeForm.firstName} onChange={(e) => setEmployeeForm(p => ({ ...p, firstName: e.target.value }))} />
          <Input label="Last Name *" value={employeeForm.lastName} onChange={(e) => setEmployeeForm(p => ({ ...p, lastName: e.target.value }))} />
          <Input label="Email *" type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="Phone" value={employeeForm.phone} onChange={(e) => setEmployeeForm(p => ({ ...p, phone: e.target.value }))} />
          <Input label="Hire Date *" type="date" value={employeeForm.hireDate} onChange={(e) => setEmployeeForm(p => ({ ...p, hireDate: e.target.value }))} />
          <Input label="Department" value={employeeForm.department} onChange={(e) => setEmployeeForm(p => ({ ...p, department: e.target.value }))} />
          <Input label="Position" value={employeeForm.position} onChange={(e) => setEmployeeForm(p => ({ ...p, position: e.target.value }))} />
          <Select label="Salary Type" options={SALARY_TYPE_OPTIONS} value={employeeForm.salaryType} onChange={(e) => setEmployeeForm(p => ({ ...p, salaryType: e.target.value }))} />
          <Input label="Salary Amount" type="number" value={employeeForm.salaryAmount} onChange={(e) => setEmployeeForm(p => ({ ...p, salaryAmount: e.target.value }))} min="0" step="0.01" />
          <Input label="Currency" value={employeeForm.currency} onChange={(e) => setEmployeeForm(p => ({ ...p, currency: e.target.value }))} />
          <Input label="Bank Account" value={employeeForm.bankAccount} onChange={(e) => setEmployeeForm(p => ({ ...p, bankAccount: e.target.value }))} />
          <Input label="Tax ID" value={employeeForm.taxId} onChange={(e) => setEmployeeForm(p => ({ ...p, taxId: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Leave Type Form Modal ──────────────────────────────── */}
      <FormModal open={showLeaveTypeForm} title="Add Leave Type" onClose={() => setShowLeaveTypeForm(false)} onSubmit={handleSaveLeaveType} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" value={leaveTypeForm.name} onChange={(e) => setLeaveTypeForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Vacation" />
          <Input label="Accrual Rate (days/year)" type="number" value={leaveTypeForm.accrualRate} onChange={(e) => setLeaveTypeForm(p => ({ ...p, accrualRate: e.target.value }))} min="0" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isPaid" checked={leaveTypeForm.isPaid} onChange={(e) => setLeaveTypeForm(p => ({ ...p, isPaid: e.target.checked }))} className="rounded" />
            <label htmlFor="isPaid" className="text-sm text-gray-700">Paid Leave</label>
          </div>
        </div>
      </FormModal>

      {/* ── Leave Request Form Modal ──────────────────────────── */}
      <FormModal open={showLeaveRequestForm} title="New Leave Request" onClose={() => setShowLeaveRequestForm(false)} onSubmit={handleSaveLeaveRequest} submitLabel={saving ? 'Saving...' : 'Submit'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Employee *" options={employees.map(e => ({ value: e.id, label: `${e.firstName || e.first_name} ${e.lastName || e.last_name}` }))} value={leaveRequestForm.employeeId} onChange={(e) => setLeaveRequestForm(p => ({ ...p, employeeId: e.target.value }))} />
          <Select label="Leave Type *" options={leaveTypes.map(lt => ({ value: lt.id, label: lt.name }))} value={leaveRequestForm.leaveTypeId} onChange={(e) => setLeaveRequestForm(p => ({ ...p, leaveTypeId: e.target.value }))} />
          <Input label="Start Date *" type="date" value={leaveRequestForm.startDate} onChange={(e) => setLeaveRequestForm(p => ({ ...p, startDate: e.target.value }))} />
          <Input label="End Date *" type="date" value={leaveRequestForm.endDate} onChange={(e) => setLeaveRequestForm(p => ({ ...p, endDate: e.target.value }))} />
          <Input label="Days" type="number" value={leaveRequestForm.days} onChange={(e) => setLeaveRequestForm(p => ({ ...p, days: e.target.value }))} min="0.5" step="0.5" />
          <Input label="Notes" value={leaveRequestForm.notes} onChange={(e) => setLeaveRequestForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Payroll Run Modal ──────────────────────────────────── */}
      <FormModal open={showPayrollForm} title="Create Payroll Run" onClose={() => setShowPayrollForm(false)} onSubmit={handleCreatePayrollRun} submitLabel={saving ? 'Creating...' : 'Create Run'} submitDisabled={saving}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This will calculate payroll for all active employees based on their salary.</p>
          <Input label="Period Start *" type="date" value={payrollPeriodStart} onChange={(e) => setPayrollPeriodStart(e.target.value)} />
          <Input label="Period End *" type="date" value={payrollPeriodEnd} onChange={(e) => setPayrollPeriodEnd(e.target.value)} />
        </div>
      </FormModal>

      {/* ── Job Post Form Modal ────────────────────────────────── */}
      <FormModal open={showJobPostForm} title="New Job Post" onClose={() => setShowJobPostForm(false)} onSubmit={handleSaveJobPost} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Title *" value={jobPostForm.title} onChange={(e) => setJobPostForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Front Desk Clerk" />
          <Input label="Department" value={jobPostForm.department} onChange={(e) => setJobPostForm(p => ({ ...p, department: e.target.value }))} />
          <Input label="Location" value={jobPostForm.location} onChange={(e) => setJobPostForm(p => ({ ...p, location: e.target.value }))} />
          <Input label="Description" value={jobPostForm.description} onChange={(e) => setJobPostForm(p => ({ ...p, description: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Applicant Form Modal ───────────────────────────────── */}
      <FormModal open={showApplicantForm} title="Submit Application" onClose={() => setShowApplicantForm(false)} onSubmit={handleSaveApplicant} submitLabel={saving ? 'Saving...' : 'Submit'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Job Post *" options={jobPosts.filter(jp => jp.status === 'open').map(jp => ({ value: jp.id, label: jp.title }))} value={applicantForm.jobPostId} onChange={(e) => setApplicantForm(p => ({ ...p, jobPostId: e.target.value }))} />
          <Input label="Name *" value={applicantForm.name} onChange={(e) => setApplicantForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Email *" type="email" value={applicantForm.email} onChange={(e) => setApplicantForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="Phone" value={applicantForm.phone} onChange={(e) => setApplicantForm(p => ({ ...p, phone: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Delete Confirmation ────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'employee' ? 'Employee' : 'Item'}`}
        message={`Are you sure you want to delete "${deleteTarget?.item?.firstName || deleteTarget?.item?.first_name || deleteTarget?.item?.name || ''}"? This will mark them as terminated.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
