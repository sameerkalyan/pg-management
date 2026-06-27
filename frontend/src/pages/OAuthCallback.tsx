import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hasExchanged = useRef(false);

  useEffect(() => {
    if (hasExchanged.current) return;
    hasExchanged.current = true;

    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // SWE-68 — Handle OAuth provider errors and invalid states explicitly
    if (errorParam) {
      setError(errorDescription || `OAuth error: ${errorParam}`);
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (!state) {
      setError('Missing OAuth state parameter');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    // Validate state format (basic UUID/hex check)
    if (!/^[a-zA-Z0-9_-]{16,}$/.test(state)) {
      setError('Invalid OAuth state format');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    const exchangeToken = async () => {
      try {
        const response = await api.post('/auth/oauth/exchange', { state });
        const { accessToken, user, mfaRequired, subscriptionRequired } = response.data;

        // Store token in localStorage immediately
        localStorage.setItem('accessToken', accessToken);
        const currentUser = handleOAuthCallback(accessToken, user);

        // If MFA is required, redirect to MFA verification
        if (mfaRequired) {
          navigate('/mfa-verify');
          return;
        }

        // If subscription is required, redirect to subscription payment
        if (subscriptionRequired) {
          navigate('/subscription-payment');
          return;
        }

        // For owners/managers, check org approval status before redirecting
        if (currentUser.role === 'owner' || currentUser.role === 'manager') {
          try {
            const orgResponse = await api.get('/organisations/me');
            if (orgResponse.data?.status === 'APPROVED') {
              navigate('/dashboard');
            } else {
              navigate('/pending-approval');
            }
          } catch {
            navigate('/subscription-payment');
          }
        } else if (currentUser.role === 'super_admin') {
          // Super admins must have MFA enabled
          if (!currentUser.mfaEnabled) {
            navigate('/mfa-setup');
          } else {
            navigate('/admin');
          }
        } else {
          navigate('/dashboard');
        }
      } catch (err: any) {
        console.error('OAuth exchange failed:', err);
        const status = err.response?.status;
        if (status === 400 || status === 401) {
          setError('Authentication session expired or invalid. Please try again.');
        } else if (status === 403) {
          const msg = err.response?.data?.message || '';
          if (msg.includes('pending') || msg.includes('approval')) {
            setError('Organisation pending admin approval.');
          } else if (msg.includes('suspended')) {
            setError('Organisation is suspended.');
          } else {
            setError(msg || 'Access denied');
          }
        } else {
          setError(err.response?.data?.message || 'Authentication failed');
        }
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    exchangeToken();
  }, [searchParams, handleOAuthCallback, navigate]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-600 font-medium">{error}</p>
            <p className="mt-2 text-gray-500">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
