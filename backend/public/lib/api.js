/**
 * API Service Layer
 *
 * Centralized API communication with error handling,
 * request/response interceptors, and logging.
 */

const API_BASE = '/api/v1'; // Use versioned API

/**
 * API Error class
 */
class APIError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.response = response;
  }
}

/**
 * Request interceptor (for logging)
 */
let requestInterceptor = null;

/**
 * Response interceptor (for logging)
 */
let responseInterceptor = null;

/**
 * Make HTTP request with error handling
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include', // Include cookies for session auth
    ...options
  };

  // Call request interceptor
  if (requestInterceptor) {
    requestInterceptor(url, config);
  }

  try {
    const response = await fetch(url, config);

    // Call response interceptor
    if (responseInterceptor) {
      responseInterceptor(url, response);
    }

    // Handle non-OK responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    // Parse JSON response
    const data = await response.json();
    return data;

  } catch (error) {
    // Network error or JSON parse error
    if (error instanceof APIError) {
      throw error;
    }

    throw new APIError(
      error.message || 'Network error occurred',
      0,
      null
    );
  }
}

/**
 * API methods
 */
const API = {
  /**
   * Set request interceptor for logging
   */
  setRequestInterceptor(fn) {
    requestInterceptor = fn;
  },

  /**
   * Set response interceptor for logging
   */
  setResponseInterceptor(fn) {
    responseInterceptor = fn;
  },

  /**
   * User endpoints
   */
  user: {
    async getCurrent() {
      return request('/user');
    }
  },

  /**
   * Instance endpoints
   */
  instances: {
    async list() {
      return request('/instances');
    },

    async get(id) {
      return request(`/instances/${id}`);
    },

    async create(data) {
      return request('/instances', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async update(id, data) {
      return request(`/instances/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async delete(id) {
      return request(`/instances/${id}`, {
        method: 'DELETE'
      });
    },

    async toggleAnalyzer(id) {
      return request(`/instances/${id}/analyzer-toggle`, {
        method: 'POST'
      });
    },

    async safeSwitch(id) {
      return request(`/instances/${id}/safe-switch`, {
        method: 'POST'
      });
    }
  },

  /**
   * Watchlist endpoints
   */
  watchlists: {
    async list() {
      return request('/watchlists');
    },

    async get(id) {
      return request(`/watchlists/${id}`);
    },

    async create(data) {
      return request('/watchlists', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async update(id, data) {
      return request(`/watchlists/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async delete(id) {
      return request(`/watchlists/${id}`, {
        method: 'DELETE'
      });
    },

    async clone(id) {
      return request(`/watchlists/${id}/clone`, {
        method: 'POST'
      });
    },

    async exportCSV(id) {
      return request(`/watchlists/${id}/export`);
    },

    async importCSV(id, csvData) {
      return request(`/watchlists/${id}/import`, {
        method: 'POST',
        body: JSON.stringify({ csv: csvData })
      });
    },

    /**
     * Symbol management
     */
    symbols: {
      async list(watchlistId) {
        return request(`/watchlists/${watchlistId}/symbols`);
      },

      async add(watchlistId, symbolData) {
        return request(`/watchlists/${watchlistId}/symbols`, {
          method: 'POST',
          body: JSON.stringify(symbolData)
        });
      },

      async update(watchlistId, symbolId, data) {
        return request(`/watchlists/${watchlistId}/symbols/${symbolId}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      },

      async delete(watchlistId, symbolId) {
        return request(`/watchlists/${watchlistId}/symbols/${symbolId}`, {
          method: 'DELETE'
        });
      }
    },

    /**
     * Instance assignment
     */
    instances: {
      async assign(watchlistId, instanceIds) {
        return request(`/watchlists/${watchlistId}/instances`, {
          method: 'POST',
          body: JSON.stringify({ instance_ids: instanceIds })
        });
      }
    }
  },

  /**
   * Symbol search
   */
  symbols: {
    async search(query, exchange = null) {
      const params = new URLSearchParams({ q: query });
      if (exchange) params.append('exchange', exchange);

      return request(`/symbols/search?${params}`);
    },

    async validate(symbol, exchange) {
      return request(`/symbols/validate?symbol=${symbol}&exchange=${exchange}`);
    }
  },

  /**
   * Options trading
   */
  options: {
    async getExpiries(underlying, exchange) {
      return request(`/options/expiries?underlying=${underlying}&exchange=${exchange}`);
    },

    async getStrikes(underlying, exchange, expiry) {
      return request(`/options/strikes?underlying=${underlying}&exchange=${exchange}&expiry=${expiry}`);
    },

    async getChain(underlying, exchange, expiry) {
      return request(`/options/chain?underlying=${underlying}&exchange=${exchange}&expiry=${expiry}`);
    }
  },

  /**
   * Orders
   */
  orders: {
    async list(filters = {}) {
      const params = new URLSearchParams(filters);
      return request(`/orders?${params}`);
    },

    async place(orderData) {
      return request('/orders', {
        method: 'POST',
        body: JSON.stringify(orderData)
      });
    },

    async cancel(orderId) {
      return request(`/orders/${orderId}/cancel`, {
        method: 'POST'
      });
    }
  },

  /**
   * Positions
   */
  positions: {
    async list(instanceId = null) {
      const params = instanceId ? `?instance_id=${instanceId}` : '';
      return request(`/positions${params}`);
    },

    async summary() {
      return request('/positions/summary');
    }
  },

  /**
   * Quotes (real-time prices)
   */
  quotes: {
    async get(symbols) {
      return request('/quotes', {
        method: 'POST',
        body: JSON.stringify({ symbols })
      });
    }
  },

  /**
   * Health check
   */
  health: {
    async check() {
      return request('/health');
    }
  }
};

export default API;
export { APIError };
