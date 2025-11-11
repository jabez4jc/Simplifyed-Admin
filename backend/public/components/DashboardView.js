import Component from './Component.js';

/**
 * Dashboard View Component
 */
class DashboardView extends Component {
  constructor(props) {
    super(props);
    this.instances = props.instances || [];
    this.summary = props.summary || {};
  }

  render() {
    return `
      <div class="p-4 md:p-8">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
            <p class="text-slate-400 mt-1">Overview of your trading instances and performance</p>
          </div>
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2 text-slate-400">
              <i data-lucide="clock" class="w-4 h-4"></i>
              <span class="text-sm" id="last-update">Never</span>
            </div>
            <button onclick="refreshAllData()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200 flex items-center space-x-2">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <!-- Total P&L Card -->
          <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <i data-lucide="trending-up" class="w-4 h-4 text-profit"></i>
              <span class="text-slate-400 text-sm">Total P&L</span>
            </div>
            <div class="text-4xl md:text-5xl font-bold" id="total-pnl">₹0.00</div>
          </div>

          <!-- Realized P&L Card -->
          <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <i data-lucide="check-circle" class="w-4 h-4 text-blue-400"></i>
              <span class="text-slate-400 text-sm">Realized P&L</span>
            </div>
            <div class="text-2xl font-bold text-blue-300" id="realized-pnl">₹0.00</div>
          </div>

          <!-- Unrealized P&L Card -->
          <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <i data-lucide="clock" class="w-4 h-4 text-amber-400"></i>
              <span class="text-slate-400 text-sm">Unrealized P&L</span>
            </div>
            <div class="text-2xl font-bold text-amber-300" id="unrealized-pnl">₹0.00</div>
          </div>

          <!-- Total Balance Card -->
          <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <i data-lucide="wallet" class="w-4 h-4 text-slate-400"></i>
              <span class="text-slate-400 text-sm">Total Balance</span>
            </div>
            <div class="text-2xl font-bold text-white" id="total-balance">₹0.00</div>
          </div>

          <!-- Active Instances Card -->
          <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <i data-lucide="server" class="w-4 h-4 text-green-400"></i>
              <span class="text-slate-400 text-sm">Active Instances</span>
            </div>
            <div class="text-2xl font-bold text-green-300" id="active-instances">0</div>
          </div>
        </div>

        <!-- View Toggle -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center space-x-4">
            <button id="card-view-btn" class="view-btn px-4 py-2 rounded-lg active" onclick="switchView('card')">
              <i data-lucide="grid-3x3" class="w-4 h-4 mr-2 inline"></i>Card View
            </button>
            <button id="table-view-btn" class="view-btn px-4 py-2 rounded-lg" onclick="switchView('table')">
              <i data-lucide="list" class="w-4 h-4 mr-2 inline"></i>Table View
            </button>
          </div>
          <div class="flex items-center space-x-2">
            <input type="text" id="dashboard-search-input" placeholder="Search instances..."
                   class="px-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500">
            <button onclick="loadInstances()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200">
              <i data-lucide="search" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Instances Container -->
        <div id="instances-container">
          <!-- Card View -->
          <div id="card-view" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Instance cards will be rendered here -->
          </div>

          <!-- Table View -->
          <div id="table-view" class="hidden">
            <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
              <table class="w-full">
                <thead class="bg-slate-700/50">
                  <tr>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Instance</th>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Mode</th>
                    <th class="px-6 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">P&L</th>
                    <th class="px-6 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">Balance</th>
                    <th class="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody id="instances-table-body" class="divide-y divide-slate-700/50">
                  <!-- Table rows will be rendered here -->
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div id="instances-empty-state" class="hidden text-center py-16">
          <div class="w-16 h-16 bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i data-lucide="server" class="w-8 h-8 text-slate-400"></i>
          </div>
          <h3 class="text-xl font-semibold text-white mb-2">No instances found</h3>
          <p class="text-slate-400 mb-6">Get started by creating your first trading instance</p>
          <button onclick="showCreateInstanceModal()" class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-200">
            Create Instance
          </button>
        </div>
      </div>
    `;
  }

  updateData(instances, summary) {
    this.instances = instances;
    this.summary = summary;
    // Trigger re-render if component is mounted
  }
}

export default DashboardView;
