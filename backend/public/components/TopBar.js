/**
 * TopBar Component
 *
 * Top navigation bar with user menu, notifications, and global search.
 */

import Component from './Component.js';
import store from '../lib/store.js';

class TopBar extends Component {
  constructor(props = {}) {
    super(props);

    this.state = {
      user: null,
      isAdmin: false,
      searchQuery: '',
      showUserMenu: false,
      showNotifications: false,
      notifications: []
    };

    // Subscribe to store changes
    this.unsubscribe = store.subscribe((newState) => {
      if (newState.user !== this.state.user || newState.isAdmin !== this.state.isAdmin) {
        this.setState({
          user: newState.user,
          isAdmin: newState.isAdmin
        });
      }
    });
  }

  render() {
    const { user, isAdmin, searchQuery, showUserMenu, showNotifications, notifications } = this.state;

    return `
      <div class="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-6 py-4">
        <div class="flex items-center justify-between">
          <!-- Left: Search -->
          <div class="flex-1 max-w-xl">
            <div class="relative">
              <input
                type="text"
                id="global-search"
                placeholder="Search instances, watchlists, symbols..."
                value="${searchQuery}"
                class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <i data-lucide="search" class="absolute left-3 top-2.5 w-5 h-5 text-slate-400"></i>
            </div>
          </div>

          <!-- Right: User Menu -->
          <div class="flex items-center space-x-4 ml-6">
            <!-- Notifications -->
            <div class="relative">
              <button
                id="notifications-btn"
                class="relative p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <i data-lucide="bell" class="w-5 h-5"></i>
                ${notifications.length > 0 ? `
                  <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                ` : ''}
              </button>

              <!-- Notifications Dropdown -->
              ${showNotifications ? `
                <div class="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                  <div class="p-4 border-b border-slate-700">
                    <h3 class="font-semibold text-white">Notifications</h3>
                  </div>
                  <div class="max-h-96 overflow-y-auto">
                    ${notifications.length === 0 ? `
                      <div class="p-4 text-center text-slate-400">
                        No new notifications
                      </div>
                    ` : notifications.map(n => `
                      <div class="p-4 border-b border-slate-700 hover:bg-slate-700/50">
                        <div class="text-sm text-white">${n.title}</div>
                        <div class="text-xs text-slate-400 mt-1">${n.message}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- User Menu -->
            <div class="relative">
              <button
                id="user-menu-btn"
                class="flex items-center space-x-3 p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                  <span class="text-white text-sm font-semibold">
                    ${user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </span>
                </div>
                <div class="text-left hidden md:block">
                  <div class="text-sm font-medium text-white">
                    ${user?.name || 'User'}
                  </div>
                  <div class="text-xs text-slate-400">
                    ${isAdmin ? 'Administrator' : 'User'}
                  </div>
                </div>
                <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400"></i>
              </button>

              <!-- User Dropdown -->
              ${showUserMenu ? `
                <div class="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                  <div class="p-2">
                    <div class="px-3 py-2 text-xs text-slate-400">
                      ${user?.email || 'user@example.com'}
                    </div>
                  </div>
                  <div class="border-t border-slate-700"></div>
                  <div class="p-2">
                    ${isAdmin ? `
                      <a href="#/settings" class="flex items-center px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 rounded-lg">
                        <i data-lucide="settings" class="w-4 h-4 mr-2"></i>
                        Settings
                      </a>
                    ` : ''}
                    <a href="#/console" class="flex items-center px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 rounded-lg">
                      <i data-lucide="terminal" class="w-4 h-4 mr-2"></i>
                      Dev Console
                    </a>
                  </div>
                  <div class="border-t border-slate-700"></div>
                  <div class="p-2">
                    <a href="/auth/logout" class="flex items-center px-3 py-2 text-sm text-red-400 hover:bg-slate-700/50 rounded-lg">
                      <i data-lucide="log-out" class="w-4 h-4 mr-2"></i>
                      Sign Out
                    </a>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Search input
    const searchInput = this.element.querySelector('#global-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // User menu toggle
    const userMenuBtn = this.element.querySelector('#user-menu-btn');
    if (userMenuBtn) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setState({ showUserMenu: !this.state.showUserMenu });
      });
    }

    // Notifications toggle
    const notificationsBtn = this.element.querySelector('#notifications-btn');
    if (notificationsBtn) {
      notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setState({ showNotifications: !this.state.showNotifications });
      });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      if (this.state.showUserMenu || this.state.showNotifications) {
        this.setState({
          showUserMenu: false,
          showNotifications: false
        });
      }
    });

    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  handleSearch(query) {
    this.setState({ searchQuery: query });

    // Emit search event
    if (this.props.onSearch) {
      this.props.onSearch(query);
    }

    // Update store
    store.setState({ searchQuery: query }, 'SEARCH');
  }

  addNotification(notification) {
    const notifications = [...this.state.notifications, notification];
    this.setState({ notifications });
  }

  clearNotifications() {
    this.setState({ notifications: [] });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    super.destroy();
  }
}

export default TopBar;
