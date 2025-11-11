import Component from './Component.js';

/**
 * Navigation Sidebar Component
 */
class NavigationSidebar extends Component {
  constructor(props) {
    super(props);
    this.currentView = props.currentView || 'dashboard';
  }

  render() {
    return `
      <div class="flex items-center space-x-3 mb-8">
        <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
          <i data-lucide="trending-up" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <h1 class="text-white font-bold text-lg">Simplifyed</h1>
          <p class="text-slate-400 text-sm">Trading Dashboard</p>
        </div>
      </div>

      <nav class="space-y-2" role="navigation" aria-label="Main navigation">
        <a href="#" onclick="showView('dashboard')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'dashboard' ? 'active' : ''}" aria-label="Dashboard">
          <i data-lucide="layout-dashboard" class="w-5 h-5" aria-hidden="true"></i>
          <span>Dashboard</span>
        </a>

        <a href="#" onclick="showView('watchlists')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'watchlists' ? 'active' : ''}" aria-label="Watchlists">
          <i data-lucide="list" class="w-5 h-5" aria-hidden="true"></i>
          <span>Watchlists</span>
        </a>

        <a href="#" onclick="showView('orders')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'orders' ? 'active' : ''}" aria-label="Orders">
          <i data-lucide="clipboard-list" class="w-5 h-5" aria-hidden="true"></i>
          <span>Orders</span>
        </a>

        <a href="#" onclick="showView('positions')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'positions' ? 'active' : ''}" aria-label="Positions">
          <i data-lucide="trending-up" class="w-5 h-5" aria-hidden="true"></i>
          <span>Positions</span>
        </a>

        <a href="/scalper-terminal.html" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200" aria-label="Scalper Terminal">
          <i data-lucide="zap" class="w-5 h-5" aria-hidden="true"></i>
          <span>Scalper Terminal</span>
        </a>

        <a href="#" onclick="showView('admin')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'admin' ? 'active' : ''}" aria-label="Admin Panel">
          <i data-lucide="settings" class="w-5 h-5" aria-hidden="true"></i>
          <span>Admin</span>
        </a>

        <a href="#" onclick="showView('users')" class="nav-item flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200 ${this.currentView === 'users' ? 'active' : ''}" aria-label="User Management">
          <i data-lucide="users" class="w-5 h-5" aria-hidden="true"></i>
          <span>Users</span>
        </a>
      </nav>

      <div class="absolute bottom-6 left-6 right-6">
        <div class="pt-6 border-t border-slate-700/50">
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
              <i data-lucide="user" class="w-5 h-5 text-white"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-white font-medium truncate" id="user-name">Loading...</p>
              <p class="text-slate-400 text-sm truncate" id="user-email">loading@example.com</p>
            </div>
          </div>
          <button onclick="logout()" class="w-full flex items-center space-x-2 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all duration-200">
            <i data-lucide="log-out" class="w-5 h-5"></i>
            <span>Logout</span>
          </button>
        </div>
      </div>
    `;
  }

  updateActiveView(view) {
    this.currentView = view;
    this.setState({ currentView: view });
  }
}

export default NavigationSidebar;
