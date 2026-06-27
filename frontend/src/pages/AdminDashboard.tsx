import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Organisation {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'INACTIVE';
  rejectionReason?: string;
  createdAt: string;
  userCount: number;
  owner?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  subscription?: {
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    endDate: string;
    amountPaise: number;
  };
}

interface Stats {
  organisations: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    suspended: number;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  revenue?: {
    totalRevenuePaise: number;
  };
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [meta, setMeta] = useState<Meta | null>(null);

  const fetchData = useCallback(async () => {
    if (!mfaCode) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const status = activeTab === 'all' ? undefined : activeTab.toUpperCase();
      const [statsRes, orgsRes] = await Promise.all([
        api.get('/admin/stats', {
          headers: { 'x-mfa-code': mfaCode },
        }),
        api.get('/admin/organisations', {
          params: { status, page, limit },
          headers: { 'x-mfa-code': mfaCode },
        }),
      ]);
      setStats(statsRes.data);
      setOrganisations(orgsRes.data.data || orgsRes.data || []);
      setMeta(orgsRes.data.meta || null);
    } catch (err: any) {
      // SWE-11 — surface errors to users instead of silently logging
      setError(err.response?.data?.message || 'Failed to load dashboard data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [mfaCode, activeTab, page, limit]);

  useEffect(() => {
    if (mfaCode.length === 6) {
      fetchData();
    }
  }, [fetchData, mfaCode]);

  // SWE-11 — clear toast messages after a short delay
  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  const handleApprove = async (id: string) => {
    try {
      setActionInProgress(true);
      setError(null);
      await api.post(`/admin/organisations/${id}/approve`, {}, {
        headers: { 'x-mfa-code': mfaCode },
      });
      setSuccess('Organisation approved successfully');
      fetchData();
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 || status === 403
          ? 'MFA code required or invalid'
          : err.response?.data?.message || 'Failed to approve organisation';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!selectedOrg || !rejectReason) return;

    try {
      setActionInProgress(true);
      setError(null);
      await api.post(
        `/admin/organisations/${selectedOrg.id}/reject`,
        { rejectionReason: rejectReason },
        { headers: { 'x-mfa-code': mfaCode } },
      );
      setSuccess('Organisation rejected');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedOrg(null);
      fetchData();
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 || status === 403
          ? 'MFA code required or invalid'
          : err.response?.data?.message || 'Failed to reject organisation';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedOrg || !suspendReason) return;

    try {
      setActionInProgress(true);
      setError(null);
      await api.post(
        `/admin/organisations/${selectedOrg.id}/suspend`,
        { reason: suspendReason },
        { headers: { 'x-mfa-code': mfaCode } },
      );
      setSuccess('Organisation suspended');
      setShowSuspendModal(false);
      setSuspendReason('');
      setSelectedOrg(null);
      fetchData();
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 || status === 403
          ? 'MFA code required or invalid'
          : err.response?.data?.message || 'Failed to suspend organisation';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      setActionInProgress(true);
      setError(null);
      await api.post(`/admin/organisations/${id}/reactivate`, {}, {
        headers: { 'x-mfa-code': mfaCode },
      });
      setSuccess('Organisation reactivated');
      fetchData();
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 || status === 403
          ? 'MFA code required or invalid'
          : err.response?.data?.message || 'Failed to reactivate organisation';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'SUSPENDED': return 'bg-orange-100 text-orange-800';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSubscriptionStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      {/* Toast notifications */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* MFA code input for admin actions */}
        <div className="mb-4 bg-white rounded-lg shadow p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            MFA Code <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit TOTP code from authenticator app"
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={6}
            />
            <button
              onClick={() => fetchData()}
              disabled={mfaCode.length !== 6 || loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 text-sm whitespace-nowrap"
            >
              {loading ? 'Loading...' : 'Load Data'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enter the 6-digit code from your authenticator app to load and manage organisations.
          </p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Organisations</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.organisations.total}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Pending</h3>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.organisations.pending}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Approved</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.organisations.approved}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Rejected</h3>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.organisations.rejected}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Suspended</h3>
              <p className="text-3xl font-bold text-orange-600 mt-2">{stats.organisations.suspended}</p>
            </div>
            {stats.revenue && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500">Total Revenue</h3>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  ₹{(stats.revenue.totalRevenuePaise / 100).toLocaleString('en-IN')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-4 mb-6">
          {['pending', 'approved', 'rejected', 'suspended', 'all'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium capitalize ${
                activeTab === tab
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab} {stats && tab !== 'all' && `(${stats.organisations[tab as keyof typeof stats.organisations] as number || 0})`}
            </button>
          ))}
        </div>

        {/* Organisations List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 capitalize">{activeTab} Organisations</h2>

            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : organisations.length === 0 ? (
              <p className="text-gray-500">No organisations found</p>
            ) : (
              <div className="space-y-4">
                {organisations.map((org) => (
                  <div key={org.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{org.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${getStatusColor(org.status)}`}>
                            {org.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Email:</span> {org.email}
                          </div>
                          <div>
                            <span className="font-medium">Phone:</span> {org.phone || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Location:</span> {org.city}, {org.state}
                          </div>
                          <div>
                            <span className="font-medium">Users:</span> {org.userCount}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {new Date(org.createdAt).toLocaleDateString()}
                          </div>
                          {org.subscription && (
                            <>
                              <div>
                                <span className="font-medium">Subscription:</span>
                                <span className={`ml-1 text-xs px-2 py-1 rounded ${getSubscriptionStatusColor(org.subscription.status)}`}>
                                  {org.subscription.status}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium">Amount:</span> ₹{(org.subscription.amountPaise / 100).toLocaleString('en-IN')}
                              </div>
                              <div>
                                <span className="font-medium">Valid Until:</span> {new Date(org.subscription.endDate).toLocaleDateString()}
                              </div>
                            </>
                          )}
                          {!org.subscription && org.status === 'PENDING' && (
                            <div className="col-span-2">
                              <span className="font-medium text-yellow-600">No subscription payment received</span>
                            </div>
                          )}
                          {org.rejectionReason && (
                            <div className="col-span-2">
                              <span className="font-medium text-red-600">Rejection Reason:</span> {org.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        {org.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApprove(org.id)}
                              disabled={actionInProgress}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrg(org);
                                setShowRejectModal(true);
                              }}
                              disabled={actionInProgress}
                              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {org.status === 'APPROVED' && (
                          <button
                            onClick={() => {
                              setSelectedOrg(org);
                              setShowSuspendModal(true);
                            }}
                            disabled={actionInProgress}
                            className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 text-sm"
                          >
                            Suspend
                          </button>
                        )}
                        {(org.status === 'SUSPENDED' || org.status === 'INACTIVE') && (
                          <button
                            onClick={() => handleReactivate(org.id)}
                            disabled={actionInProgress}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SWE-18 — Pagination controls */}
            {meta && meta.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Page {meta.page} of {meta.totalPages} ({meta.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    disabled={page === meta.totalPages || loading}
                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Suspend Modal */}
      {showSuspendModal && selectedOrg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Suspend Organisation</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are suspending <strong>{selectedOrg.name}</strong>. Please provide a reason.
            </p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={4}
              placeholder="Enter suspension reason..."
              required
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendReason('');
                  setSelectedOrg(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={!suspendReason || actionInProgress}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-orange-400"
              >
                {actionInProgress ? 'Suspending...' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedOrg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reject Organisation</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are rejecting <strong>{selectedOrg.name}</strong>. Please provide a reason.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={4}
              placeholder="Enter rejection reason..."
              required
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                  setSelectedOrg(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason || actionInProgress}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-400"
              >
                {actionInProgress ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;