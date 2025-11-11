/**
 * Main Application Entry Point
 *
 * Initializes the Simplifyed Trading Dashboard with:
 * - State management (store)
 * - API service layer
 * - Client-side routing
 * - Component lifecycle management
 */

import store from './lib/store.js';
import API from './lib/api.js';
import router from './lib/router.js';
import DashboardLayout from './components/DashboardLayout.js';

/**
 * Application class - manages app lifecycle
 */
class App {
  constructor() {
    this.layout = null;
    this.initialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.initialized) {
      console.warn('App already initialized');
      return;
    }

    console.log('🚀 Initializing Simplifyed Trading Dashboard...');

    try {
      // 1. Set up API interceptors for logging
      this.setupAPIInterceptors();

      // 2. Load user data and authenticate
      await this.loadUserData();

      // 3. Initialize router with route handlers
      this.setupRoutes();

      // 4. Create and mount main layout
      this.mountLayout();

      // 5. Set up real-time updates
      this.setupRealTimeUpdates();

      // 6. Handle initial route
      router.handleRoute();

      this.initialized = true;
      console.log('✅ Application initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize application:', error);
      this.handleInitError(error);
    }
  }

  /**
   * Set up API request/response interceptors
   */
  setupAPIInterceptors() {
    // Log API requests in development
    if (store.getState().consoleLogs !== undefined) {
      API.setRequestInterceptor((url, config) => {
        const logs = store.getState().consoleLogs || [];
        logs.push({
          type: 'request',
          method: config.method || 'GET',
          url,
          timestamp: new Date().toISOString()
        });
        store.setState({ consoleLogs: logs.slice(-100) }, 'API_REQUEST');
      });

      API.setResponseInterceptor((url, response) => {
        const logs = store.getState().consoleLogs || [];
        logs.push({
          type: 'response',
          status: response.status,
          url,
          timestamp: new Date().toISOString()
        });
        store.setState({ consoleLogs: logs.slice(-100) }, 'API_RESPONSE');
      });
    }
  }

  /**
   * Load user data and check authentication
   */
  async loadUserData() {
    try {
      store.setState({ loading: true }, 'LOAD_USER_START');

      const userData = await API.user.getCurrent();

      store.setState({
        user: userData.user,
        isAuthenticated: true,
        isAdmin: userData.isAdmin || false,
        loading: false,
        error: null
      }, 'LOAD_USER_SUCCESS');

      console.log(`👤 Logged in as: ${userData.user.name} (${userData.isAdmin ? 'Admin' : 'User'})`);

    } catch (error) {
      console.error('Failed to load user data:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.status === 403) {
        // Redirect to login
        window.location.href = '/auth/google';
      } else {
        store.setState({
          loading: false,
          error: 'Failed to load user data. Please refresh the page.'
        }, 'LOAD_USER_ERROR');
      }

      throw error;
    }
  }

  /**
   * Set up client-side routes
   */
  setupRoutes() {
    // Navigation guard - check authentication before each route
    router.beforeEach(async ({ path, query, params }) => {
      const { isAuthenticated } = store.getState();

      if (!isAuthenticated && path !== '/login') {
        console.warn('Unauthorized access attempt, redirecting to login');
        window.location.href = '/auth/google';
        return false; // Cancel navigation
      }

      return true; // Allow navigation
    });

    // After navigation - update store and page title
    router.afterEach(({ path }) => {
      store.setState({ currentView: path.slice(1) || 'dashboard' }, 'ROUTE_CHANGE');

      // Update page title
      const titles = {
        '/dashboard': 'Dashboard',
        '/instances': 'Instances',
        '/watchlists': 'Watchlists',
        '/options': 'Options Trading',
        '/console': 'Developer Console'
      };
      document.title = `${titles[path] || 'Dashboard'} - Simplifyed Admin`;
    });

    // Register route handlers
    router.on('/dashboard', async () => {
      console.log('📊 Loading Dashboard view...');
      // Layout will handle view loading
      if (this.layout) {
        this.layout.loadDashboardView();
      }
    });

    router.on('/instances', async () => {
      console.log('🖥️ Loading Instances view...');
      if (this.layout) {
        this.layout.loadInstancesView();
      }
    });

    router.on('/watchlists', async () => {
      console.log('📋 Loading Watchlists view...');
      if (this.layout) {
        this.layout.loadWatchlistsView();
      }
    });

    router.on('/options', async () => {
      console.log('📈 Loading Options Trading view...');
      if (this.layout) {
        this.layout.loadOptionsView();
      }
    });

    router.on('/console', async () => {
      console.log('🔧 Loading Developer Console view...');
      if (this.layout) {
        this.layout.loadConsoleView();
      }
    });

    console.log('✅ Routes registered');
  }

  /**
   * Mount the main layout component
   */
  mountLayout() {
    const container = document.getElementById('app');

    if (!container) {
      throw new Error('App container element not found. Ensure #app exists in HTML.');
    }

    this.layout = new DashboardLayout({
      onLogout: () => {
        window.location.href = '/auth/logout';
      }
    });

    this.layout.mount(container);
    console.log('✅ Layout mounted');
  }

  /**
   * Set up real-time updates for instances and P&L
   */
  setupRealTimeUpdates() {
    const { isAuthenticated } = store.getState();

    if (!isAuthenticated) {
      return;
    }

    // Update instances every 30 seconds
    const updateInstances = async () => {
      try {
        const response = await API.instances.list();
        store.setState({
          instances: response.instances || [],
          lastUpdate: new Date().toISOString()
        }, 'INSTANCES_UPDATE');
      } catch (error) {
        console.error('Failed to update instances:', error);
      }
    };

    // Initial load
    updateInstances();

    // Set up periodic updates
    const refreshInterval = setInterval(updateInstances, 30000); // 30 seconds
    store.setState({ refreshInterval }, 'SET_REFRESH_INTERVAL');

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    });

    console.log('✅ Real-time updates enabled (30s intervals)');
  }

  /**
   * Handle initialization errors
   */
  handleInitError(error) {
    const container = document.getElementById('app');

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div class="bg-slate-800 border border-red-500/50 rounded-lg p-8 max-w-md">
          <div class="flex items-center space-x-3 mb-4">
            <i data-lucide="alert-circle" class="w-8 h-8 text-red-500"></i>
            <h1 class="text-xl font-semibold text-white">Initialization Error</h1>
          </div>
          <p class="text-slate-300 mb-4">
            Failed to initialize the application. Please try refreshing the page.
          </p>
          <p class="text-sm text-slate-400 mb-6">
            Error: ${error.message || 'Unknown error'}
          </p>
          <button
            onclick="window.location.reload()"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    `;

    // Initialize Lucide icons for error display
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Destroy the application
   */
  destroy() {
    // Clear intervals
    const { refreshInterval, ltpRefreshInterval } = store.getState();
    if (refreshInterval) clearInterval(refreshInterval);
    if (ltpRefreshInterval) clearInterval(ltpRefreshInterval);

    // Destroy layout
    if (this.layout) {
      this.layout.destroy();
      this.layout = null;
    }

    // Reset store
    store.reset();

    this.initialized = false;
    console.log('🛑 Application destroyed');
  }
}

// Create app instance
const app = new App();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for debugging in console
window.app = app;
window.store = store;
window.API = API;
window.router = router;

export default app;
