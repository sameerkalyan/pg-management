import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const MfaVerify = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { logout, handleOAuthCallback } = useAuth();
  const navigate = useNavigate();

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.post('/auth/mfa/login', { code });
      const { accessToken, user, subscriptionRequired } = response.data;
      localStorage.setItem('accessToken', accessToken);

      if (user) {
        const currentUser = handleOAuthCallback(accessToken, user);

        if (subscriptionRequired) {
          navigate('/subscription-payment');
          return;
        }

        if (currentUser.role === 'super_admin') {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid MFA code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">MFA Verification</h1>
        <p className="text-center text-gray-600 mb-6">
          Enter the 6-digit code from your authenticator app
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-6">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-2 text-center text-2xl tracking-widest border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={6}
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors mb-3"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaVerify;
