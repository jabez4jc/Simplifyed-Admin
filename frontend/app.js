// Configuration
const API_BASE = 'http://localhost:3000/api';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (typeof url !== 'string') {
        return '#';
    }
    const trimmed = url.trim();
    if (!trimmed) {
        return '#';
    }

    try {
        const parsed = new URL(trimmed, window.location.origin);
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
            return '#';
        }
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return '#';
    }
}

// Global state
let user = null;
let isAdmin = false;
let instances = [];
let filteredInstances = [];
let currentView = 'dashboard';
let selectedInstances = new Set();
let refreshInterval = null;
let currentViewMode = 'card'; // 'card' or 'table'

// Initialize the application
async function init() {
    console.log('🚀 Initializing Simplifyed Trading Dashboard...');
    
    try {
        // Initialize Lucide icons
        lucide.createIcons();
        
        // Check authentication status
        const authResponse = await fetch(`${API_BASE}/user`, { credentials: 'include' });
        const authData = await authResponse.json();
        
        if (authData.authenticated) {
            user = authData.user;
            isAdmin = authData.isAdmin || false;
            showDashboard();
            loadUserProfile();
            setupNavigationBasedOnRole();
            await loadDashboardData();
            setupEventListeners();
            startAutoRefresh();
        } else {
            showLoginPage();
        }
    } catch (error) {
        console.error('Authentication check failed:', error);
        showLoginPage();
    }
}

// Show login page
function showLoginPage() {
    hideLoading();
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    hideLoading();
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

// Hide loading
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Load user profile
function loadUserProfile() {
    if (user) {
        document.getElementById('user-name').textContent = user.name || 'Unknown User';
        document.getElementById('user-email').textContent = user.email || 'unknown@email.com';
        document.getElementById('user-avatar').src = user.picture || '/api/placeholder/32/32';
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        showRefreshIndicator();
        const response = await fetch(`${API_BASE}/instances`, { credentials: 'include' });
        
        if (response.ok) {
            instances = await response.json();
            filteredInstances = [...instances];
            renderInstances();
            updateSummaryCards();
            updateLastUpdated();
        } else {
            console.error('Failed to load instances');
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    } finally {
        hideRefreshIndicator();
    }
}

// Show/Hide refresh indicator
function showRefreshIndicator() {
    const indicator = document.getElementById('refresh-indicator');
    indicator.classList.add('animate-spin');
}

function hideRefreshIndicator() {
    const indicator = document.getElementById('refresh-indicator');
    indicator.classList.remove('animate-spin');
}

// Update last updated timestamp
function updateLastUpdated() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    document.getElementById('last-updated').textContent = timeString;
}

// Update summary cards
function updateSummaryCards() {
    if (!instances || instances.length === 0) {
        document.getElementById('total-instances').textContent = '0';
        document.getElementById('online-instances').textContent = '0';
        document.getElementById('live-trading').textContent = '0';
        document.getElementById('total-cash').textContent = '₹0.00';
        document.getElementById('total-pnl').textContent = '₹0.00';
        document.getElementById('total-pnl').className = 'text-2xl font-bold text-slate-400';
        return;
    }

    // Use filteredInstances for cumulative P&L calculations (displayed instances)
    const displayedInstances = filteredInstances.length > 0 ? filteredInstances : instances;
    
    // Calculate summary statistics
    const totalInstances = instances.length;
    const onlineInstances = instances.filter(i => i.is_active).length;
    const liveTrading = instances.filter(i => !i.is_analyzer_mode && i.is_active).length;
    
    const totalCash = instances.reduce((sum, i) => sum + (parseFloat(i.current_balance) || 0), 0);
    
    // Calculate comprehensive P&L for currently displayed instances (cumulative)
    const displayedTotalPnl = displayedInstances.reduce((sum, i) => sum + (parseFloat(i.total_pnl) || parseFloat(i.current_pnl) || 0), 0);
    const displayedRealizedPnl = displayedInstances.reduce((sum, i) => sum + (parseFloat(i.realized_pnl) || 0), 0);
    const displayedUnrealizedPnl = displayedInstances.reduce((sum, i) => sum + (parseFloat(i.unrealized_pnl) || parseFloat(i.current_pnl) || 0), 0);
    
    // Update UI elements
    document.getElementById('total-instances').textContent = totalInstances.toString();
    document.getElementById('online-instances').textContent = onlineInstances.toString();
    document.getElementById('live-trading').textContent = liveTrading.toString();
    document.getElementById('total-cash').textContent = `₹${formatCurrency(totalCash)}`;
    
    // Update P&L with comprehensive breakdown
    const pnlElement = document.getElementById('total-pnl');
    pnlElement.innerHTML = `
        <div class="text-2xl font-bold ${displayedTotalPnl >= 0 ? 'text-green-400' : 'text-red-400'}">
            ${displayedTotalPnl >= 0 ? '+' : ''}₹${formatCurrency(displayedTotalPnl)}
        </div>
        ${(displayedRealizedPnl !== 0 || displayedUnrealizedPnl !== 0) ? `
        <div class="text-xs text-slate-400 mt-1">
            R: ${displayedRealizedPnl >= 0 ? '+' : ''}₹${formatCurrency(displayedRealizedPnl)} | 
            U: ${displayedUnrealizedPnl >= 0 ? '+' : ''}₹${formatCurrency(displayedUnrealizedPnl)}
        </div>` : ''}
        ${displayedInstances.length !== instances.length ? `
        <div class="text-xs text-blue-400 mt-1">
            (${displayedInstances.length} of ${instances.length} instances)
        </div>` : ''}
    `;
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    document.getElementById('search-input').addEventListener('input', handleSearch);
    document.getElementById('admin-search-input').addEventListener('input', handleAdminSearch);
    
    // Mode filter
    document.getElementById('mode-filter').addEventListener('change', handleModeFilter);
    
    // View toggle
    document.getElementById('card-view-btn').addEventListener('click', () => setViewMode('card'));
    document.getElementById('table-view-btn').addEventListener('click', () => setViewMode('table'));
    
    // Auto refresh toggle
    document.getElementById('auto-refresh').addEventListener('change', handleAutoRefreshToggle);
    
    // Bulk actions
    document.getElementById('bulk-live-btn').addEventListener('click', () => bulkToggleAnalyzer(false));
    document.getElementById('bulk-analyzer-btn').addEventListener('click', () => bulkToggleAnalyzer(true));
    
    // Instance form
    document.getElementById('instance-form').addEventListener('submit', handleInstanceSubmit);
    document.getElementById('test-connection-btn').addEventListener('click', testConnection);
}

// Handle search
function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    filterInstances(query, document.getElementById('mode-filter').value);
}

function handleAdminSearch(event) {
    const query = event.target.value.toLowerCase();
    filterAdminInstances(query);
}

// Handle mode filter
function handleModeFilter(event) {
    const mode = event.target.value;
    const query = document.getElementById('search-input').value.toLowerCase();
    filterInstances(query, mode);
}

// Filter instances
function filterInstances(query, modeFilter) {
    filteredInstances = instances.filter(instance => {
        const matchesQuery = !query || 
            instance.name.toLowerCase().includes(query) ||
            instance.host_url.toLowerCase().includes(query) ||
            (instance.strategy_tag && instance.strategy_tag.toLowerCase().includes(query));
        
        const matchesMode = !modeFilter ||
            (modeFilter === 'live' && !instance.is_analyzer_mode) ||
            (modeFilter === 'analyzer' && instance.is_analyzer_mode);
        
        return matchesQuery && matchesMode;
    });
    
    renderInstances();
}

// Filter admin instances
function filterAdminInstances(query) {
    const filtered = instances.filter(instance => {
        return !query || 
            instance.name.toLowerCase().includes(query) ||
            instance.host_url.toLowerCase().includes(query) ||
            (instance.strategy_tag && instance.strategy_tag.toLowerCase().includes(query));
    });
    
    renderAdminInstances(filtered);
}

// Set view mode
function setViewMode(mode) {
    currentViewMode = mode;
    
    // Update button states
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${mode}-view-btn`).classList.add('active');
    
    // Update container class
    const container = document.getElementById('instances-container');
    container.className = `${mode}-view`;
    
    renderInstances();
}

// Handle auto refresh toggle
function handleAutoRefreshToggle(event) {
    if (event.target.checked) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

// Start auto refresh (aligned with backend 30-second monitoring)
function startAutoRefresh() {
    stopAutoRefresh(); // Clear any existing interval
    refreshInterval = setInterval(loadDashboardData, 30000); // 30 seconds
}

// Stop auto refresh
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Setup navigation based on user role
function setupNavigationBasedOnRole() {
    const usersNav = document.querySelector('.users-nav');
    
    if (isAdmin) {
        // Show Users tab for admin users
        if (usersNav) {
            usersNav.style.display = 'flex';
        }
        console.log('👑 Admin user - Users tab enabled');
    } else {
        // Hide Users tab for non-admin users
        if (usersNav) {
            usersNav.style.display = 'none';
        }
        console.log('👤 Regular user - Users tab hidden');
    }
}

// Show view
function showView(view) {
    // Prevent non-admin users from accessing users view
    if (view === 'users' && !isAdmin) {
        console.log('❌ Access denied: Users view requires admin privileges');
        view = 'dashboard'; // Redirect to dashboard
        currentView = 'dashboard';
    } else {
        currentView = view;
    }
    
    // Clear all nav items first
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active', 'bg-blue-500/20', 'border', 'border-blue-500/30', 'text-white');
        item.classList.add('text-slate-300');
    });
    
    // Activate the correct nav item
    if (view === 'dashboard') {
        const dashboardNav = document.querySelector('.dashboard-nav');
        if (dashboardNav) {
            dashboardNav.classList.remove('text-slate-300');
            dashboardNav.classList.add('active', 'bg-blue-500/20', 'border', 'border-blue-500/30', 'text-white');
        }
    } else if (view === 'admin') {
        const adminNav = document.querySelector('.admin-nav');
        if (adminNav) {
            adminNav.classList.remove('text-slate-300');
            adminNav.classList.add('active', 'bg-blue-500/20', 'border', 'border-blue-500/30', 'text-white');
        }
    } else if (view === 'users') {
        const usersNav = document.querySelector('.users-nav');
        if (usersNav) {
            usersNav.classList.remove('text-slate-300');
            usersNav.classList.add('active', 'bg-blue-500/20', 'border', 'border-blue-500/30', 'text-white');
        }
    }
    
    // Show/hide views
    document.getElementById('dashboard-view').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('admin-view').classList.toggle('hidden', view !== 'admin');
    document.getElementById('users-view').classList.toggle('hidden', view !== 'users');
    
    if (view === 'admin') {
        loadAdminInstances();
    } else if (view === 'users') {
        loadUsers();
    }
}

// Load admin instances
async function loadAdminInstances() {
    await loadDashboardData();
    renderAdminInstances(instances);
}

// Render instances
function renderInstances() {
    const container = document.getElementById('instances-container');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredInstances.length === 0) {
        container.style.display = 'none';
        emptyState.classList.remove('hidden');
        return;
    }
    
    container.style.display = currentViewMode === 'card' ? 'grid' : 'block';
    emptyState.classList.add('hidden');
    
    if (currentViewMode === 'card') {
        renderCardView(container);
    } else {
        renderTableView(container);
    }
}

// Render card view
function renderCardView(container) {
    container.innerHTML = filteredInstances.map(instance => {
        const instanceId = Number.parseInt(instance.id, 10);
        const safeInstanceId = Number.isNaN(instanceId) ? 0 : instanceId;
        const safeName = escapeHtml(instance.name || 'Unnamed');
        const safeHostUrl = sanitizeUrl(instance.host_url || '');
        const safeStrategyTag = instance.strategy_tag ? escapeHtml(instance.strategy_tag) : '';
        const isAnalyzer = Boolean(instance.is_analyzer_mode);
        const lastUpdated = instance.last_updated ? new Date(instance.last_updated).toLocaleDateString() : 'Unknown';
        
        return `
        <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-all duration-200">
            <!-- Header with checkbox and mode indicator -->
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <input type="checkbox" class="instance-checkbox" data-id="${safeInstanceId}" onchange="handleInstanceSelection(${safeInstanceId}, this.checked)">
                    <div class="flex items-center space-x-2">
                        <h3 class="text-white font-semibold text-base">${safeName}</h3>
                        <a href="${safeHostUrl}" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors duration-200">
                            <i data-lucide="external-link" class="w-4 h-4"></i>
                        </a>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="w-2 h-2 rounded-full ${isAnalyzer ? 'bg-orange-400' : 'bg-green-400'}"></div>
                    <span class="${isAnalyzer ? 'text-orange-400' : 'text-green-400'} text-sm font-medium">${isAnalyzer ? 'Analyzer' : 'Live'}</span>
                </div>
            </div>
            
            <!-- Strategy tag -->
            ${safeStrategyTag ? `<p class="text-slate-400 text-sm mb-4">${safeStrategyTag}</p>` : '<div class="mb-4"></div>'}
            
            <!-- Balance and P&L row -->
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p class="text-slate-400 text-sm mb-1">Balance</p>
                    <p class="text-white text-lg font-semibold">₹${formatCurrency(instance.current_balance)}</p>
                </div>
                <div>
                    <p class="text-slate-400 text-sm mb-1">P&L</p>
                    <p class="text-slate-400 text-lg font-medium">—</p>
                </div>
            </div>
            
            <!-- Target Profit and Target Loss row -->
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p class="text-slate-400 text-sm mb-1">Target Profit</p>
                    <p class="text-green-400 text-base font-medium">₹${formatCurrency(instance.target_profit)}</p>
                </div>
                <div>
                    <p class="text-slate-400 text-sm mb-1">Target Loss</p>
                    <p class="text-red-400 text-base font-medium">₹${formatCurrency(instance.target_loss)}</p>
                </div>
            </div>
            
            <!-- Last updated -->
            <div class="mb-4">
                <p class="text-slate-500 text-xs flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                    Updated ${escapeHtml(lastUpdated)}
                </p>
            </div>
            
            <!-- Action buttons -->
            <div class="flex space-x-2">
                <button onclick="refreshInstance(${safeInstanceId})" class="flex-1 bg-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm hover:bg-slate-600 transition-colors duration-200 flex items-center justify-center space-x-1">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    <span>Refresh</span>
                </button>
                <button onclick="toggleAnalyzerMode(${safeInstanceId}, ${!isAnalyzer})" class="flex-1 ${isAnalyzer ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} text-white py-2 px-4 rounded-lg text-sm transition-colors duration-200 flex items-center justify-center space-x-1">
                    <i data-lucide="power" class="w-4 h-4"></i>
                    <span>${isAnalyzer ? 'Go Live' : 'Analyzer'}</span>
                </button>
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// Render table view
function renderTableView(container) {
    container.innerHTML = `
        <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden">
            <table class="w-full">
                <thead class="bg-slate-700/50">
                    <tr class="text-left">
                        <th class="p-4 text-slate-300 font-medium">
                            <input type="checkbox" onchange="toggleSelectAll(this.checked)">
                        </th>
                        <th class="p-4 text-slate-300 font-medium">Name</th>
                        <th class="p-4 text-slate-300 font-medium">Host URL</th>
                        <th class="p-4 text-slate-300 font-medium">Strategy</th>
                        <th class="p-4 text-slate-300 font-medium">Balance</th>
                        <th class="p-4 text-slate-300 font-medium">P&L</th>
                        <th class="p-4 text-slate-300 font-medium">Target Profit</th>
                        <th class="p-4 text-slate-300 font-medium">Max Loss</th>
                        <th class="p-4 text-slate-300 font-medium">Mode</th>
                        <th class="p-4 text-slate-300 font-medium">Status</th>
                        <th class="p-4 text-slate-300 font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredInstances.map((instance) => {
                        const instanceId = Number.parseInt(instance.id, 10);
                        const safeInstanceId = Number.isNaN(instanceId) ? 0 : instanceId;
                        const safeName = escapeHtml(instance.name || 'Unnamed');
                        const safeHostUrl = sanitizeUrl(instance.host_url || '');
                        const hostLabel = escapeHtml(instance.host_url || '');
                        const safeStrategyTag = instance.strategy_tag ? escapeHtml(instance.strategy_tag) : '';
                        const isAnalyzer = Boolean(instance.is_analyzer_mode);
                        const isActive = Boolean(instance.is_active);
                        const pnlValue = (instance.total_pnl ?? instance.current_pnl) || 0;
                        const pnlClass = pnlValue >= 0 ? 'text-green-400' : 'text-red-400';
                        const realized = instance.realized_pnl;
                        const unrealized = instance.unrealized_pnl;

                        return `
                        <tr class="border-t border-slate-700/50 hover:bg-slate-700/20 transition-all duration-200">
                            <td class="p-4">
                                <input type="checkbox" class="instance-checkbox" data-id="${safeInstanceId}" onchange="handleInstanceSelection(${safeInstanceId}, this.checked)">
                            </td>
                            <td class="p-4">
                                <div class="text-white font-medium">${safeName}</div>
                            </td>
                            <td class="p-4">
                                <a href="${safeHostUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 text-sm transition-colors duration-200">
                                    ${hostLabel}
                                </a>
                            </td>
                            <td class="p-4">
                                ${safeStrategyTag ? `<span class="inline-block px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${safeStrategyTag}</span>` : '<span class="text-slate-500">-</span>'}
                            </td>
                            <td class="p-4">
                                <div class="text-white">₹${formatCurrency(instance.current_balance)}</div>
                            </td>
                            <td class="p-4">
                                <div class="${pnlClass}">
                                    ${pnlValue >= 0 ? '+' : ''}₹${formatCurrency(pnlValue)}
                                </div>
                                ${(realized !== undefined && unrealized !== undefined) ? `
                                <div class="text-xs text-slate-400 mt-1">
                                    R: ₹${formatCurrency(realized)} | U: ₹${formatCurrency(unrealized)}
                                </div>` : ''}
                            </td>
                            <td class="p-4">
                                <div class="text-green-400">₹${formatCurrency(instance.target_profit)}</div>
                            </td>
                            <td class="p-4">
                                <div class="text-red-400">₹${formatCurrency(instance.target_loss)}</div>
                            </td>
                            <td class="p-4">
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" ${isAnalyzer ? 'checked' : ''} 
                                           onchange="toggleAnalyzerMode(${safeInstanceId}, this.checked)" 
                                           class="sr-only">
                                    <div class="w-10 h-5 rounded-full transition-colors duration-200 ${isAnalyzer ? 'status-analyzer' : 'status-live'}">
                                        <div class="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${isAnalyzer ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5"></div>
                                    </div>
                                    <span class="text-sm text-slate-300">${isAnalyzer ? 'Analyzer' : 'Live'}</span>
                                </label>
                            </td>
                            <td class="p-4">
                                <div class="flex items-center space-x-2">
                                    <div class="w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}"></div>
                                    <span class="text-slate-300 text-sm">${isActive ? 'Online' : 'Offline'}</span>
                                </div>
                            </td>
                            <td class="p-4">
                                <div class="flex items-center space-x-1">
                                    <button onclick="editInstance(${safeInstanceId})" class="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200">
                                        <i data-lucide="edit" class="w-4 h-4"></i>
                                    </button>
                                    <button onclick="deleteInstance(${safeInstanceId})" class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200">
                                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    lucide.createIcons();
}

// Render admin instances
function renderAdminInstances(instanceList) {
    const container = document.getElementById('admin-instances');
    
    if (instanceList.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16">
                <div class="w-16 h-16 bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="server" class="w-8 h-8 text-slate-400"></i>
                </div>
                <h3 class="text-xl font-semibold text-white mb-2">No instances found</h3>
                <p class="text-slate-400 mb-6">Add your first OpenAlgo instance to get started</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = instanceList.map(instance => {
        const instanceId = Number.parseInt(instance.id, 10);
        const safeInstanceId = Number.isNaN(instanceId) ? 0 : instanceId;
        const safeName = escapeHtml(instance.name || 'Unnamed');
        const safeHostUrl = sanitizeUrl(instance.host_url || '');
        const hostLabel = escapeHtml(instance.host_url || '');
        const safeStrategyTag = instance.strategy_tag ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">${escapeHtml(instance.strategy_tag)}</span>` : '';
        const isActive = Boolean(instance.is_active);
        const pnlValue = (instance.total_pnl ?? instance.current_pnl) || 0;
        const pnlClass = pnlValue >= 0 ? 'text-green-400' : 'text-red-400';
        const realized = instance.realized_pnl;
        const unrealized = instance.unrealized_pnl;

        return `
        <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all duration-200">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-4">
                        <div class="flex-1">
                            <h3 class="text-white font-semibold text-lg mb-1">${safeName}</h3>
                            <a href="${safeHostUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block transition-colors duration-200">
                                ${hostLabel}
                            </a>
                            <div class="flex items-center space-x-4 text-sm text-slate-300">
                                ${safeStrategyTag}
                                <span>Balance: ₹${formatCurrency(instance.current_balance)}</span>
                                <span class="${pnlClass}">
                                    P&L: ${pnlValue >= 0 ? '+' : ''}₹${formatCurrency(pnlValue)}
                                    ${(realized !== undefined && unrealized !== undefined) ? ` (R: ₹${formatCurrency(realized)}, U: ₹${formatCurrency(unrealized)})` : ''}
                                </span>
                                <span class="flex items-center space-x-1">
                                    <div class="w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-red-400'}"></div>
                                    <span>${isActive ? 'Online' : 'Offline'}</span>
                                </span>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-slate-400 text-xs mb-2">Thresholds</div>
                            <div class="text-sm text-slate-300">
                                Profit: ₹${formatCurrency(instance.target_profit)}<br>
                                Loss: ₹${formatCurrency(instance.target_loss)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2 ml-6">
                    <button onclick="editInstance(${safeInstanceId})" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200 flex items-center space-x-2">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                        <span>Edit</span>
                    </button>
                    <button onclick="deleteInstance(${safeInstanceId})" class="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-all duration-200 flex items-center space-x-2">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

// Handle instance selection
function handleInstanceSelection(instanceId, selected) {
    if (selected) {
        selectedInstances.add(instanceId);
    } else {
        selectedInstances.delete(instanceId);
    }
    
    updateBulkActionsVisibility();
}

// Toggle select all
function toggleSelectAll(selected) {
    const checkboxes = document.querySelectorAll('.instance-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selected;
        const instanceId = parseInt(checkbox.dataset.id);
        handleInstanceSelection(instanceId, selected);
    });
}

// Update bulk actions visibility
function updateBulkActionsVisibility() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (selectedInstances.size > 0) {
        bulkActions.classList.remove('hidden');
        selectedCount.textContent = selectedInstances.size;
    } else {
        bulkActions.classList.add('hidden');
    }
}

// Bulk toggle analyzer
async function bulkToggleAnalyzer(analyzerMode) {
    const instanceIds = Array.from(selectedInstances);
    
    for (const instanceId of instanceIds) {
        try {
            await toggleAnalyzerMode(instanceId, analyzerMode);
        } catch (error) {
            console.error(`Failed to toggle analyzer for instance ${instanceId}:`, error);
        }
    }
    
    // Clear selection
    selectedInstances.clear();
    updateBulkActionsVisibility();
    
    // Refresh data
    await loadDashboardData();
}

// Refresh instance data
async function refreshInstance(instanceId) {
    try {
        showAlert('Refreshing instance data...', 'info');
        await loadDashboardData();
        showAlert('Instance data refreshed', 'success');
    } catch (error) {
        console.error('Error refreshing instance:', error);
        showAlert('Failed to refresh instance', 'error');
    }
}

// Toggle analyzer mode
async function toggleAnalyzerMode(instanceId, analyzerMode) {
    try {
        const response = await fetch(`${API_BASE}/instances/${instanceId}/toggle-analyzer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ mode: analyzerMode })
        });
        
        if (response.ok) {
            await loadDashboardData();
        } else {
            const error = await response.json();
            console.error('Failed to toggle analyzer mode:', error);
            alert(`Failed to toggle analyzer mode: ${error.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error toggling analyzer mode:', error);
        alert('Failed to toggle analyzer mode. Please try again.');
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

// Show add instance modal
function showAddInstanceModal() {
    document.getElementById('modal-title').textContent = 'Add New Instance';
    document.getElementById('submit-btn').textContent = 'Add Instance';
    document.getElementById('instance-form').reset();
    document.getElementById('instance-id').value = '';
    document.getElementById('connection-status').innerHTML = '';
    document.getElementById('instance-modal').classList.add('active');
}

// Edit instance
function editInstance(id) {
    const instance = instances.find(i => i.id === id);
    if (!instance) return;
    
    document.getElementById('modal-title').textContent = 'Edit Instance';
    document.getElementById('submit-btn').textContent = 'Update Instance';
    document.getElementById('instance-id').value = instance.id;
    document.getElementById('instance-name').value = instance.name;
    document.getElementById('host-url').value = instance.host_url;
    document.getElementById('api-key').value = instance.api_key;
    document.getElementById('strategy-tag').value = instance.strategy_tag || '';
    document.getElementById('target-profit').value = instance.target_profit || 5000;
    document.getElementById('target-loss').value = instance.target_loss || 2000;
    document.getElementById('connection-status').innerHTML = '';
    document.getElementById('instance-modal').classList.add('active');
}

// Close instance modal
function closeInstanceModal() {
    document.getElementById('instance-modal').classList.remove('active');
}

// Test connection
async function testConnection() {
    const hostUrl = document.getElementById('host-url').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    const statusDiv = document.getElementById('connection-status');
    const testBtn = document.getElementById('test-connection-btn');
    
    if (!hostUrl || !apiKey) {
        statusDiv.innerHTML = '<span class="text-red-400">Please enter both Host URL and API Key</span>';
        return;
    }
    
    testBtn.textContent = 'Testing...';
    testBtn.disabled = true;
    statusDiv.innerHTML = '<span class="text-blue-400">Testing connection...</span>';
    
    try {
        const response = await fetch(`${API_BASE}/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ host_url: hostUrl, api_key: apiKey })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            const safeBroker = escapeHtml(result.broker || 'Unknown');
            statusDiv.innerHTML = `<span class="text-green-400">✓ Connection successful! Broker: ${safeBroker}</span>`;
        } else {
            const failureMessage = escapeHtml(result.message || result.error || 'Unknown error');
            statusDiv.innerHTML = `<span class="text-red-400">✗ Connection failed: ${failureMessage}</span>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<span class="text-red-400">✗ Connection failed: ${escapeHtml(error.message || 'Unexpected error')}</span>`;
    } finally {
        testBtn.textContent = 'Test';
        testBtn.disabled = false;
    }
}

// Handle instance form submit
async function handleInstanceSubmit(event) {
    event.preventDefault();
    
    const instanceId = document.getElementById('instance-id').value;
    const formData = {
        name: document.getElementById('instance-name').value.trim(),
        host_url: document.getElementById('host-url').value.trim(),
        api_key: document.getElementById('api-key').value.trim(),
        strategy_tag: document.getElementById('strategy-tag').value.trim(),
        target_profit: parseFloat(document.getElementById('target-profit').value) || 5000,
        target_loss: parseFloat(document.getElementById('target-loss').value) || 2000
    };
    
    try {
        const url = instanceId ? `${API_BASE}/instances/${instanceId}` : `${API_BASE}/instances`;
        const method = instanceId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            closeInstanceModal();
            await loadDashboardData();
            if (currentView === 'admin') {
                renderAdminInstances(instances);
            }
        } else {
            const error = await response.json();
            alert(`Failed to ${instanceId ? 'update' : 'create'} instance: ${error.error}`);
        }
    } catch (error) {
        console.error('Error submitting instance:', error);
        alert(`Failed to ${instanceId ? 'update' : 'create'} instance. Please try again.`);
    }
}

// Delete instance
function deleteInstance(id) {
    const instance = instances.find(i => i.id === id);
    if (!instance) return;
    
    showConfirmModal(
        'Delete Instance',
        `Are you sure you want to delete "${instance.name}"? This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/instances/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    await loadDashboardData();
                    if (currentView === 'admin') {
                        renderAdminInstances(instances);
                    }
                } else {
                    const error = await response.json();
                    alert(`Failed to delete instance: ${error.error}`);
                }
            } catch (error) {
                console.error('Error deleting instance:', error);
                alert('Failed to delete instance. Please try again.');
            }
        }
    );
}

// Show confirmation modal
function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-yes-btn').onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
    document.getElementById('confirm-modal').classList.add('active');
}

// Close confirmation modal
function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
}

// User Management Functions
let users = [];

// Load users
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            users = await response.json();
            renderUsers();
        } else {
            console.error('Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Render users
function renderUsers() {
    const container = document.getElementById('users-list');
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center">
                <div class="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="users" class="w-6 h-6 text-slate-400"></i>
                </div>
                <h3 class="text-white font-semibold mb-2">No users added</h3>
                <p class="text-slate-400 text-sm">Add the first user email to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map((user, index) => {
        const safeEmail = escapeHtml(user.email || '');
        const emailInitial = escapeHtml((user.email || '?').charAt(0).toUpperCase());
        const addedDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
        const buttonMarkup = index === 0
            ? '<span class="px-3 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">Admin</span>'
            : `<button class="remove-user-btn p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200" data-email="${escapeHtml(user.email)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;

        return `
        <div class="flex items-center justify-between p-6 hover:bg-slate-700/20 transition-all duration-200">
            <div class="flex items-center space-x-4">
                <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
                    <span class="text-white font-semibold text-sm">${emailInitial}</span>
                </div>
                <div>
                    <div class="text-white font-medium">${safeEmail}</div>
                    <div class="text-slate-400 text-sm">Added ${escapeHtml(addedDate)}</div>
                </div>
            </div>
            <div class="flex items-center space-x-2">
                ${buttonMarkup}
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();

    container.querySelectorAll('.remove-user-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const emailToRemove = event.currentTarget.dataset.email;
            if (emailToRemove) {
                removeUser(emailToRemove);
            }
        });
    });
}

// Add user
async function addUser() {
    const emailInput = document.getElementById('new-user-email');
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        alert('Please enter a valid email address');
        return;
    }
    
    if (users.find(u => u.email === email)) {
        alert('This email is already added');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ email })
        });
        
        if (response.ok) {
            emailInput.value = '';
            await loadUsers();
        } else {
            const error = await response.json();
            alert(`Failed to add user: ${error.error}`);
        }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Failed to add user. Please try again.');
    }
}

// Remove user
function removeUser(email) {
    showConfirmModal(
        'Remove User',
        `Are you sure you want to remove "${email}" from the authorized users list?`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/users/${encodeURIComponent(email)}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    await loadUsers();
                } else {
                    const error = await response.json();
                    alert(`Failed to remove user: ${error.error}`);
                }
            } catch (error) {
                console.error('Error removing user:', error);
                alert('Failed to remove user. Please try again.');
            }
        }
    );
}

// Add Enter key listener to email input
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('new-user-email');
    if (emailInput) {
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addUser();
            }
        });
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
