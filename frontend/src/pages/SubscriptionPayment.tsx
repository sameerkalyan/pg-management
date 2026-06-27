import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Plan {
  id: string;
  name: string;
  description: string;
  amountPaise: number;
  durationMonths: number;
}

interface PaymentResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: Plan;
}

const SubscriptionPayment = () => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      const response = await api.get('/subscriptions/plans/BASIC_MONTHLY');
      setPlan(response.data);
    } catch (err: any) {
      setError('Failed to load subscription plan');
    } finally {
      setLoading(false);
    }
  };

  const initiatePayment = async () => {
    setProcessing(true);
    setError('');

    try {
      const response = await api.post<PaymentResponse>('/subscriptions/initiate-payment', {
        planId: 'BASIC_MONTHLY',
      });

      const { orderId, keyId, amount } = response.data;

      // SWE-15/SWE-67 — Load Razorpay script (idempotent — check if already loaded)
      const scriptId = 'razorpay-checkout-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      let onLoadHandler: (() => void) | null = null;
      let onErrorHandler: (() => void) | null = null;

      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;

        // SWE-16 — attach onload/onerror BEFORE appending to avoid race condition
        onLoadHandler = () => openRazorpay({ orderId, keyId, amount });
        onErrorHandler = () => {
          setError('Failed to load payment gateway');
          setProcessing(false);
        };
        script.onload = onLoadHandler;
        script.onerror = onErrorHandler;
        document.body.appendChild(script);
      } else {
        // SWE-15 — script already in DOM, just attach a new onload to trigger checkout
        // (script may already have loaded — open checkout if Razorpay global is available)
        if ((window as any).Razorpay) {
          openRazorpay({ orderId, keyId, amount });
        } else {
          // script tag exists but Razorpay hasn't loaded yet
          const previousOnload = script.onload;
          script.onload = () => {
            if (typeof previousOnload === 'function') {
              (previousOnload as any).call(script);
            }
            openRazorpay({ orderId, keyId, amount });
          };
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate payment');
      setProcessing(false);
    }
  };

  const openRazorpay = ({
    orderId,
    keyId,
    amount,
  }: {
    orderId: string;
    keyId: string;
    amount: number;
  }) => {
    const options = {
      key: keyId,
      amount: amount,
      currency: 'INR',
      name: 'PG Management',
      description: plan?.name,
      order_id: orderId,
      handler: async function (response: any) {
        try {
          const verifyResponse = await api.post('/payments/verify', {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });

          if (verifyResponse.data?.verified === true) {
            handlePaymentSuccess(response);
          } else {
            setError('Payment verification failed');
            setProcessing(false);
          }
        } catch (error) {
          setError('Payment verification failed');
          setProcessing(false);
        }
      },
      prefill: {
        name: user?.name || user?.firstName || '',
        email: user?.email || '',
        contact: user?.phoneNumber || '',
      },
      theme: {
        color: '#3B82F6',
      },
      modal: {
        ondismiss: function () {
          setProcessing(false);
        },
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  const handlePaymentSuccess = async (response: any) => {
    try {
      // Create subscription after successful payment verification
      // The verify endpoint now returns paymentId
      const verifyResponse = await api.post('/payments/verify', {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });

      if (verifyResponse.data?.verified !== true) {
        setError('Payment verification failed');
        setProcessing(false);
        return;
      }

      const paymentId = verifyResponse.data?.paymentId;

      await api.post('/subscriptions/create', {
        planId: 'BASIC_MONTHLY',
        paymentMethod: 'RAZORPAY',
        paymentId: paymentId,
      });

      // Clear subscription cache by waiting a moment
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify subscription is active
      const statusResponse = await api.get('/subscriptions/my-subscription/status');
      if (statusResponse.data.hasActiveSubscription) {
        setProcessing(false);
        // Redirect to pending-approval since org still needs admin approval
        navigate('/pending-approval');
      } else {
        setError('Payment successful but subscription not activated. Please contact support.');
        setProcessing(false);
      }
    } catch (err: any) {
      setError('Payment successful but failed to activate subscription. Please contact support with your payment ID: ' + (response.razorpay_payment_id || 'N/A'));
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-2">Complete Your Registration</h1>
        <p className="text-center text-gray-600 mb-8">Subscribe to activate your account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {plan && (
          <div className="border rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  ₹{(plan.amountPaise / 100).toLocaleString('en-IN')}
                  <span className="text-sm font-normal text-gray-500">/month</span>
                </p>
              </div>
              <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {plan.durationMonths} Month{plan.durationMonths > 1 ? 's' : ''}
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Features:</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{plan.description}</p>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Payment Information:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Secure payment via Razorpay</li>
                <li>Supports UPI, Cards, Net Banking, Wallets</li>
                <li>Subscription activates immediately after payment</li>
                <li>Your account will be reviewed and approved by admin</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={initiatePayment}
          disabled={processing || !plan}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-semibold text-lg transition-colors"
        >
          {processing ? 'Processing...' : `Pay ₹${plan ? (plan.amountPaise / 100).toLocaleString('en-IN') : '0'}`}
        </button>

        <p className="text-center text-sm text-gray-500 mt-4">
          By proceeding, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default SubscriptionPayment;
