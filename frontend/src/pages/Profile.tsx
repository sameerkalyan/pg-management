import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role: string;
  status: string;
  organisation?: {
    name: string;
    status: string;
  };
  createdAt: string;
}

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    avatarUrl: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/users/me');
      const profileData = res.data;
      setProfile(profileData);
      setForm({
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        phoneNumber: profileData.phoneNumber || '',
        avatarUrl: profileData.avatarUrl || '',
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await api.put(`/users/${profile.id}/profile`, form);
      setSuccess('Profile updated successfully');
      setProfile(res.data);
      setEditMode(false);
      
      // Update auth context if needed
      if (updateUser) {
        updateUser({
          ...user,
          firstName: form.firstName,
          lastName: form.lastName,
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setForm({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phoneNumber: profile.phoneNumber || '',
        avatarUrl: profile.avatarUrl || '',
      });
      setEditMode(false);
      setError(null);
      setSuccess(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-100 text-purple-800';
      case 'MANAGER': return 'bg-blue-100 text-blue-800';
      case 'ACCOUNTANT': return 'bg-green-100 text-green-800';
      case 'TENANT': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600">Failed to load profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600 mt-1">Manage your personal information</p>
        </div>

        {/* Success/Error Messages */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded relative">
            <button
              onClick={() => setError(null)}
              className="absolute top-0 right-0 p-4"
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
              className="absolute top-0 right-0 p-4"
            >
              ×
            </button>
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Summary Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                {/* Avatar */}
                <div className="mb-4">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt="Profile"
                      className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-gray-200"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full mx-auto bg-blue-100 flex items-center justify-center border-4 border-gray-200">
                      <span className="text-3xl font-bold text-blue-600">
                        {profile.firstName.charAt(0)}{profile.lastName?.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {profile.firstName} {profile.lastName}
                </h2>

                {/* Email */}
                <p className="text-sm text-gray-600 mb-3">{profile.email}</p>

                {/* Role Badge */}
                <div className="mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(profile.role)}`}>
                    {profile.role}
                  </span>
                </div>

                {/* Organisation Info */}
                {profile.organisation && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-gray-500 mb-1">Organisation</p>
                    <p className="text-sm font-semibold text-gray-900">{profile.organisation.name}</p>
                  </div>
                )}

                {/* Member Since */}
                <div className="pt-4 border-t mt-4">
                  <p className="text-xs text-gray-500 mb-1">Member Since</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Details Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                  {!editMode && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="space-y-6">
                  {/* First Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    {editMode ? (
                      <input
                        type="text"
                        required
                        maxLength={50}
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 py-2">{profile.firstName}</p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    {editMode ? (
                      <input
                        type="text"
                        required
                        maxLength={50}
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 py-2">{profile.lastName}</p>
                    )}
                  </div>

                  {/* Email (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <p className="text-gray-900 py-2 bg-gray-50 px-3 rounded-md">{profile.email}</p>
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    {editMode ? (
                      <>
                        <input
                          type="tel"
                          maxLength={20}
                          value={form.phoneNumber}
                          onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="+91-9876543210"
                        />
                        <p className="text-xs text-gray-500 mt-1">Use format: +91-XXXXXXXXXX or (XXX) XXX-XXXX</p>
                      </>
                    ) : (
                      <p className="text-gray-900 py-2">{profile.phoneNumber || '-'}</p>
                    )}
                  </div>

                  {/* Avatar URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Avatar URL
                    </label>
                    {editMode ? (
                      <>
                        <input
                          type="url"
                          maxLength={500}
                          value={form.avatarUrl}
                          onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="https://example.com/avatar.jpg"
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter a URL to your profile picture</p>
                      </>
                    ) : (
                      <p className="text-gray-900 py-2">{profile.avatarUrl || '-'}</p>
                    )}
                  </div>

                  {/* Role (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    <p className="py-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(profile.role)}`}>
                        {profile.role}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Your role is assigned by the owner</p>
                  </div>

                  {/* Action Buttons */}
                  {editMode && (
                    <div className="flex gap-4 pt-4 border-t">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving}
                        className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ Profile Tips</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Keep your contact information up-to-date for important notifications</li>
            <li>Your email address cannot be changed for security reasons</li>
            <li>Phone number should include country code (e.g., +91 for India)</li>
            <li>Avatar URL should point to a publicly accessible image</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Profile;
