import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amountPaise: number;
  dueDate: string;
  status: string;
  billingDate: string;
}

interface Payment {
  id: string;
  amountPaise: number;
  method: string;
  status: string;
  createdAt: string;
}

interface TenantProfile {
  id: string;
  firstName: string;
  lastName?: string;
  phoneNumber: string;
  email?: string;
  status: string;
  checkInDate: string;
  checkOutDate?: string;
  securityDeposit?: number;
  securityDepositStatus?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  photoUrl?: string;
  idProofUrl?: string;
  idProofType?: string;
  bed?: {
    id: string;
    bedNumber: string;
    room?: {
      id: string;
      roomNumber: string;
      property?: {
        id: string;
        name: string;
      };
    };
  };
}

const TenantPortal = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    phoneNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [razorpayScriptLoaded, setRazorpayScriptLoaded] = useState(false);
  const [razorpayScriptLoading, setRazorpayScriptLoading] = useState(false);

  useEffect(() => {
    fetchTenantData();
  }, []);

  const fetchTenantData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [profileRes, invoicesRes, paymentsRes] = await Promise.allSettled([
        api.get('/tenants/me'),
        api.get('/invoices/my-invoices'),
        api.get('/payments/my-payments'),
      ]);

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value.data);
        setEditForm({
          phoneNumber: profileRes.value.data.phoneNumber || '',
          emergencyContactName: profileRes.value.data.emergencyContactName || '',
          emergencyContactPhone: profileRes.value.data.emergencyContactPhone || '',
        });
      }
      if (invoicesRes.status === 'fulfilled') {
        setInvoices(invoicesRes.value.data?.data || invoicesRes.value.data || []);
      }
      if (paymentsRes.status === 'fulfilled') {
        setPayments(paymentsRes.value.data?.data || paymentsRes.value.data || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load tenant data');
      console.error('Error fetching tenant data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string, amountPaise: number) => {
    // Validate invoice before initiating payment
    if (!invoiceId || amountPaise <= 0) {
      setError('Invalid invoice data. Please refresh and try again.');
      return;
    }

    setPayingInvoice(invoiceId);
    setError(null);

    try {
      // Initiate payment
      const res = await api.post('/payments/initiate-tenant-payment', { 
        invoiceId,
        amountPaise 
      });
      const { orderId, amount, currency, keyId } = res.data;

      // Load Razorpay script if not already loaded
      if (!razorpayScriptLoaded && !razorpayScriptLoading) {
        setRazorpayScriptLoading(true);
        const razorpayScript = document.createElement('script');
        razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
        razorpayScript.async = true;
        document.body.appendChild(razorpayScript);
        
        await new Promise((resolve, reject) => {
          razorpayScript.onload = () => {
            setRazorpayScriptLoaded(true);
            setRazorpayScriptLoading(false);
            resolve(true);
          };
          razorpayScript.onerror = () => {
            setRazorpayScriptLoading(false);
            reject(new Error('Failed to load Razorpay SDK'));
          };
        });
      } else if (razorpayScriptLoading) {
        // Wait for existing script load
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (razorpayScriptLoaded || !razorpayScriptLoading) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);
        });
      }

      // Open Razorpay checkout
      const options = {
        key: keyId,
        amount: amount,
        currency: currency,
        name: 'PG Management',
        description: `Payment for Invoice`,
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
              setSuccess('Payment successful! Invoice updated.');
              setTimeout(() => setSuccess(null), 5000);
              fetchTenantData(); // Refresh data
            } else {
              setError('Payment verification failed. Please contact support.');
            }
          } catch (err: any) {
            setError(err.response?.data?.message || 'Payment verification failed');
          } finally {
            setPayingInvoice(null);
          }
        },
        prefill: {
          name: profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : '',
          email: profile?.email || user?.email || '',
          contact: profile?.phoneNumber || '',
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          ondismiss: function () {
            setPayingInvoice(null);
            setError(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate payment');
      setPayingInvoice(null);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setError(null);
      await api.patch('/tenants/me', editForm);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 5000);
      setEditMode(false);
      fetchTenantData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
  };

  const getBillingPeriod = (billingDate: string) => {
    return new Date(billingDate).toLocaleDateString('en-IN', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const response = await api.get(`/pdf/invoice/${invoiceId}`, {
        responseType: 'blob',
      });
      
      // Create a blob URL and download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download invoice PDF');
    }
  };

  const totalDue = invoices
    .filter((i) => i.status !== 'PAID')
    .reduce((sum, i) => sum + i.amountPaise, 0);
  const paidThisMonth = payments
    .filter((p) => {
      const d = new Date(p.createdAt);
      const now = new Date();
      return p.status === 'COMPLETED' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const pendingCount = invoices.filter((i) => i.status !== 'PAID').length;

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700">Total Due</h3>
          <p className="text-3xl font-bold text-red-600 mt-2">₹{(totalDue / 100).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700">Paid This Month</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">₹{(paidThisMonth / 100).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700">Pending Invoices</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">{pendingCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Invoices</h3>
        {invoices.length === 0 ? (
          <p className="text-gray-500">No invoices yet</p>
        ) : (
          <div className="space-y-3">
            {invoices.slice(0, 5).map((invoice) => (
              <div key={invoice.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium">{invoice.invoiceNumber}</p>
                  <p className="text-sm text-gray-500">Due: {new Date(invoice.dueDate).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">₹{(invoice.amountPaise / 100).toLocaleString('en-IN')}</p>
                  <span className={`text-xs px-2 py-1 rounded ${
                    invoice.status === 'PAID' ? 'bg-green-100 text-green-800' :
                    invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderInvoices = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">All Invoices</h3>
      {invoices.length === 0 ? (
        <p className="text-gray-500">No invoices found</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex justify-between items-center p-4 border rounded">
              <div>
                <p className="font-medium">{invoice.invoiceNumber}</p>
                <p className="text-sm text-gray-500">Billing Period: {getBillingPeriod(invoice.billingDate)}</p>
                <p className="text-sm text-gray-500">Due: {new Date(invoice.dueDate).toLocaleDateString()}</p>
              </div>
              <div className="text-right flex items-center gap-4">
                <div>
                  <p className="font-bold">₹{(invoice.amountPaise / 100).toLocaleString('en-IN')}</p>
                  <span className={`text-xs px-2 py-1 rounded ${
                    invoice.status === 'PAID' ? 'bg-green-100 text-green-800' :
                    invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {invoice.status}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleDownloadInvoice(invoice.id, invoice.invoiceNumber)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                  >
                    Download PDF
                  </button>
                  {invoice.status !== 'PAID' && (
                    <button
                      onClick={() => handlePayInvoice(invoice.id, invoice.amountPaise)}
                      disabled={payingInvoice === invoice.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {payingInvoice === invoice.id ? 'Processing...' : 'Pay Now'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPayments = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Payment History</h3>
      {payments.length === 0 ? (
        <p className="text-gray-500">No payments found</p>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="flex justify-between items-center p-4 border rounded">
              <div>
                <p className="font-medium">{payment.method}</p>
                <p className="text-sm text-gray-500">{new Date(payment.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">₹{(payment.amountPaise / 100).toLocaleString('en-IN')}</p>
                <span className={`text-xs px-2 py-1 rounded ${
                  payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                  payment.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {payment.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">My Profile</h3>
        {!editMode ? (
          <button
            onClick={() => setEditMode(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleUpdateProfile}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save Changes
            </button>
            <button
              onClick={() => {
                setEditMode(false);
                setEditForm({
                  phoneNumber: profile?.phoneNumber || '',
                  emergencyContactName: profile?.emergencyContactName || '',
                  emergencyContactPhone: profile?.emergencyContactPhone || '',
                });
              }}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {profile ? (
        <div className="space-y-4">
          {profile.photoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={profile.photoUrl}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-gray-900">{profile.firstName} {profile.lastName || ''}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <p className="mt-1">
                <span className={`text-xs px-2 py-1 rounded ${
                  profile.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                  profile.status === 'INACTIVE' ? 'bg-gray-100 text-gray-800' :
                  profile.status === 'EVICTED' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {profile.status}
                </span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-gray-900">{profile.email || user?.email || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              {editMode ? (
                <input
                  type="text"
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.phoneNumber || 'N/A'}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Property</label>
              <p className="mt-1 text-gray-900">{profile.bed?.room?.property?.name || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Bed</label>
              <p className="mt-1 text-gray-900">{profile.bed?.bedNumber || 'N/A'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Check-in Date</label>
              <p className="mt-1 text-gray-900">
                {profile.checkInDate ? new Date(profile.checkInDate).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Security Deposit</label>
              <p className="mt-1 text-gray-900">
                {profile.securityDeposit ? `₹${profile.securityDeposit.toLocaleString('en-IN')}` : 'N/A'}
                {profile.securityDepositStatus && (
                  <span className="ml-2 text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                    {profile.securityDepositStatus}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Emergency Contact Name</label>
              {editMode ? (
                <input
                  type="text"
                  value={editForm.emergencyContactName}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.emergencyContactName || 'N/A'}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Emergency Contact Phone</label>
              {editMode ? (
                <input
                  type="text"
                  value={editForm.emergencyContactPhone}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              ) : (
                <p className="mt-1 text-gray-900">{profile.emergencyContactPhone || 'N/A'}</p>
              )}
            </div>
          </div>
          {profile.idProofUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700">ID Proof</label>
              <a
                href={profile.idProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-blue-600 hover:underline"
              >
                View ID Proof ({profile.idProofType || 'Document'})
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-500">Loading profile...</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">Tenant Portal</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{profile ? `${profile.firstName} ${profile.lastName || ''}` : user?.email}</span>
              <button
                onClick={() => {
                  localStorage.removeItem('accessToken');
                  window.location.href = '/login';
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-4 mb-6">
          {['dashboard', 'invoices', 'payments', 'profile'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Success/Error Messages */}
        {error && !loading && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded relative">
            <button
              onClick={() => setError(null)}
              className="absolute top-0 right-0 p-4 text-red-800 hover:text-red-900"
            >
              ×
            </button>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded relative">
            <button
              onClick={() => setSuccess(null)}
              className="absolute top-0 right-0 p-4 text-green-800 hover:text-green-900"
            >
              ×
            </button>
            {success}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'invoices' && renderInvoices()}
            {activeTab === 'payments' && renderPayments()}
            {activeTab === 'profile' && renderProfile()}
          </>
        )}
      </div>
    </div>
  );
};

export default TenantPortal;
