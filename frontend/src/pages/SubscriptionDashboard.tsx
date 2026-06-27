import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Subscription {
  id: string;
  planId: string;
  amountPaise: number;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  startDate: string;
  endDate: string;
  gracePeriodEndDate: string | null;
  createdAt: string;
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  daysRemaining: number;
  isInGracePeriod: boolean;
  subscription: Subscription | null;
}

const SubscriptionDashboard = () => {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    fetchSubscription();
    fetchStatus();
  }, []);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const res = await api.get('/subscriptions/my-subscription');
      setSubscription(res.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('No subscription found. Please subscribe to continue.');
      } else {
        setError(err.response?.data?.message || 'Failed to load subscription');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await api.get('/subscriptions/my-subscription/status');
      setStatus(res.data);
    } catch (err: any) {
      console.error('Failed to fetch subscription status:', err);
    }
  };

  const handleRenew = () => {
    navigate('/subscription-renewal');
  };

  const handleChangePlan = () => {
    navigate('/subscription-plans');
  };

  const handleCancel = async () => {
    if (!subscription) return;
    
    try {
      await api.post(`/subscriptions/${subscription.id}/cancel`);
      setSuccess('Subscription cancelled successfully. Access continues until end date.');
      setShowCancelModal(false);
      fetchSubscription();
      fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to cancel subscription');
      setShowCancelModal(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatAmount = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const getPlanName = (planId: string) => {
    const planNames: Record<string, string> = {
      BASIC_MONTHLY: 'Basic Monthly',
      BASIC_YEARLY: 'Basic Yearly',
      PRO_MONTHLY: 'Pro Monthly',
      PRO_YEARLY: 'Pro Yearly',
    };
    return planNames[planId] || planId;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">No Active Subscription</h2>
          <p className="text-yellow-700 mb-4">You need an active subscription to access this platform.</p>
          <button
            onClick={() => navigate('/subscription-plans')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Plans & Subscribe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Subscription Management</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          ← Back to Dashboard
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

      {/* Current Subscription Card */}
      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Current Subscription</h2>
            <p className="text-gray-600">Manage your subscription plan and billing</p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
            {subscription.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="border-l-4 border-blue-500 pl-4">
            <p className="text-sm text-gray-600 mb-1">Plan</p>
            <p className="text-xl font-semibold">{getPlanName(subscription.planId)}</p>
          </div>

          <div className="border-l-4 border-green-500 pl-4">
            <p className="text-sm text-gray-600 mb-1">Amount</p>
            <p className="text-xl font-semibold">{formatAmount(subscription.amountPaise)}</p>
          </div>

          <div className="border-l-4 border-purple-500 pl-4">
            <p className="text-sm text-gray-600 mb-1">Start Date</p>
            <p className="text-xl font-semibold">{formatDate(subscription.startDate)}</p>
          </div>

          <div className="border-l-4 border-orange-500 pl-4">
            <p className="text-sm text-gray-600 mb-1">End Date</p>
            <p className="text-xl font-semibold">{formatDate(subscription.endDate)}</p>
          </div>
        </div>

        {/* Status Indicators */}
        {status && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            {status.hasActiveSubscription && status.daysRemaining > 0 && (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <p className="text-gray-700">
                  Your subscription is active. <strong>{status.daysRemaining} days remaining</strong>
                </p>
              </div>
            )}

            {status.isInGracePeriod && (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                <p className="text-yellow-700">
                  <strong>Grace Period Active:</strong> Please renew before{' '}
                  {subscription.gracePeriodEndDate && formatDate(subscription.gracePeriodEndDate)}
                </p>
              </div>
            )}

            {subscription.status === 'EXPIRED' && !status.isInGracePeriod && (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                <p className="text-red-700">
                  <strong>Subscription Expired:</strong> Please renew to continue accessing the platform
                </p>
              </div>
            )}

            {subscription.status === 'CANCELLED' && (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-3 h-3 bg-gray-500 rounded-full mr-3"></div>
                <p className="text-gray-700">
                  <strong>Subscription Cancelled:</strong> Access continues until {formatDate(subscription.endDate)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {subscription.status !== 'CANCELLED' && (
            <>
              <button
                onClick={handleRenew}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Renew Subscription
              </button>
              <button
                onClick={handleChangePlan}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                Change Plan
              </button>
              {subscription.status === 'ACTIVE' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-6 py-3 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 font-medium"
                >
                  Cancel
                </button>
              )}
            </>
          )}

          {subscription.status === 'CANCELLED' && (
            <button
              onClick={handleRenew}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Reactivate Subscription
            </button>
          )}

          {subscription.status === 'EXPIRED' && (
            <button
              onClick={handleRenew}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Renew Now
            </button>
          )}
        </div>
      </div>

      {/* Plan Features */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-xl font-semibold mb-4">Your Plan Includes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Unlimited Properties</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Unlimited Tenants</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Invoice Generation</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Payment Tracking</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Complaint Management</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Dashboard Analytics</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Email Support</span>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Mobile Access</span>
          </div>
          
          {subscription.planId.startsWith('PRO') && (
            <>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Priority Support</span>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Advanced Analytics</span>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">API Access</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel Subscription?</h3>
            <p className="text-gray-600 mb-4">
              Your subscription will be cancelled, but you will retain access until {formatDate(subscription.endDate)}.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              You can reactivate anytime before the end date.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionDashboard;
