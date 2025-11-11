/**
 * Simplifyed Admin V2 - Dashboard Application
 * Main application logic
 */

class DashboardApp {
  constructor() {
    this.currentView = 'dashboard';
    this.currentUser = null;
    this.instances = [];
    this.watchlists = [];
    this.pollingInterval = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Load current user
      await this.loadCurrentUser();

      // Setup navigation
      this.setupNavigation();

      // Load initial view
      await this.loadView('dashboard');

      // Start auto-refresh (every 15 seconds)
      this.startAutoRefresh();

      console.log('✅ Dashboard initialized');
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      Utils.showToast('Failed to initialize dashboard', 'error');
    }
  }

  /**
   * Load current user
   */
  async loadCurrentUser() {
    try {
      const response = await api.getCurrentUser();
      this.currentUser = response.data;

      // Update UI
      document.getElementById('current-user-email').textContent =
        this.currentUser.email;
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  }

  /**
   * Setup navigation
   */
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        const view = item.dataset.view;

        // Update active state
        navItems.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        // Load view
        this.loadView(view);
      });
    });
  }

  /**
   * Load view
   */
  async loadView(viewName) {
    this.currentView = viewName;

    // Update title
    const titles = {
      dashboard: 'Dashboard',
      instances: 'Instances',
      watchlists: 'Watchlists',
      orders: 'Orders',
      positions: 'Positions',
    };

    document.getElementById('view-title').textContent =
      titles[viewName] || viewName;

    // Show loading
    const contentArea = document.getElementById('content-area');
    Utils.showLoading(contentArea);

    // Load view content
    try {
      switch (viewName) {
        case 'dashboard':
          await this.renderDashboardView();
          break;
        case 'instances':
          await this.renderInstancesView();
          break;
        case 'watchlists':
          await this.renderWatchlistsView();
          break;
        case 'orders':
          await this.renderOrdersView();
          break;
        case 'positions':
          await this.renderPositionsView();
          break;
        default:
          contentArea.innerHTML = '<p>View not found</p>';
      }
    } catch (error) {
      console.error(`Failed to load ${viewName} view:`, error);
      contentArea.innerHTML = `
        <div class="card">
          <p class="text-loss">Failed to load ${viewName}: ${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Render Dashboard View
   */
  async renderDashboardView() {
    const contentArea = document.getElementById('content-area');

    // Fetch data
    const [instancesRes, aggregatedPnLRes] = await Promise.all([
      api.getInstances({ is_active: true }),
      api.getAggregatedPnL().catch(() => ({
        data: {
          totalPnL: {
            realized_pnl: 0,
            unrealized_pnl: 0,
            total_pnl: 0,
            current_balance: 0,
          },
          metadata: {
            total_instances: 0,
            active_instances: 0,
            total_symbols: 0,
            total_positions: 0,
          },
        },
      })),
    ]);

    this.instances = instancesRes.data;
    const pnlData = aggregatedPnLRes.data;

    // Render
    contentArea.innerHTML = `
      <!-- P&L Stats -->
      <div class="stats-grid">
        <div class="stat-card pnl-card ${Utils.getPnLBgClass(pnlData.totalPnL.total_pnl)}">
          <div class="stat-label">Total P&L</div>
          <div class="stat-value ${Utils.getPnLColorClass(pnlData.totalPnL.total_pnl)}">
            ${Utils.formatCurrency(pnlData.totalPnL.total_pnl)}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Realized P&L</div>
          <div class="stat-value ${Utils.getPnLColorClass(pnlData.totalPnL.realized_pnl)}">
            ${Utils.formatCurrency(pnlData.totalPnL.realized_pnl)}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Unrealized P&L</div>
          <div class="stat-value ${Utils.getPnLColorClass(pnlData.totalPnL.unrealized_pnl)}">
            ${Utils.formatCurrency(pnlData.totalPnL.unrealized_pnl)}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Available Balance</div>
          <div class="stat-value">
            ${Utils.formatCurrency(pnlData.totalPnL.current_balance)}
          </div>
        </div>
      </div>

      <!-- Instance Stats -->
      <div class="stats-grid mb-6">
        <div class="stat-card">
          <div class="stat-label">Active Instances</div>
          <div class="stat-value">${pnlData.metadata.active_instances}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Open Positions</div>
          <div class="stat-value">${pnlData.metadata.total_positions}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Symbols Traded</div>
          <div class="stat-value">${pnlData.metadata.total_symbols}</div>
        </div>
      </div>

      <!-- Instances Table -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Active Instances</h3>
          <button class="btn btn-primary btn-sm" onclick="app.showAddInstanceModal()">
            + Add Instance
          </button>
        </div>
        <div class="table-container">
          ${this.renderInstancesTable(this.instances)}
        </div>
      </div>
    `;
  }

  /**
   * Render Instances View
   */
  async renderInstancesView() {
    const contentArea = document.getElementById('content-area');

    // Fetch instances
    const response = await api.getInstances();
    this.instances = response.data;

    contentArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">All Instances</h3>
          <button class="btn btn-primary" onclick="app.showAddInstanceModal()">
            + Add Instance
          </button>
        </div>
        <div class="table-container">
          ${this.renderInstancesTable(this.instances)}
        </div>
      </div>
    `;
  }

  /**
   * Render instances table
   */
  renderInstancesTable(instances) {
    if (instances.length === 0) {
      return '<p class="text-center text-neutral-600">No instances found</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Broker</th>
            <th>Health</th>
            <th>Mode</th>
            <th class="text-right">Total P&L</th>
            <th class="text-right">Realized</th>
            <th class="text-right">Unrealized</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${instances.map(instance => `
            <tr>
              <td class="font-medium">${Utils.escapeHTML(instance.name)}</td>
              <td>${Utils.escapeHTML(instance.broker || 'N/A')}</td>
              <td>${Utils.getStatusBadge(instance.health_status || 'unknown')}</td>
              <td>
                ${instance.is_analyzer_mode
                  ? '<span class="badge badge-warning">Analyzer</span>'
                  : '<span class="badge badge-success">Live</span>'}
              </td>
              <td class="text-right ${Utils.getPnLColorClass(instance.total_pnl)}">
                ${Utils.formatCurrency(instance.total_pnl || 0)}
              </td>
              <td class="text-right ${Utils.getPnLColorClass(instance.realized_pnl)}">
                ${Utils.formatCurrency(instance.realized_pnl || 0)}
              </td>
              <td class="text-right ${Utils.getPnLColorClass(instance.unrealized_pnl)}">
                ${Utils.formatCurrency(instance.unrealized_pnl || 0)}
              </td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm"
                          onclick="app.refreshInstance(${instance.id})"
                          title="Refresh">
                    🔄
                  </button>
                  <button class="btn btn-secondary btn-sm"
                          onclick="app.showEditInstanceModal(${instance.id})">
                    Edit
                  </button>
                  <button class="btn btn-${instance.is_analyzer_mode ? 'success' : 'warning'} btn-sm"
                          onclick="app.toggleAnalyzerMode(${instance.id}, ${!instance.is_analyzer_mode})">
                    ${instance.is_analyzer_mode ? 'Go Live' : 'Analyzer'}
                  </button>
                  <button class="btn btn-error btn-sm"
                          onclick="app.deleteInstance(${instance.id})">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render Watchlists View
   */
  async renderWatchlistsView() {
    const contentArea = document.getElementById('content-area');

    // Fetch watchlists
    const response = await api.getWatchlists();
    this.watchlists = response.data;

    contentArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Watchlists</h3>
          <button class="btn btn-primary" onclick="app.showAddWatchlistModal()">
            + Add Watchlist
          </button>
        </div>
        <div class="table-container">
          ${this.renderWatchlistsTable(this.watchlists)}
        </div>
      </div>
    `;
  }

  /**
   * Render watchlists table
   */
  renderWatchlistsTable(watchlists) {
    if (watchlists.length === 0) {
      return '<p class="text-center text-neutral-600">No watchlists found</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Symbols</th>
            <th>Instances</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${watchlists.map(wl => `
            <tr>
              <td class="font-medium">${Utils.escapeHTML(wl.name)}</td>
              <td>${Utils.escapeHTML(wl.description || '-')}</td>
              <td>${wl.symbol_count || 0}</td>
              <td>${wl.instance_count || 0}</td>
              <td>${Utils.getStatusBadge(wl.is_active ? 'active' : 'inactive')}</td>
              <td>${Utils.formatRelativeTime(wl.created_at)}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm"
                          onclick="app.viewWatchlistDetails(${wl.id})">
                    View
                  </button>
                  <button class="btn btn-secondary btn-sm"
                          onclick="app.showEditWatchlistModal(${wl.id})">
                    Edit
                  </button>
                  <button class="btn btn-error btn-sm"
                          onclick="app.deleteWatchlist(${wl.id})">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render Orders View
   */
  async renderOrdersView() {
    const contentArea = document.getElementById('content-area');

    // Fetch orders
    const response = await api.getOrders();
    const orders = response.data;

    contentArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Orders</h3>
          <div class="flex gap-2">
            <select class="form-select" onchange="app.filterOrders(this.value)">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="open">Open</option>
              <option value="complete">Complete</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div class="table-container">
          ${this.renderOrdersTable(orders)}
        </div>
      </div>
    `;
  }

  /**
   * Render orders table
   */
  renderOrdersTable(orders) {
    if (orders.length === 0) {
      return '<p class="text-center text-neutral-600">No orders found</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>Instance</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Quantity</th>
            <th>Type</th>
            <th>Status</th>
            <th>Placed At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${orders.slice(0, 100).map(order => `
            <tr>
              <td class="font-medium">${Utils.escapeHTML(order.instance_name || 'N/A')}</td>
              <td>${Utils.escapeHTML(order.symbol)}</td>
              <td>
                <span class="badge ${order.side === 'BUY' ? 'badge-success' : 'badge-error'}">
                  ${order.side}
                </span>
              </td>
              <td>${order.quantity}</td>
              <td>${order.order_type}</td>
              <td>${Utils.getStatusBadge(order.status)}</td>
              <td>${Utils.formatRelativeTime(order.placed_at)}</td>
              <td>
                ${order.status === 'pending' || order.status === 'open' ? `
                  <button class="btn btn-error btn-sm"
                          onclick="app.cancelOrder(${order.id})">
                    Cancel
                  </button>
                ` : '-'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render Positions View
   */
  async renderPositionsView() {
    const contentArea = document.getElementById('content-area');

    // Fetch all instances
    const instancesRes = await api.getInstances({ is_active: true });
    const instances = instancesRes.data;

    if (instances.length === 0) {
      contentArea.innerHTML = `
        <div class="card">
          <p class="text-center text-neutral-600">No active instances found</p>
        </div>
      `;
      return;
    }

    // Fetch positions for all instances
    const positionsData = await Promise.all(
      instances.map(async (instance) => {
        try {
          const posRes = await api.getPositions(instance.id);
          return {
            instance,
            positions: posRes.data.filter(p => {
              const qty = parseFloat(p.quantity || p.netqty || p.net_quantity || 0);
              return qty !== 0;
            }),
          };
        } catch (error) {
          return { instance, positions: [] };
        }
      })
    );

    contentArea.innerHTML = `
      ${positionsData.map(({ instance, positions }) => `
        <div class="card mb-6">
          <div class="card-header">
            <h3 class="card-title">${Utils.escapeHTML(instance.name)}</h3>
            <button class="btn btn-error btn-sm"
                    onclick="app.closeAllPositions(${instance.id})">
              Close All Positions
            </button>
          </div>
          <div class="table-container">
            ${positions.length > 0 ? this.renderPositionsTable(positions) :
              '<p class="text-center text-neutral-600">No open positions</p>'}
          </div>
        </div>
      `).join('')}
    `;
  }

  /**
   * Render positions table
   */
  renderPositionsTable(positions) {
    return `
      <table class="table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Quantity</th>
            <th>Product</th>
            <th class="text-right">Avg Price</th>
            <th class="text-right">LTP</th>
            <th class="text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          ${positions.map(pos => {
            const pnl = parseFloat(pos.pnl || pos.unrealized_pnl || pos.mtm || 0);
            return `
              <tr>
                <td class="font-medium">${Utils.escapeHTML(pos.symbol || pos.tradingsymbol)}</td>
                <td>${pos.quantity || pos.netqty || pos.net_quantity || 0}</td>
                <td>${pos.product || pos.product_type || '-'}</td>
                <td class="text-right">${Utils.formatCurrency(pos.average_price || pos.avg_price || 0)}</td>
                <td class="text-right">${Utils.formatCurrency(pos.ltp || pos.last_price || 0)}</td>
                <td class="text-right ${Utils.getPnLColorClass(pnl)}">
                  ${Utils.formatCurrency(pnl)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Show add instance modal
   */
  showAddInstanceModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add Instance</h3>
        </div>
        <div class="modal-body">
          <form id="add-instance-form">
            <div class="form-group">
              <label class="form-label">Instance Name *</label>
              <input type="text" name="name" class="form-input" required>
            </div>

            <div class="form-group">
              <label class="form-label">Host URL *</label>
              <input type="url" name="host_url" class="form-input"
                     placeholder="http://localhost:5000" required>
            </div>

            <div class="form-group">
              <label class="form-label">API Key *</label>
              <input type="text" name="api_key" class="form-input" required>
            </div>

            <div class="form-group">
              <label class="form-label">Broker</label>
              <select name="broker" class="form-select">
                <option value="zerodha">Zerodha</option>
                <option value="fyers">Fyers</option>
                <option value="angelone">Angel One</option>
                <option value="kotak">Kotak Securities</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Strategy Tag</label>
              <input type="text" name="strategy_tag" class="form-input" value="default">
            </div>

            <div class="form-group">
              <label class="form-label">Target Profit</label>
              <input type="number" name="target_profit" class="form-input" step="0.01">
            </div>

            <div class="form-group">
              <label class="form-label">Target Loss</label>
              <input type="number" name="target_loss" class="form-input" step="0.01">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Cancel
          </button>
          <button class="btn btn-primary" onclick="app.submitAddInstance()">
            Add Instance
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Submit add instance form
   */
  async submitAddInstance() {
    const form = document.getElementById('add-instance-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      await api.createInstance(data);
      Utils.showToast('Instance added successfully', 'success');

      // Close modal
      document.querySelector('.modal-overlay').remove();

      // Refresh view
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Show add watchlist modal
   */
  showAddWatchlistModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add Watchlist</h3>
        </div>
        <div class="modal-body">
          <form id="add-watchlist-form">
            <div class="form-group">
              <label class="form-label">Watchlist Name *</label>
              <input type="text" name="name" class="form-input" required>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea name="description" class="form-input" rows="3"></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Cancel
          </button>
          <button class="btn btn-primary" onclick="app.submitAddWatchlist()">
            Add Watchlist
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Submit add watchlist form
   */
  async submitAddWatchlist() {
    const form = document.getElementById('add-watchlist-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      await api.createWatchlist(data);
      Utils.showToast('Watchlist added successfully', 'success');

      // Close modal
      document.querySelector('.modal-overlay').remove();

      // Refresh view
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Refresh instance
   */
  async refreshInstance(instanceId) {
    try {
      Utils.showToast('Refreshing instance...', 'info', 2000);
      await api.refreshInstance(instanceId);
      Utils.showToast('Instance refreshed', 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Toggle analyzer mode
   */
  async toggleAnalyzerMode(instanceId, mode) {
    const confirmed = await Utils.confirm(
      `Are you sure you want to ${mode ? 'enable' : 'disable'} analyzer mode?`,
      'Confirm Analyzer Mode Toggle'
    );

    if (!confirmed) return;

    try {
      Utils.showToast('Toggling analyzer mode...', 'info', 2000);
      await api.toggleAnalyzer(instanceId, mode);
      Utils.showToast(`Analyzer mode ${mode ? 'enabled' : 'disabled'}`, 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Delete instance
   */
  async deleteInstance(instanceId) {
    const confirmed = await Utils.confirm(
      'Are you sure you want to delete this instance? This action cannot be undone.',
      'Confirm Delete'
    );

    if (!confirmed) return;

    try {
      await api.deleteInstance(instanceId);
      Utils.showToast('Instance deleted', 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Delete watchlist
   */
  async deleteWatchlist(watchlistId) {
    const confirmed = await Utils.confirm(
      'Are you sure you want to delete this watchlist?',
      'Confirm Delete'
    );

    if (!confirmed) return;

    try {
      await api.deleteWatchlist(watchlistId);
      Utils.showToast('Watchlist deleted', 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    const confirmed = await Utils.confirm(
      'Are you sure you want to cancel this order?',
      'Confirm Cancel'
    );

    if (!confirmed) return;

    try {
      await api.cancelOrder(orderId);
      Utils.showToast('Order cancelled', 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Close all positions
   */
  async closeAllPositions(instanceId) {
    const confirmed = await Utils.confirm(
      'Are you sure you want to close ALL positions for this instance?',
      'Confirm Close All'
    );

    if (!confirmed) return;

    try {
      await api.closePositions(instanceId);
      Utils.showToast('Close positions request sent', 'success');
      await this.refreshCurrentView();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  }

  /**
   * Refresh current view
   */
  async refreshCurrentView() {
    await this.loadView(this.currentView);
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh() {
    // Clear existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Refresh every 15 seconds
    this.pollingInterval = setInterval(() => {
      this.refreshCurrentView();
    }, 15000);
  }

  /**
   * Logout
   */
  async logout() {
    const confirmed = await Utils.confirm('Are you sure you want to logout?');

    if (confirmed) {
      await api.logout();
      window.location.href = '/';
    }
  }

  // Placeholder methods
  showEditInstanceModal(id) {
    Utils.showToast('Edit instance - Coming soon', 'info');
  }

  showEditWatchlistModal(id) {
    Utils.showToast('Edit watchlist - Coming soon', 'info');
  }

  viewWatchlistDetails(id) {
    Utils.showToast('Watchlist details - Coming soon', 'info');
  }

  filterOrders(status) {
    // TODO: Implement order filtering
    console.log('Filter orders by status:', status);
  }
}

// Initialize app when DOM is ready
const app = new DashboardApp();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
