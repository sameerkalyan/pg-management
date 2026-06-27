import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const MfaSetup = () => {
  const [step, setStep] = useState<'setup' | 'verify'>('setup');
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSetup = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.post('/auth/mfa/setup');
      setQrUri(response.data.otpauthUri);
      setSecret(response.data.secret);
      setStep('verify');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    try {
      setLoading(true);
      setError('');
      await api.post('/auth/mfa/enable', { token: code });
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Setup MFA</h1>
        <p className="text-center text-gray-600 mb-6">
          Multi-factor authentication is required for admin access
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {step === 'setup' && (
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              You need to set up two-factor authentication using an authenticator app (Google Authenticator, Authy, etc.) before accessing the admin dashboard.
            </p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Generating...' : 'Generate QR Code'}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div>
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-3">
                1. Scan this QR code with your authenticator app:
              </p>
              <div className="flex justify-center mb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                  alt="MFA QR Code"
                  className="border rounded"
                />
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Or enter this secret manually:
              </p>
              <code className="block bg-gray-100 p-2 rounded text-sm text-center break-all">
                {secret}
              </code>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-3">
                2. Enter the 6-digit code from your authenticator app:
              </p>
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
              onClick={handleEnable}
              disabled={loading || code.length !== 6}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors mb-3"
            >
              {loading ? 'Verifying...' : 'Enable MFA'}
            </button>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Regenerate QR Code
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaSetup;
