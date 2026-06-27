import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Complaint {
  id: string;
  title: string;
  tenantId: string;
  tenant?: { id: string; firstName: string; lastName?: string };
  category: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assignedTo?: string;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName?: string;
  roomNumber?: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CATEGORY_OPTIONS = ['MAINTENANCE', 'ELECTRICAL', 'PLUMBING', 'FURNITURE', 'CLEANING', 'SECURITY', 'INTERNET', 'FOOD', 'OTHER'];

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
};

const Complaints = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  const [createForm, setCreateForm] = useState({
    tenantId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'MAINTENANCE',
  });

  const [updateForm, setUpdateForm] = useState({
    status: '',
    assignedTo: '',
    resolution: '',
  });

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;
      const res = await api.get('/complaints', { params });
      setComplaints(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, priorityFilter, categoryFilter]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await api.get('/tenants', { params: { limit: 100 } });
      setTenants(res.data?.data || []);
    } catch {
      // tenants list optional
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const resetCreateForm = () => {
    setCreateForm({ tenantId: '', title: '', description: '', priority: 'MEDIUM', category: 'MAINTENANCE' });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/complaints', createForm);
      setSuccess('Complaint created successfully');
      setShowCreateModal(false);
      resetCreateForm();
      fetchComplaints();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create complaint');
    }
  };

  const openUpdateModal = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setUpdateForm({
      status: complaint.status,
      assignedTo: complaint.assignedTo || '',
      resolution: complaint.resolution || '',
    });
    setShowUpdateModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setError(null);
    try {
      const payload: any = {};
      if (updateForm.status && updateForm.status !== selectedComplaint.status) {
        payload.status = updateForm.status;
      }
      // Allow clearing assignedTo by sending null
      if (updateForm.assignedTo !== selectedComplaint.assignedTo) {
        payload.assignedTo = updateForm.assignedTo || null;
      }
      if (updateForm.resolution && updateForm.resolution !== selectedComplaint.resolution) {
        payload.resolution = updateForm.resolution;
      }
      
      // Validate that at least one field is being updated
      if (Object.keys(payload).length === 0) {
        setError('No changes detected');
        return;
      }
      
      await api.put(`/complaints/${selectedComplaint.id}`, payload);
      setSuccess('Complaint updated successfully');
      setShowUpdateModal(false);
      fetchComplaints();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update complaint');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/complaints/${id}`);
      setSuccess('Complaint deleted successfully');
      setShowDeleteConfirm(null);
      fetchComplaints();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete complaint');
    }
  };

  const handleQuickStatus = async (id: string, newStatus: Complaint['status']) => {
    try {
      await api.put(`/complaints/${id}`, { status: newStatus });
      setSuccess(`Complaint marked as ${newStatus}`);
      fetchComplaints();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update complaint');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Complaint Management</h2>
        <button
          onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          New Complaint
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
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
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Priorities</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Categories</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {(statusFilter || priorityFilter || categoryFilter) && (
              <button
                onClick={() => { setStatusFilter(''); setPriorityFilter(''); setCategoryFilter(''); setPage(1); }}
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
          ) : complaints.length === 0 ? (
            <p className="text-gray-500">No complaints found.</p>
          ) : (
            <div className="space-y-4">
              {complaints.map((c) => (
                <div key={c.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold text-gray-900">{c.title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${PRIORITY_COLORS[c.priority]}`}>
                          {c.priority}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[c.status]}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{c.category}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {c.tenant ? `${c.tenant.firstName} ${c.tenant.lastName || ''}` : 'Unknown tenant'}
                        {c.assignedTo && ` · Assigned: ${c.assignedTo.slice(0, 8)}...`}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-700 mb-3">{c.description}</p>
                  {c.resolution && (
                    <p className="text-sm text-green-700 bg-green-50 p-2 rounded mb-3">
                      <strong>Resolution:</strong> {c.resolution}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openUpdateModal(c)}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                    >
                      Update
                    </button>
                    {c.status === 'OPEN' && (
                      <button
                        onClick={() => handleQuickStatus(c.id, 'IN_PROGRESS')}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Start Work
                      </button>
                    )}
                    {c.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleQuickStatus(c.id, 'RESOLVED')}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Mark Resolved
                      </button>
                    )}
                    {c.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleQuickStatus(c.id, 'CLOSED')}
                        className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteConfirm(c.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
            <h3 className="text-lg font-semibold mb-4">New Complaint</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant *</label>
                <select
                  required
                  value={createForm.tenantId}
                  onChange={(e) => setCreateForm({ ...createForm, tenantId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select a tenant</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName || ''} {t.roomNumber ? `— Room ${t.roomNumber}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  placeholder="Brief title for the complaint"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the issue in detail"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    required
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
                  <select
                    required
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create Complaint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUpdateModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Complaint</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="font-medium">{selectedComplaint.title}</p>
              <p className="text-sm text-gray-600">{selectedComplaint.description}</p>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={updateForm.status}
                  onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign To (User ID)</label>
                <input
                  type="text"
                  placeholder="User UUID to assign (clear to unassign)"
                  value={updateForm.assignedTo}
                  onChange={(e) => setUpdateForm({ ...updateForm, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                {selectedComplaint.status === 'OPEN' && updateForm.assignedTo && updateForm.assignedTo !== selectedComplaint.assignedTo && (
                  <p className="text-xs text-blue-600 mt-1">Status will auto-change to IN_PROGRESS</p>
                )}
                {updateForm.assignedTo === '' && selectedComplaint.assignedTo && (
                  <p className="text-xs text-orange-600 mt-1">This will unassign the complaint</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add resolution details"
                  value={updateForm.resolution}
                  onChange={(e) => setUpdateForm({ ...updateForm, resolution: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Update Complaint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Complaint?</h3>
            <p className="text-gray-600 mb-4">This action cannot be undone. The complaint will be soft-deleted.</p>
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

export default Complaints;