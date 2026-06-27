import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const PendingApproval = () => {
  const [orgStatus, setOrgStatus] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const checkStatus = async () => {
    try {
      const response = await api.get('/organisations/me');
      if (response.data?.status === 'APPROVED') {
        navigate('/dashboard');
      } else if (response.data?.status === 'REJECTED') {
        setOrgStatus('REJECTED');
      } else {
        setOrgStatus(response.data?.status || 'PENDING');
      }
    } catch {
      // ignore - still pending
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-md p-8">
        {orgStatus === 'REJECTED' ? (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-center mb-2 text-red-700">Application Rejected</h1>
            <p className="text-center text-gray-600 mb-8">
              Unfortunately, your organisation application has been rejected. Please contact support for more information.
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-center mb-2">Awaiting Admin Approval</h1>
            <p className="text-center text-gray-600 mb-8">
              Your subscription is active. An administrator needs to approve your organisation before you can access the dashboard and start managing your PG properties.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">What's happening?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Your subscription payment has been received</li>
                <li>• Your organisation is pending admin review</li>
                <li>• Once approved, you'll get full access to all features</li>
                <li>• This page will automatically redirect when approved</li>
              </ul>
            </div>
            <div className="text-center text-sm text-gray-500 mb-6">
              <p>Logged in as: <span className="font-medium">{user?.email}</span></p>
              <p>Checking status every 30 seconds...</p>
            </div>
          </>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleLogout}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
