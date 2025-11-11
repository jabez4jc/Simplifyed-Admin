/**
 * Centralized State Management Store
 *
 * Simple Redux-like store for managing application state.
 * Provides predictable state updates and change notifications.
 */

class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = [];
    this.history = [];
    this.maxHistory = 50; // Keep last 50 states for debugging
  }

  /**
   * Get current state
   * Returns a copy to prevent direct mutations
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   *
   * @param {Object|Function} updates - New state values or updater function
   * @param {string} action - Action name for debugging
   */
  setState(updates, action = 'UPDATE') {
    const oldState = { ...this.state };

    // Support both object and function updates
    const newState = typeof updates === 'function'
      ? updates(oldState)
      : { ...oldState, ...updates };

    // Check if state actually changed
    if (JSON.stringify(oldState) === JSON.stringify(newState)) {
      return; // No change, don't notify
    }

    // Update state
    this.state = newState;

    // Store in history for debugging
    this.history.push({
      action,
      timestamp: Date.now(),
      state: { ...newState }
    });

    // Keep history size manageable
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Notify all listeners
    this.notify(newState, oldState, action);
  }

  /**
   * Subscribe to state changes
   *
   * @param {Function} listener - Function to call when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state change
   */
  notify(newState, oldState, action) {
    this.listeners.forEach(listener => {
      try {
        listener(newState, oldState, action);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  /**
   * Get state history for debugging
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Clear state history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Reset state to initial values
   */
  reset(initialState = {}) {
    this.setState(initialState, 'RESET');
    this.clearHistory();
  }

  /**
   * Subscribe to specific state path
   *
   * @param {string} path - Dot notation path (e.g., 'user.email')
   * @param {Function} listener - Function to call when path changes
   * @returns {Function} Unsubscribe function
   */
  subscribePath(path, listener) {
    return this.subscribe((newState, oldState) => {
      const newValue = this.getPath(newState, path);
      const oldValue = this.getPath(oldState, path);

      if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
        listener(newValue, oldValue);
      }
    });
  }

  /**
   * Get nested value from state by path
   */
  getPath(obj, path) {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }
}

// Create singleton store with initial state
const store = new Store({
  // Authentication
  user: null,
  isAuthenticated: false,
  isAdmin: false,

  // UI State
  currentView: 'dashboard',
  loading: false,
  error: null,

  // Data
  instances: [],
  filteredInstances: [],
  selectedInstances: new Set(),

  watchlists: [],
  filteredWatchlists: [],
  currentWatchlist: null,
  currentWatchlistTab: 'symbols',
  expandedWatchlistId: null,

  // Options Trading
  optionsMode: 'buyer', // 'buyer' or 'writer'
  currentOptionsSymbol: null,
  currentOptionsExpiries: [],

  // View Preferences
  currentViewMode: 'card', // 'card' or 'table'

  // Development Console
  consoleLogs: [],
  consolePaused: false,
  consoleAutoScroll: true,

  // Real-time Updates
  lastUpdate: null,
  refreshInterval: null,
  ltpRefreshInterval: null
});

// Export singleton
export default store;

// Export class for testing
export { Store };
