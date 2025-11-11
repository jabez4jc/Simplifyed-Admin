/**
 * Simple Client-Side Router
 *
 * Handles view navigation without page reloads.
 * Uses hash-based routing for simplicity (no server config needed).
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.beforeHooks = [];
    this.afterHooks = [];

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  /**
   * Register a route
   *
   * @param {string} path - Route path (e.g., '/dashboard', '/watchlists')
   * @param {Function} handler - Function to call when route matches
   */
  on(path, handler) {
    this.routes.set(path, handler);
    return this;
  }

  /**
   * Navigate to a route
   *
   * @param {string} path - Route path
   * @param {Object} params - Optional parameters to pass to handler
   */
  navigate(path, params = {}) {
    window.location.hash = path;
    this.handleRoute(params);
  }

  /**
   * Handle route change
   */
  async handleRoute(params = {}) {
    // Get current hash (remove leading #)
    const hash = window.location.hash.slice(1) || '/dashboard';

    // Parse path and query
    const [path, queryString] = hash.split('?');
    const query = this.parseQuery(queryString);

    // Find matching route
    const handler = this.routes.get(path);

    if (!handler) {
      console.warn(`No route handler for: ${path}`);
      this.navigate('/dashboard'); // Fallback to dashboard
      return;
    }

    // Run before hooks
    const shouldContinue = await this.runBeforeHooks(path, query, params);
    if (!shouldContinue) {
      return; // Navigation cancelled by hook
    }

    // Store current route
    const previousRoute = this.currentRoute;
    this.currentRoute = { path, query, params };

    try {
      // Call route handler
      await handler({ path, query, params, previousRoute });

      // Run after hooks
      await this.runAfterHooks(path, query, params);
    } catch (error) {
      console.error('Route handler error:', error);
    }
  }

  /**
   * Parse query string into object
   */
  parseQuery(queryString) {
    if (!queryString) return {};

    const params = new URLSearchParams(queryString);
    const query = {};

    for (const [key, value] of params) {
      query[key] = value;
    }

    return query;
  }

  /**
   * Add before navigation hook
   *
   * @param {Function} hook - Function called before navigation
   * @returns {Function} Unregister function
   */
  beforeEach(hook) {
    this.beforeHooks.push(hook);

    return () => {
      const index = this.beforeHooks.indexOf(hook);
      if (index > -1) {
        this.beforeHooks.splice(index, 1);
      }
    };
  }

  /**
   * Add after navigation hook
   *
   * @param {Function} hook - Function called after navigation
   * @returns {Function} Unregister function
   */
  afterEach(hook) {
    this.afterHooks.push(hook);

    return () => {
      const index = this.afterHooks.indexOf(hook);
      if (index > -1) {
        this.afterHooks.splice(index, 1);
      }
    };
  }

  /**
   * Run before hooks
   */
  async runBeforeHooks(path, query, params) {
    for (const hook of this.beforeHooks) {
      try {
        const result = await hook({ path, query, params });
        if (result === false) {
          return false; // Cancel navigation
        }
      } catch (error) {
        console.error('Before hook error:', error);
        return false;
      }
    }
    return true;
  }

  /**
   * Run after hooks
   */
  async runAfterHooks(path, query, params) {
    for (const hook of this.afterHooks) {
      try {
        await hook({ path, query, params });
      } catch (error) {
        console.error('After hook error:', error);
      }
    }
  }

  /**
   * Get current route info
   */
  getCurrentRoute() {
    return this.currentRoute;
  }

  /**
   * Build URL with query params
   */
  buildUrl(path, query = {}) {
    const queryString = Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return queryString ? `${path}?${queryString}` : path;
  }
}

// Create and export singleton
const router = new Router();

// Register default routes (will be overridden by app)
router.on('/dashboard', () => console.log('Dashboard view'));
router.on('/instances', () => console.log('Instances view'));
router.on('/watchlists', () => console.log('Watchlists view'));
router.on('/options', () => console.log('Options view'));
router.on('/console', () => console.log('Console view'));

export default router;
export { Router };
