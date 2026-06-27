import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Building2,
  Users,
  FileText,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

interface OccupancyStats {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyRate: number;
}

interface CollectionStats {
  total: number;
  collected: number;
  pending: number;
  overdue: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [occupancy, setOccupancy] = useState<OccupancyStats | null>(null);
  const [collection, setCollection] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const [occupancyRes, collectionRes] = await Promise.allSettled([
        api.get('/dashboard/occupancy'),
        api.get('/dashboard/collection'),
      ]);

      if (occupancyRes.status === 'fulfilled') {
        setOccupancy(occupancyRes.value.data);
      } else {
        setError('Failed to load occupancy stats');
      }
      
      if (collectionRes.status === 'fulfilled') {
        setCollection(collectionRes.value.data);
      } else {
        setError('Failed to load collection stats');
      }
      
      if (occupancyRes.status === 'rejected' && collectionRes.status === 'rejected') {
        setError('Failed to load dashboard data');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatRupees = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const quickActions = [
    { label: 'Add Property', path: '/properties', icon: Building2, color: 'bg-blue-500' },
    { label: 'Add Tenant', path: '/tenants', icon: Users, color: 'bg-green-500' },
    { label: 'Create Invoice', path: '/invoices', icon: FileText, color: 'bg-orange-500' },
    { label: 'View Complaints', path: '/complaints', icon: MessageSquare, color: 'bg-purple-500' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name && user.name.trim() ? user.name.split(' ')[0] : user?.email}!
        </h2>
        <p className="text-gray-500 mt-1">Here's what's happening with your PG properties.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">Occupancy</h3>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-600" />
            </div>
          </div>
          {loading ? (
            <div className="animate-pulse h-8 w-24 bg-gray-200 rounded" />
          ) : occupancy ? (
            <>
              <p className="text-3xl font-bold text-gray-900">
                {occupancy.occupiedBeds} / {occupancy.totalBeds}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {occupancy.occupancyRate.toFixed(1)}% occupied ({occupancy.vacantBeds} vacant)
              </p>
            </>
          ) : (
            <p className="text-gray-400">No data</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">Collected</h3>
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <span className="text-green-600 font-bold text-sm">₹</span>
            </div>
          </div>
          {loading ? (
            <div className="animate-pulse h-8 w-24 bg-gray-200 rounded" />
          ) : collection ? (
            <>
              <p className="text-3xl font-bold text-green-600">
                {formatRupees(collection.collected)}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {collection.total > 0 && collection.collected >= 0 ? ((collection.collected / collection.total) * 100).toFixed(1) : '0.0'}% collection rate
              </p>
            </>
          ) : (
            <p className="text-gray-400">No data</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">Pending</h3>
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertCircle size={20} className="text-orange-600" />
            </div>
          </div>
          {loading ? (
            <div className="animate-pulse h-8 w-24 bg-gray-200 rounded" />
          ) : collection ? (
            <>
              <p className="text-3xl font-bold text-orange-600">
                {formatRupees(collection.pending)}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {formatRupees(collection.overdue)} overdue
              </p>
            </>
          ) : (
            <p className="text-gray-400">No data</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                to={action.path}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all group"
              >
                <div className={`w-12 h-12 rounded-lg ${action.color} flex items-center justify-center mb-3`}>
                  <Icon size={24} className="text-white" />
                </div>
                <p className="font-medium text-gray-900">{action.label}</p>
                <div className="flex items-center gap-1 text-sm text-gray-400 mt-1 group-hover:text-gray-600">
                  Go <ArrowRight size={14} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Getting Started */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Getting Started</h3>
        <p className="text-gray-600 mb-4">
          New here? Follow these steps to set up your PG management:
        </p>
        <div className="space-y-3">
          <Link to="/properties" className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">1</span>
            Create your first property
          </Link>
          <Link to="/rooms" className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">2</span>
            Add rooms to your property
          </Link>
          <Link to="/tenants" className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">3</span>
            Add tenants and assign rooms
          </Link>
          <Link to="/invoices" className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
            <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center font-medium">4</span>
            Generate invoices for rent collection
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;