import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amountPaise: number;
  durationMonths: number;
  isActive: boolean;
}

const SubscriptionPlans = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get('/subscriptions/plans');
      setPlans(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  };

  const getMonthlyPrice = (plan: SubscriptionPlan) => {
    return Math.round(plan.amountPaise / plan.durationMonths / 100);
  };

  const handleSelectPlan = async (planId: string) => {
    setProcessingPlan(planId);
    try {
      // Initiate payment
      const res = await api.post('/subscriptions/initiate-payment', { planId });
      const { orderId, amount, currency, keyId, plan } = res.data;

      // Load Razorpay script if not already loaded
      const script = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (!script) {
        const razorpayScript = document.createElement('script');
        razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
        razorpayScript.async = true;
        document.body.appendChild(razorpayScript);
        
        await new Promise((resolve, reject) => {
          razorpayScript.onload = resolve;
          razorpayScript.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        });
      }

      // Open Razorpay checkout
      const options = {
        key: keyId,
        amount: amount,
        currency: currency,
        name: 'PG Management',
        description: `Subscription: ${plan.name}`,
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
              // Payment verified - webhook will create subscription automatically
              // Just redirect to success page
              navigate('/subscription-success');
            } else {
              setError('Payment verification failed. Please contact support.');
              setProcessingPlan(null);
            }
          } catch (err: any) {
            setError(err.response?.data?.message || 'Payment verification failed');
            setProcessingPlan(null);
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
            setProcessingPlan(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate payment');
      setProcessingPlan(null);
    }
  };

  const getFilteredPlans = () => {
    return plans.filter(plan => {
      if (billingCycle === 'monthly') {
        return plan.durationMonths === 1;
      } else {
        return plan.durationMonths === 12;
      }
    });
  };

  const getPlanFeatures = (planId: string) => {
    const basicFeatures = [
      'Unlimited Properties',
      'Unlimited Tenants',
      'Invoice Generation',
      'Payment Tracking',
      'Complaint Management',
      'Dashboard Analytics',
      'Email Support',
      'Mobile Access',
    ];

    const proFeatures = [
      ...basicFeatures,
      'Priority Support',
      'Advanced Analytics',
      'Custom Reports',
      'Bulk Operations',
      'API Access',
      'Multi-user Management',
      'Automated Reminders',
    ];

    return planId.startsWith('PRO') ? proFeatures : basicFeatures;
  };

  const getSavingsText = (plan: SubscriptionPlan) => {
    if (plan.durationMonths === 12) {
      const monthlyEquivalent = getMonthlyPrice(plan);
      const regularMonthly = plan.id.startsWith('PRO') ? 10000 : 5000;
      const savings = ((regularMonthly - monthlyEquivalent) / regularMonthly * 100).toFixed(0);
      return `Save ${savings}% (2 months free)`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading plans...</p>
        </div>
      </div>
    );
  }

  const filteredPlans = getFilteredPlans();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600 mb-8">
            Select the perfect plan for your PG management needs
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-white rounded-lg shadow p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded max-w-4xl mx-auto">
            {error}
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {filteredPlans.map((plan) => {
            const isPro = plan.id.startsWith('PRO');
            const features = getPlanFeatures(plan.id);
            const savingsText = getSavingsText(plan);

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl shadow-xl overflow-hidden transition-transform hover:scale-105 ${
                  isPro ? 'ring-2 ring-blue-600' : ''
                }`}
              >
                {isPro && (
                  <div className="bg-blue-600 text-white text-center py-2 text-sm font-medium">
                    MOST POPULAR
                  </div>
                )}

                <div className="p-8">
                  {/* Plan Header */}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    {savingsText && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full font-medium">
                        {savingsText}
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-center mb-6">
                    <div className="flex items-baseline justify-center">
                      <span className="text-5xl font-bold text-gray-900">
                        {formatAmount(plan.amountPaise)}
                      </span>
                      <span className="text-gray-600 ml-2">
                        / {plan.durationMonths === 1 ? 'month' : 'year'}
                      </span>
                    </div>
                    {plan.durationMonths === 12 && (
                      <p className="text-sm text-gray-600 mt-2">
                        ₹{getMonthlyPrice(plan).toLocaleString('en-IN')} per month
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="mb-8">
                    <ul className="space-y-3">
                      {features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <svg
                            className={`w-5 h-5 ${isPro ? 'text-blue-600' : 'text-green-500'} mr-3 mt-0.5 flex-shrink-0`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={processingPlan === plan.id}
                    className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                      isPro
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {processingPlan === plan.id ? (
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
                      'Select Plan'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Back Button */}
        <div className="text-center mt-12">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Go Back
          </button>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold mb-2">Can I change my plan later?</h3>
              <p className="text-gray-600">
                Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold mb-2">What happens if my subscription expires?</h3>
              <p className="text-gray-600">
                You'll have a 7-day grace period to renew. During this time, you'll retain full access to the platform.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="font-semibold mb-2">Can I cancel my subscription?</h3>
              <p className="text-gray-600">
                Yes, you can cancel anytime. You'll continue to have access until the end of your billing period.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
