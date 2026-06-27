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
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amountPaise: number;
  durationMonths: number;
  isActive: boolean;
}

const SubscriptionRenewal = () => {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    fetchSubscription();
    fetchPlans();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/subscriptions/my-subscription');
      setSubscription(res.data);
      setSelectedPlanId(res.data.planId); // Default to current plan
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await api.get('/subscriptions/plans');
      setPlans(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load plans');
    }
  };

  const formatAmount = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getPlanName = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    return plan?.name || planId;
  };

  const getSelectedPlan = () => {
    return plans.find(p => p.id === selectedPlanId);
  };

  const handleRenew = async () => {
    if (!subscription || !selectedPlanId) return;

    setProcessing(true);
    setError(null);

    try {
      // Initiate payment for renewal
      const res = await api.post('/subscriptions/initiate-payment', { 
        planId: selectedPlanId 
      });
      const { orderId, amount, currency, keyId, plan } = res.data;

      // Load Razorpay script if not already loaded
      if (!scriptLoaded && !scriptLoading) {
        setScriptLoading(true);
        const script = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
        if (!script) {
          const razorpayScript = document.createElement('script');
          razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
          razorpayScript.async = true;
          document.body.appendChild(razorpayScript);
          
          await new Promise((resolve, reject) => {
            razorpayScript.onload = () => {
              setScriptLoaded(true);
              setScriptLoading(false);
              resolve(null);
            };
            razorpayScript.onerror = () => {
              setScriptLoading(false);
              reject(new Error('Failed to load Razorpay SDK'));
            };
          });
        } else {
          setScriptLoaded(true);
          setScriptLoading(false);
        }
      }

      // Open Razorpay checkout
      const options = {
        key: keyId,
        amount: amount,
        currency: currency,
        name: 'PG Management',
        description: `Renewal: ${plan.name}`,
        order_id: orderId,
        handler: async function (response: any) {
          try {
            // Verify payment
            const verifyRes = await api.post('/payments/verify', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.data.verified) {
              // Get the payment ID from verification response
              const paymentId = verifyRes.data?.paymentId;
              
              // Call renew with paymentId
              await api.post(`/subscriptions/${subscription.id}/renew`, {
                planId: selectedPlanId,
                paymentId: paymentId,
              });

              // Redirect to success
              navigate('/subscription-success?renewed=true');
            } else {
              setError('Payment verification failed. Please contact support.');
              setProcessing(false);
            }
          } catch (err: any) {
            setError(err.response?.data?.message || 'Renewal failed');
            setProcessing(false);
          }
        },
        prefill: {
          name: '',
          email: '',
          contact: '',
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          ondismiss: function () {
            setProcessing(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate renewal');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">No Subscription Found</h2>
          <p className="text-yellow-700 mb-4">Please subscribe first.</p>
          <button
            onClick={() => navigate('/subscription-plans')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Plans
          </button>
        </div>
      </div>
    );
  }

  const selectedPlan = getSelectedPlan();
  const isUpgrade = selectedPlan && selectedPlan.amountPaise > subscription.amountPaise;
  const isDowngrade = selectedPlan && selectedPlan.amountPaise < subscription.amountPaise;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/subscription-dashboard')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Renew Subscription</h1>
          <p className="text-gray-600 mt-2">Choose a plan to renew your subscription</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Current Subscription Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Current Subscription</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Plan</p>
              <p className="font-semibold">{getPlanName(subscription.planId)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Amount</p>
              <p className="font-semibold">{formatAmount(subscription.amountPaise)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-semibold">{subscription.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">End Date</p>
              <p className="font-semibold">{formatDate(subscription.endDate)}</p>
            </div>
          </div>
        </div>

        {/* Plan Selection */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6">Select Plan</h2>
          
          <div className="space-y-4">
            {plans.map((plan) => {
              const isCurrentPlan = plan.id === subscription.planId;
              const isSelected = plan.id === selectedPlanId;
              const monthlyPrice = plan.durationMonths === 12 
                ? Math.round(plan.amountPaise / 12 / 100) 
                : null;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1">
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedPlanId(plan.id)}
                        className="mt-1 mr-4"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold">{plan.name}</h3>
                          {isCurrentPlan && (
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              Current
                            </span>
                          )}
                          {plan.durationMonths === 12 && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              Save 17%
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{plan.description}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-gray-900">
                            {formatAmount(plan.amountPaise)}
                          </span>
                          <span className="text-gray-600">
                            / {plan.durationMonths === 1 ? 'month' : 'year'}
                          </span>
                          {monthlyPrice && (
                            <span className="text-sm text-gray-500">
                              (₹{monthlyPrice.toLocaleString('en-IN')}/mo)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Change Indicator */}
          {selectedPlanId !== subscription.planId && (
            <div className={`mt-6 p-4 rounded-lg ${
              isUpgrade ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'
            }`}>
              <p className={`font-medium ${isUpgrade ? 'text-blue-800' : 'text-orange-800'}`}>
                {isUpgrade && '⬆️ Upgrading your plan'}
                {isDowngrade && '⬇️ Downgrading your plan'}
              </p>
              <p className={`text-sm mt-1 ${isUpgrade ? 'text-blue-700' : 'text-orange-700'}`}>
                Your new plan will start after payment confirmation
              </p>
            </div>
          )}
        </div>

        {/* Summary */}
        {selectedPlan && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Renewal Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Selected Plan</span>
                <span className="font-semibold">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Duration</span>
                <span className="font-semibold">
                  {selectedPlan.durationMonths === 1 ? '1 Month' : '12 Months'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Current End Date</span>
                <span className="font-semibold">{formatDate(subscription.endDate)}</span>
              </div>
              <div className="flex justify-between pt-3 border-t">
                <span className="text-lg font-semibold">Total Amount</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatAmount(selectedPlan.amountPaise)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/subscription-dashboard')}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={!selectedPlanId || processing}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              'Proceed to Payment'
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Important Information</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Payment will be processed securely via Razorpay</li>
            <li>• Your subscription will be extended immediately after payment</li>
            <li>• You will receive a confirmation email</li>
            <li>• If you change plans, the new plan takes effect immediately</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionRenewal;
