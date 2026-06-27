import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Payment {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  invoice?: { id: string; invoiceNumber: string; tenant?: { id: string; firstName: string; lastName?: string } };
  amountPaise: number;
  method: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  transactionId?: string;
  notes?: string;
  paidAt?: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  tenant?: { id: string; firstName: string; lastName?: string };
  amountPaise: number;
  status: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  totalPayments: number;
  totalAmount: number;
  completedPayments: number;
  completedAmount: number;
  pendingPayments: number;
  pendingAmount: number;
}

const STATUS_OPTIONS = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
const METHOD_OPTIONS = ['RAZORPAY', 'CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'RANDOMPAY'];

const Payments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsDateRange, setStatsDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const [form, setForm] = useState({
    invoiceId: '',
    amountPaise: '',
    method: 'CASH',
    transactionId: '',
    notes: '',
  });

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (methodFilter) params.method = methodFilter;
      const res = await api.get('/payments', { params });
      setPayments(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, methodFilter]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await api.get('/invoices', { params: { limit: 100 } });
      setInvoices(res.data?.data || []);
    } catch {
      // invoices list optional
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/payments/stats', { params: statsDateRange });
      setStats(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load stats');
    }
  }, [statsDateRange]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (showStats) fetchStats();
  }, [showStats, fetchStats]);

  const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'REFUNDED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDownloadReceipt = async (payment: Payment) => {
    try {
      const response = await api.get(`/pdf/receipt/${payment.id}`, {
        responseType: 'blob',
      });
      
      // Create a blob URL and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${payment.paymentNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download receipt');
    }
  };

  const resetForm = () => {
    setForm({ invoiceId: '', amountPaise: '', method: 'CASH', transactionId: '', notes: '' });
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    setForm({
      ...form,
      invoiceId,
      amountPaise: inv ? String(inv.amountPaise) : form.amountPaise,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: any = {
      invoiceId: form.invoiceId,
      amountPaise: parseInt(form.amountPaise),
      method: form.method,
    };
    if (form.transactionId) payload.transactionId = form.transactionId;
    if (form.notes) payload.notes = form.notes;

    try {
      await api.post('/payments', payload);
      setSuccess('Payment recorded successfully');
      setShowModal(false);
      resetForm();
      fetchPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record payment');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Payment Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {showStats ? 'Hide Stats' : 'View Stats'}
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Record Payment
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
            <h3 className="text-lg font-semibold">Payment Statistics</h3>
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
                onClick={fetchStats}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded p-4">
              <p className="text-sm text-gray-600">Total Payments</p>
              <p className="text-2xl font-bold">{stats.totalPayments}</p>
              <p className="text-xs text-gray-500">{formatRupees(stats.totalAmount)}</p>
            </div>
            <div className="bg-green-50 rounded p-4">
              <p className="text-sm text-green-600">Completed</p>
              <p className="text-2xl font-bold text-green-700">{stats.completedPayments}</p>
              <p className="text-xs text-green-500">{formatRupees(stats.completedAmount)}</p>
            </div>
            <div className="bg-yellow-50 rounded p-4">
              <p className="text-sm text-yellow-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pendingPayments}</p>
              <p className="text-xs text-yellow-500">{formatRupees(stats.pendingAmount)}</p>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
              <select
                value={methodFilter}
                onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Methods</option>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {(statusFilter || methodFilter) && (
              <button
                onClick={() => { setStatusFilter(''); setMethodFilter(''); setPage(1); }}
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
          ) : payments.length === 0 ? (
            <p className="text-gray-500">No payments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-sm">{p.paymentNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.invoice?.invoiceNumber || p.invoiceId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.invoice?.tenant
                          ? `${p.invoice.tenant.firstName} ${p.invoice.tenant.lastName || ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatRupees(p.amountPaise)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.method}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {p.paidAt
                          ? new Date(p.paidAt).toLocaleDateString()
                          : new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'COMPLETED' && (
                          <button
                            onClick={() => handleDownloadReceipt(p)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                            title="Download Receipt"
                          >
                            Receipt
                          </button>
                        )}
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
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice *</label>
                <select
                  required
                  value={form.invoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select an invoice</option>
                  {invoices
                    .filter((i) => i.status === 'PENDING' || i.status === 'PARTIALLY_PAID' || i.status === 'OVERDUE')
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} — {i.tenant ? `${i.tenant.firstName} ${i.tenant.lastName || ''}` : ''} ({formatRupees(i.amountPaise)})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (paise) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Amount in paise"
                    value={form.amountPaise}
                    onChange={(e) => setForm({ ...form, amountPaise: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Method *</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
                <input
                  type="text"
                  placeholder="Optional transaction reference"
                  value={form.transactionId}
                  onChange={(e) => setForm({ ...form, transactionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
