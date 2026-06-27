import { useState, useEffect, Fragment } from 'react';
import { api } from '../services/api';

interface Property {
  id: string;
  name: string;
}

interface Bed {
  id: string;
  roomId: string;
  bedNumber: string;
  rent: number;
  status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';
}

interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'DORMITORY';
  capacity: number;
  status: 'VACANT' | 'OCCUPIED' | 'PARTIALLY_OCCUPIED' | 'MAINTENANCE';
  description?: string;
  beds?: Bed[];
  occupiedBeds?: number;
  totalBeds?: number;
}

const ROOM_TYPES = ['SINGLE', 'DOUBLE', 'TRIPLE', 'DORMITORY'];
const ROOM_STATUSES = ['VACANT', 'OCCUPIED', 'PARTIALLY_OCCUPIED', 'MAINTENANCE'];
const BED_STATUSES = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'];

const Rooms = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [form, setForm] = useState({
    propertyId: '',
    roomNumber: '',
    floor: '1',
    type: 'SINGLE' as Room['type'],
    capacity: '1',
    status: 'VACANT' as Room['status'],
    description: '',
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

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      fetchRooms(selectedProperty);
    } else {
      setRooms([]);
    }
  }, [selectedProperty]);

  const fetchProperties = async () => {
    try {
      const res = await api.get('/properties', { params: { limit: 100 } });
      setProperties(res.data?.data || []);
      if (res.data?.data?.length > 0 && !selectedProperty) {
        setSelectedProperty(res.data.data[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load properties');
    }
  };

  const fetchRooms = async (propertyId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/rooms/property/${propertyId}`);
      setRooms(res.data?.data || res.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      propertyId: selectedProperty,
      roomNumber: '',
      floor: '1',
      type: 'SINGLE',
      capacity: '1',
      status: 'VACANT',
      description: '',
    });
    setShowModal(true);
  };

  const openEdit = (room: Room) => {
    setEditing(room);
    setForm({
      propertyId: room.propertyId,
      roomNumber: room.roomNumber,
      floor: room.floor.toString(),
      type: room.type,
      capacity: room.capacity.toString(),
      status: room.status,
      description: room.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        floor: parseInt(form.floor, 10),
        capacity: parseInt(form.capacity, 10),
      };
      if (editing) {
        await api.put(`/rooms/${editing.id}`, payload);
        setSuccess('Room updated');
      } else {
        await api.post('/rooms', payload);
        setSuccess('Room created');
      }
      setShowModal(false);
      fetchRooms(selectedProperty);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save room');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      await api.delete(`/rooms/${id}`);
      setSuccess('Room deleted');
      fetchRooms(selectedProperty);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete room');
    }
  };

  const handleBedStatusChange = async (roomId: string, bedId: string, status: string) => {
    try {
      await api.patch(`/rooms/${roomId}/beds/${bedId}/status`, { status });
      setSuccess('Bed status updated');
      fetchRooms(selectedProperty);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to update bed status');
    }
  };

  const getBedStatusColor = (status: string) => {
    switch (status) {
      case 'VACANT': return 'bg-green-100 text-green-800';
      case 'OCCUPIED': return 'bg-red-100 text-red-800';
      case 'MAINTENANCE': return 'bg-gray-100 text-gray-800';
      case 'RESERVED': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VACANT': return 'bg-green-100 text-green-800';
      case 'OCCUPIED': return 'bg-red-100 text-red-800';
      case 'PARTIALLY_OCCUPIED': return 'bg-yellow-100 text-yellow-800';
      case 'MAINTENANCE': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Room Management</h2>
          <div className="flex gap-3">
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={openCreate}
              disabled={!selectedProperty}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              Add Room
            </button>
          </div>
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

        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            {!selectedProperty ? (
              <p className="text-gray-500">Select a property to view rooms.</p>
            ) : loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : rooms.length === 0 ? (
              <p className="text-gray-500">No rooms found for this property.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Floor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beds (Occ/Total)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rooms.map((r) => (
                      <Fragment key={r.id}>
                        <tr>
                          <td className="px-4 py-3 font-medium">
                            <button
                              onClick={() => setExpandedRoom(expandedRoom === r.id ? null : r.id)}
                              className="flex items-center gap-1 hover:text-blue-600"
                            >
                              {expandedRoom === r.id ? '▼' : '▶'} {r.roomNumber}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{r.floor}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{r.type}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {r.occupiedBeds ?? 0}/{r.totalBeds ?? r.capacity}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded ${getStatusColor(r.status)}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={() => openEdit(r)}
                              className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                        {expandedRoom === r.id && r.beds && r.beds.length > 0 && (
                          <tr key={`${r.id}-beds`} className="bg-gray-50">
                            <td colSpan={6} className="px-8 py-3">
                              <div className="flex flex-wrap gap-3">
                                {r.beds.map((bed) => (
                                  <div key={bed.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                                    <span className="text-sm font-medium">{bed.bedNumber}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${getBedStatusColor(bed.status)}`}>
                                      {bed.status}
                                    </span>
                                    <select
                                      value={bed.status}
                                      onChange={(e) => handleBedStatusChange(r.id, bed.id, e.target.value)}
                                      className="text-xs border border-gray-300 rounded px-1 py-0.5"
                                    >
                                      {BED_STATUSES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 my-8">
            <h3 className="text-lg font-semibold mb-4">
              {editing ? 'Edit Room' : 'Add Room'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room Number *</label>
                  <input
                    type="text"
                    required
                    value={form.roomNumber}
                    onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Floor *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Room['type'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    {ROOM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Room['status'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {ROOM_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
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
    </div>
  );
};

export default Rooms;