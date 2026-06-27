import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  tenant?: { id: string; firstName: string; lastName?: string };
  amountPaise: number;
  amountPaidPaise: number;
  dueDate: string;
  billingDate: string;
  type: 'RENT' | 'SECURITY_DEPOSIT' | 'OTHER';
  status: 'DRAFT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  description?: string;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName?: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  partiallyPaidInvoices: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  partiallyPaidAmount: number;
}

const STATUS_OPTIONS = ['PENDING', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'];
const TYPE_OPTIONS = ['RENT', 'SECURITY_DEPOSIT', 'OTHER'];

const Invoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Invoice | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [statsDateRange, setStatsDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const [form, setForm] = useState({
    tenantId: '',
    amount: '',
    type: 'RENT',
    dueDate: '',
    billingDate: '',
    description: '',
  });

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (tenantFilter) params.tenantId = tenantFilter;
      const res = await api.get('/invoices', { params });
      setInvoices(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, tenantFilter]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await api.get('/tenants', { params: { limit: 100 } });
      setTenants(res.data?.data || []);
    } catch {
      // tenants list optional
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/invoices/stats', { params: statsDateRange });
      setStats(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load stats');
    }
  }, [statsDateRange]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (showStats) fetchStats();
  }, [showStats, fetchStats]);

  const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-green-100 text-green-800';
      case 'PARTIALLY_PAID': return 'bg-blue-100 text-blue-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE': return 'bg-red-100 text-red-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const resetForm = () => {
    setForm({ tenantId: '', amount: '', type: 'RENT', dueDate: '', billingDate: '', description: '' });
    setEditing(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (invoice: Invoice) => {
    setEditing(invoice);
    setForm({
      tenantId: invoice.tenantId,
      amount: (invoice.amountPaise / 100).toString(), // Convert paise to rupees
      type: invoice.type,
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : '',
      billingDate: invoice.billingDate ? new Date(invoice.billingDate).toISOString().slice(0, 10) : '',
      description: invoice.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: any = {
      tenantId: form.tenantId,
      amount: parseFloat(form.amount), // Convert string to number (rupees)
      type: form.type,
      dueDate: form.dueDate,
      description: form.description || undefined,
    };
    if (form.billingDate) payload.billingDate = form.billingDate;

    try {
      if (editing) {
        const updatePayload: any = {
          amount: parseFloat(form.amount), // Convert string to number (rupees)
          type: form.type,
          dueDate: form.dueDate,
          description: form.description || undefined,
        };
        if (form.billingDate) updatePayload.billingDate = form.billingDate;
        await api.put(`/invoices/${editing.id}`, updatePayload);
        setSuccess('Invoice updated successfully');
      } else {
        await api.post('/invoices', payload);
        setSuccess('Invoice created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchInvoices();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save invoice');
    }
  };

  const handleDelete = async (invoice: Invoice) => {
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/invoices/${invoice.id}`);
      setSuccess('Invoice deleted successfully');
      setShowDeleteConfirm(null);
      fetchInvoices();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      const response = await api.get(`/pdf/invoice/${invoice.id}`, {
        responseType: 'blob',
      });
      
      // Create a blob URL and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download PDF');
    }
  };

  const handleMarkOverdue = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post('/invoices/mark-overdue');
      setSuccess(`Marked ${res.data?.marked || 0} invoices as overdue, sent ${res.data?.emailed || 0} reminder emails`);
      fetchInvoices();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to mark overdue invoices');
    }
  };

  const canEdit = (status: string) => status === 'PENDING' || status === 'OVERDUE' || status === 'DRAFT';
  const canDelete = (status: string) => status !== 'PAID' && status !== 'PARTIALLY_PAID';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Invoice Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {showStats ? 'Hide Stats' : 'View Stats'}
          </button>
          <button
            onClick={handleMarkOverdue}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            Mark Overdue
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Invoice
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {showStats && stats && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Invoice Statistics</h3>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={statsDateRange.startDate}
                onChange={(e) => setStatsDateRange({ ...statsDateRange, startDate: e.target.value })}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={statsDateRange.endDate}
                onChange={(e) => setStatsDateRange({ ...statsDateRange, endDate: e.target.value })}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <button
                onClick={() => {
                  if (new Date(statsDateRange.endDate) < new Date(statsDateRange.startDate)) {
                    setError('End date must be after start date');
                    return;
                  }
                  fetchStats();
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded p-4">
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold">{stats.totalInvoices}</p>
              <p className="text-xs text-gray-500">{formatRupees(stats.totalAmount)}</p>
            </div>
            <div className="bg-green-50 rounded p-4">
              <p className="text-sm text-green-600">Paid</p>
              <p className="text-2xl font-bold text-green-700">{stats.paidInvoices}</p>
              <p className="text-xs text-green-500">{formatRupees(stats.paidAmount)}</p>
            </div>
            <div className="bg-yellow-50 rounded p-4">
              <p className="text-sm text-yellow-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pendingInvoices}</p>
              <p className="text-xs text-yellow-500">{formatRupees(stats.pendingAmount)}</p>
            </div>
            <div className="bg-red-50 rounded p-4">
              <p className="text-sm text-red-600">Overdue</p>
              <p className="text-2xl font-bold text-red-700">{stats.overdueInvoices}</p>
              <p className="text-xs text-red-500">{formatRupees(stats.overdueAmount)}</p>
            </div>
            <div className="bg-blue-50 rounded p-4">
              <p className="text-sm text-blue-600">Partially Paid</p>
              <p className="text-2xl font-bold text-blue-700">{stats.partiallyPaidInvoices}</p>
              <p className="text-xs text-blue-500">{formatRupees(stats.partiallyPaidAmount)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tenant</label>
              <select
                value={tenantFilter}
                onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[200px]"
              >
                <option value="">All Tenants</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName || ''}
                  </option>
                ))}
              </select>
            </div>
            {(statusFilter || tenantFilter) && (
              <button
                onClick={() => { setStatusFilter(''); setTenantFilter(''); setPage(1); }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 self-end"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : invoices.length === 0 ? (
            <p className="text-gray-500">No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoices.map((i) => (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-sm">{i.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {i.tenant ? `${i.tenant.firstName} ${i.tenant.lastName || ''}` : i.tenantId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{i.type}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatRupees(i.amountPaise)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatRupees(i.amountPaidPaise || 0)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {(() => {
                          const date = new Date(i.dueDate);
                          return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {i.billingDate ? (() => {
                          const date = new Date(i.billingDate);
                          return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
                        })() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(i.status)}`}>
                          {i.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDownloadPDF(i)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                            title="Download PDF"
                          >
                            PDF
                          </button>
                          {canEdit(i.status) && (
                            <button
                              onClick={() => openEditModal(i)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete(i.status) && (
                            <button
                              onClick={() => setShowDeleteConfirm(i)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                Page {meta.page} of {meta.totalPages} ({meta.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-white border border-gray-300 rounded disabled:bg-gray-100"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                  className="px-3 py-1 bg-white border border-gray-300 rounded disabled:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
            <h3 className="text-lg font-semibold mb-4">
              {editing ? 'Edit Invoice' : 'Create Invoice'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenant *</label>
                  <select
                    required
                    value={form.tenantId}
                    onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select a tenant</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName || ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    placeholder="Amount in rupees"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing Date</label>
                  <input
                    type="date"
                    value={form.billingDate}
                    onChange={(e) => setForm({ ...form, billingDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Invoice?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete invoice <strong>{showDeleteConfirm.invoiceNumber}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;