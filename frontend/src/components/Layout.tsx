import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Shield,
  UserCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'accountant'] },
  { label: 'Properties', path: '/properties', icon: Building2, roles: ['owner', 'manager'] },
  { label: 'Rooms', path: '/rooms', icon: DoorOpen, roles: ['owner', 'manager'] },
  { label: 'Tenants', path: '/tenants', icon: Users, roles: ['owner', 'manager'] },
  { label: 'Invoices', path: '/invoices', icon: FileText, roles: ['owner', 'manager', 'accountant'] },
  { label: 'Payments', path: '/payments', icon: CreditCard, roles: ['owner', 'manager', 'accountant'] },
  { label: 'Complaints', path: '/complaints', icon: MessageSquare, roles: ['owner', 'manager'] },
  { label: 'Team', path: '/users', icon: Users, roles: ['owner', 'manager'] },
];

const settingsItems: NavItem[] = [
  { label: 'Organisation', path: '/organisation/settings', icon: Settings, roles: ['owner'] },
  { label: 'My Profile', path: '/profile', icon: UserCircle, roles: ['owner', 'manager', 'accountant'] },
];

const adminNavItems: NavItem[] = [
  { label: 'Admin Dashboard', path: '/admin', icon: Shield, roles: ['super_admin'] },
];

interface LayoutProps {
  children: React.ReactNode;
  variant?: 'app' | 'admin';
}

const Layout = ({ children, variant = 'app' }: LayoutProps) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const items = variant === 'admin' ? adminNavItems : navItems;
  const filteredItems = items.filter((item) =>
    item.roles.includes(user?.role || ''),
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-800 text-white transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } flex flex-col`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Building2 size={24} className="text-blue-400" />
            <span className="font-bold text-lg">PG Manager</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {/* Main Navigation */}
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}

          {/* Settings Section */}
          {settingsItems.filter((item) => item.roles.includes(user?.role?.toLowerCase() || '')).length > 0 && (
            <>
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Settings</p>
              </div>
              {settingsItems
                .filter((item) => item.roles.includes(user?.role?.toLowerCase() || ''))
                .map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon size={20} />
                      {item.label}
                    </Link>
                  );
                })}
            </>
          )}
        </nav>

        <div className="border-t border-slate-700 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center">
              <UserCircle size={20} className="text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-semibold text-gray-800 hidden sm:block">
            {filteredItems.find((item) => isActive(item.path))?.label || 'PG Management'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:block">{user?.email}</span>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
