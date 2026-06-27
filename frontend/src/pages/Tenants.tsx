import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Bed {
  id: string;
  bedNumber: string;
  room: {
    id: string;
    roomNumber: string;
    propertyId: string;
  };
}

interface VacantBed {
  id: string;
  bedNumber: string;
  roomId: string;
  roomNumber: string;
  floor: number;
  rent: number;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName?: string;
  phoneNumber: string;
  email?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EVICTED' | 'VACATED';
  bedId?: string;
  bed?: Bed;
  checkInDate: string;
  checkOutDate?: string;
  securityDeposit?: number;
  securityDepositStatus?: 'PENDING' | 'PAID' | 'OVERDUE' | 'REFUNDED';
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  photoUrl?: string;
  idProofUrl?: string;
  idProofType?: string;
}

interface Property {
  id: string;
  name: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const TENANT_STATUSES = ['ACTIVE', 'INACTIVE', 'EVICTED', 'VACATED'];
const ID_PROOF_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Voter ID'];

const Tenants = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [vacantBeds, setVacantBeds] = useState<VacantBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [propertyFilter, setPropertyFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [showMoveOutModal, setShowMoveOutModal] = useState<Tenant | null>(null);
  const [moveOutDate, setMoveOutDate] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingIdProof, setUploadingIdProof] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    bedId: '',
    checkInDate: '',
    securityDeposit: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    idProofType: '',
  });
  const [formPropertyId, setFormPropertyId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [idProofUrl, setIdProofUrl] = useState('');

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (propertyFilter) params.propertyId = propertyFilter;
      const res = await api.get('/tenants', { params });
      setTenants(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, propertyFilter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const fetchProperties = async () => {
    try {
      const res = await api.get('/properties', { params: { limit: 100 } });
      setProperties(res.data?.data || []);
    } catch {
      // silent
    }
  };

  const fetchVacantBeds = useCallback(async (propertyId: string) => {
    if (!propertyId) {
      setVacantBeds([]);
      return;
    }
    try {
      const res = await api.get(`/rooms/property/${propertyId}/vacant-beds`);
      setVacantBeds(res.data?.data || []);
    } catch {
      setVacantBeds([]);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      email: '',
      bedId: '',
      checkInDate: new Date().toISOString().split('T')[0],
      securityDeposit: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      idProofType: '',
    });
    setFormPropertyId('');
    setVacantBeds([]);
    setPhotoUrl('');
    setIdProofUrl('');
    setShowModal(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant);
    setForm({
      firstName: tenant.firstName,
      lastName: tenant.lastName || '',
      phoneNumber: tenant.phoneNumber,
      email: tenant.email || '',
      bedId: tenant.bedId || '',
      checkInDate: tenant.checkInDate ? new Date(tenant.checkInDate).toISOString().split('T')[0] : '',
      securityDeposit: tenant.securityDeposit?.toString() || '',
      emergencyContactName: tenant.emergencyContactName || '',
      emergencyContactPhone: tenant.emergencyContactPhone || '',
      idProofType: tenant.idProofType || '',
    });
    // Bug 4 Fix: Populate formPropertyId from bed relationship when editing
    const propertyId = tenant.bed?.room?.propertyId || '';
    setFormPropertyId(propertyId);
    if (propertyId) {
      fetchVacantBeds(propertyId);
    } else {
      setVacantBeds([]);
    }
    setPhotoUrl(tenant.photoUrl || '');
    setIdProofUrl(tenant.idProofUrl || '');
    setShowModal(true);
  };

  const handleFileUpload = async (file: File, _type: 'photo' | 'idProof'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.url || '';
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPhoto(true);
      const url = await handleFileUpload(file, 'photo');
      setPhotoUrl(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleIdProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingIdProof(true);
      const url = await handleFileUpload(file, 'idProof');
      setIdProofUrl(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload ID proof');
    } finally {
      setUploadingIdProof(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...form,
        securityDeposit: form.securityDeposit ? parseFloat(form.securityDeposit) : undefined,
        checkInDate: form.checkInDate || new Date().toISOString().split('T')[0],
      };
      if (editing) {
        await api.put(`/tenants/${editing.id}`, payload);
        if (photoUrl && photoUrl !== editing.photoUrl) {
          await api.patch(`/tenants/${editing.id}/photo`, { photoUrl });
        }
        if (idProofUrl && idProofUrl !== editing.idProofUrl) {
          await api.patch(`/tenants/${editing.id}/id-proof`, { idProofUrl });
        }
        setSuccess('Tenant updated');
      } else {
        const res = await api.post('/tenants', payload);
        const newTenantId = res.data?.id;
        if (newTenantId && photoUrl) {
          await api.patch(`/tenants/${newTenantId}/photo`, { photoUrl });
        }
        if (newTenantId && idProofUrl) {
          await api.patch(`/tenants/${newTenantId}/id-proof`, { idProofUrl });
        }
        setSuccess('Tenant created');
      }
      setShowModal(false);
      fetchTenants();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save tenant');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return;
    try {
      await api.delete(`/tenants/${id}`);
      setSuccess('Tenant deleted');
      fetchTenants();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete tenant');
    }
  };

  const handleMoveOut = async () => {
    if (!showMoveOutModal) return;
    try {
      await api.post(`/tenants/${showMoveOutModal.id}/moveout`, {
        moveOutDate: moveOutDate || new Date().toISOString().split('T')[0],
      });
      setSuccess('Tenant moved out');
      setShowMoveOutModal(null);
      setMoveOutDate('');
      fetchTenants();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to move out tenant');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800';
      case 'EVICTED': return 'bg-red-100 text-red-800';
      case 'VACATED': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const propertyName = (tenant: Tenant) => {
    const propId = tenant.bed?.room?.propertyId;
    if (!propId) return '-';
    const prop = properties.find((p) => p.id === propId);
    return prop?.name || '-';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Tenant Management</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Tenant
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

      <div className="flex gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Statuses</option>
          {TENANT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={propertyFilter}
          onChange={(e) => { setPropertyFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : tenants.length === 0 ? (
            <p className="text-gray-500">No tenants found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bed</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium">
                        {t.firstName} {t.lastName || ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.phoneNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{propertyName(t)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.bed?.bedNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(t.checkInDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(t.status)}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => openEdit(t)}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                        >
                          Edit
                        </button>
                        {t.status === 'ACTIVE' && (
                          <button
                            onClick={() => {
                              setShowMoveOutModal(t);
                              setMoveOutDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm"
                          >
                            Move Out
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          Delete
                        </button>
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
              {editing ? 'Edit Tenant' : 'Add Tenant'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    required
                    value={form.phoneNumber}
                    onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
                  <select
                    required
                    value={formPropertyId}
                    onChange={(e) => {
                      setFormPropertyId(e.target.value);
                      setForm({ ...form, bedId: '' });
                      fetchVacantBeds(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bed *</label>
                  <select
                    required
                    value={form.bedId}
                    onChange={(e) => setForm({ ...form, bedId: e.target.value })}
                    disabled={!formPropertyId || vacantBeds.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                  >
                    <option value="">Select bed</option>
                    {vacantBeds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bedNumber} (Room {b.roomNumber}, Floor {b.floor})
                        {b.rent ? ` - ₹${b.rent}` : ''}
                      </option>
                    ))}
                  </select>
                  {formPropertyId && vacantBeds.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">No vacant beds available for this property</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date *</label>
                  <input
                    type="date"
                    required
                    value={form.checkInDate}
                    onChange={(e) => setForm({ ...form, checkInDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Security Deposit</label>
                  <input
                    type="number"
                    min="0"
                    value={form.securityDeposit}
                    onChange={(e) => setForm({ ...form, securityDeposit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={form.emergencyContactName}
                    onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone</label>
                  <input
                    type="text"
                    value={form.emergencyContactPhone}
                    onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Proof Type</label>
                  <select
                    value={form.idProofType}
                    onChange={(e) => setForm({ ...form, idProofType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select type</option>
                    {ID_PROOF_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {uploadingPhoto && <p className="text-xs text-blue-600 mt-1">Uploading...</p>}
                  {photoUrl && !uploadingPhoto && <p className="text-xs text-green-600 mt-1">Photo uploaded ✓</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Proof Document</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleIdProofUpload}
                  disabled={uploadingIdProof}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                {uploadingIdProof && <p className="text-xs text-blue-600 mt-1">Uploading...</p>}
                {idProofUrl && !uploadingIdProof && <p className="text-xs text-green-600 mt-1">ID proof uploaded ✓</p>}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMoveOutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Move Out Tenant</h3>
            <p className="text-sm text-gray-600 mb-4">
              Confirm move-out for <strong>{showMoveOutModal.firstName} {showMoveOutModal.lastName || ''}</strong>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Move-out Date</label>
              <input
                type="date"
                required
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowMoveOutModal(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveOut}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                Confirm Move Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tenants;