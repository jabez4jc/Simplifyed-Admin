// Configuration
const API_BASE = "";

// Global state
let user = null;
let isAdmin = false;
let instances = [];
let filteredInstances = [];
let currentView = 'dashboard';
let selectedInstances = new Set();
let refreshInterval = null;
let currentViewMode = 'card'; // 'card' or 'table'

// Watchlist state
let watchlists = [];
let filteredWatchlists = [];
let currentWatchlist = null;
let currentWatchlistTab = 'symbols';
let expandedWatchlistId = null; // Track which watchlist is expanded
let expandedWatchlistData = {}; // Cache expanded watchlist data
let currentWatchlistForAddSymbol = null; // Track watchlist when adding symbols
let importWatchlistId = null; // Track watchlist for CSV import
let ltpRefreshInterval = null; // Track LTP refresh interval for expanded watchlist

// Options trading state
let optionsMode = 'buyer'; // 'buyer' or 'writer'
let currentOptionsSymbol = null; // Track current options trading symbol
let currentOptionsExpiries = []; // Cache expiries for current underlying

// Pre-configured strikes: ITM2, ITM1, ATM
const PRECONFIGURED_OFFSETS = {
    ITM2: { label: 'ITM2', value: 'ITM2', offset: -2 },
    ITM1: { label: 'ITM1', value: 'ITM1', offset: -1 },
    ATM:  { label: 'ATM',  value: 'ATM',  offset: 0 },
    OTM1: { label: 'OTM1', value: 'OTM1', offset: 1 },
    OTM2: { label: 'OTM2', value: 'OTM2', offset: 2 }
};

// Console logging state
let consoleLogs = [];
let consolePaused = false;
let consoleAutoScroll = true;

// ========================================
// Development Console Functions
// ========================================

/**
 * Get current timestamp for console logs
 */
function getConsoleTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-IN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
}

/**
 * Log an API request to the console
 */
function logApiRequest(url, method, data = null) {
    if (consolePaused) return;
    const log = {
        type: 'api-request',
        timestamp: getConsoleTimestamp(),
        message: `${method} ${url}`,
        details: data ? JSON.stringify(data, null, 2) : null
    };
    consoleLogs.push(log);
    renderConsoleLog(log);
    updateConsoleLogCount();
}

/**
 * Log an API success response to the console
 */
function logApiSuccess(url, method, response) {
    if (consolePaused) return;
    const log = {
        type: 'api-success',
        timestamp: getConsoleTimestamp(),
        message: `${method} ${url} - SUCCESS`,
        details: typeof response === 'string' ? response : JSON.stringify(response, null, 2)
    };
    consoleLogs.push(log);
    renderConsoleLog(log);
    updateConsoleLogCount();
}

/**
 * Log an API error to the console
 */
function logApiError(url, method, error) {
    if (consolePaused) return;
    const log = {
        type: 'api-error',
        timestamp: getConsoleTimestamp(),
        message: `${method} ${url} - ERROR`,
        details: typeof error === 'string' ? error : error.message || JSON.stringify(error, null, 2)
    };
    consoleLogs.push(log);
    renderConsoleLog(log);
    updateConsoleLogCount();
}

/**
 * Log a user action to the console
 */
function logUserAction(action, details = null) {
    if (consolePaused) return;
    const log = {
        type: 'user-action',
        timestamp: getConsoleTimestamp(),
        message: action,
        details: details ? JSON.stringify(details, null, 2) : null
    };
    consoleLogs.push(log);
    renderConsoleLog(log);
    updateConsoleLogCount();
}

/**
 * Log a system event to the console
 */
function logSystem(message, details = null) {
    if (consolePaused) return;
    const log = {
        type: 'system',
        timestamp: getConsoleTimestamp(),
        message: message,
        details: details ? JSON.stringify(details, null, 2) : null
    };
    consoleLogs.push(log);
    renderConsoleLog(log);
    updateConsoleLogCount();
}

/**
 * Render a single console log entry
 */
function renderConsoleLog(log) {
    const output = document.getElementById('console-output');
    if (!output) return;

    // Remove empty state if present
    const emptyState = output.querySelector('.console-empty');
    if (emptyState) {
        emptyState.remove();
    }

    const logDiv = document.createElement('div');
    logDiv.className = `console-log ${log.type}`;

    const typeLabel = {
        'api-request': 'API REQUEST',
        'api-success': 'API SUCCESS',
        'api-error': 'API ERROR',
        'user-action': 'USER ACTION',
        'system': 'SYSTEM'
    }[log.type] || 'LOG';

    logDiv.innerHTML = `
        <span class="timestamp">${log.timestamp}</span>
        <span class="type">${typeLabel}:</span>
        <span class="message">${escapeHtml(log.message)}</span>
        ${log.details ? `<pre class="details">${escapeHtml(log.details)}</pre>` : ''}
    `;

    output.appendChild(logDiv);

    // Auto-scroll to bottom if enabled
    if (consoleAutoScroll) {
        output.scrollTop = output.scrollHeight;
    }

    // Limit console logs to prevent memory issues (keep last 500)
    if (consoleLogs.length > 500) {
        consoleLogs = consoleLogs.slice(-500);
        const logs = output.querySelectorAll('.console-log');
        if (logs.length > 500) {
            for (let i = 0; i < logs.length - 500; i++) {
                logs[i].remove();
            }
        }
    }
}

/**
 * Update the console log count display
 */
function updateConsoleLogCount() {
    const countEl = document.getElementById('console-log-count');
    if (countEl) {
        countEl.textContent = consoleLogs.length;
    }
}

/**
 * Toggle console visibility
 */
function toggleConsole() {
    const console = document.getElementById('dev-console');
    const icon = document.getElementById('console-toggle-icon');

    if (console) {
        const isActive = console.classList.contains('active');
        console.classList.toggle('active');
        if (icon) {
            icon.classList.toggle('rotated');
        }

        // Update hint text
        const hintText = console.querySelector('.text-xs.text-slate-500');
        if (hintText) {
            if (!isActive) {
                // Console is being expanded
                hintText.textContent = '(click to collapse)';
                hintText.style.opacity = '0.6';
            } else {
                // Console is being collapsed
                hintText.textContent = '(click to expand)';
                hintText.style.opacity = '1';
            }
        }

        // Scroll to bottom when opening
        if (!isActive) {
            setTimeout(() => {
                const output = document.getElementById('console-output');
                if (output) {
                    output.scrollTop = output.scrollHeight;
                }
            }, 100);
        }
    }
}

/**
 * Clear console logs
 */
function clearConsole() {
    consoleLogs = [];
    const output = document.getElementById('console-output');
    if (output) {
        output.innerHTML = `
            <div class="console-empty text-slate-500 text-center py-8">
                <i data-lucide="terminal" class="w-12 h-12 mx-auto mb-2 text-slate-600"></i>
                <p>Console logs will appear here...</p>
                <p class="text-xs mt-1">All API calls, user actions, and system events will be logged</p>
            </div>
        `;
        lucide.createIcons({ root: output });
    }
    updateConsoleLogCount();
    logSystem('Console cleared');
}

/**
 * Toggle console pause state
 */
function toggleConsolePause() {
    consolePaused = !consolePaused;
    const btn = document.getElementById('console-pause-btn');
    const icon = btn.querySelector('i');
    const text = btn.querySelector('span');

    if (consolePaused) {
        btn.className = 'px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors';
        icon.setAttribute('data-lucide', 'pause');
        text.textContent = 'Resume';
        logSystem('Console logging paused');
    } else {
        btn.className = 'px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors';
        icon.setAttribute('data-lucide', 'play');
        text.textContent = 'Pause';
        logSystem('Console logging resumed');
    }

    lucide.createIcons({ root: btn });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initialize fetch interception for API logging
 */
function initializeApiLogging() {
    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
        const [url, options = {}] = args;
        const method = (options.method || 'GET').toUpperCase();

        // Log API request
        logApiRequest(url, method, options.body);

        try {
            const response = await originalFetch.apply(this, args);
            const responseClone = response.clone();

            // Log API success
            logApiSuccess(url, method, `Status: ${response.status} ${response.statusText}`);

            return response;
        } catch (error) {
            // Log API error
            logApiError(url, method, error);
            throw error;
        }
    };
}

// Initialize API logging on load
document.addEventListener('DOMContentLoaded', initializeApiLogging);

// ========================================
// Utility Functions
// ========================================

/**
 * Format currency with Indian numbering system and proper decimal places
 */
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Format number with thousand separators
 */
function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const iconMap = {
        success: { icon: 'check-circle', class: 'text-profit' },
        error: { icon: 'alert-circle', class: 'text-loss' },
        warning: { icon: 'alert-triangle', class: 'text-warning' },
        info: { icon: 'info', class: 'text-info' }
    };

    const config = iconMap[type] || iconMap.info;

    toast.className = `bg-slate-800/90 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4 shadow-xl transform transition-all duration-300 ease-in-out max-w-sm`;
    toast.innerHTML = `
        <div class="flex items-start space-x-3">
            <i data-lucide="${config.icon}" class="w-5 h-5 ${config.class} flex-shrink-0 mt-0.5"></i>
            <p class="text-white text-sm flex-1">${message}</p>
            <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    // Auto-remove after duration
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

/**
 * Toggle sidebar for mobile
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar) return;

    const isOpen = !sidebar.classList.contains('-translate-x-full');

    if (isOpen) {
        sidebar.classList.add('-translate-x-full');
        if (overlay) overlay.classList.add('hidden');
    } else {
        sidebar.classList.remove('-translate-x-full');
        if (overlay) overlay.classList.remove('hidden');
    }
}

/**
 * Close sidebar on mobile
 */
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
}

/**
 * Validate form field
 */
function validateField(field, rules = {}) {
    const value = field.value.trim();
    const errors = [];

    if (rules.required && !value) {
        errors.push(`${rules.label || 'This field'} is required`);
    }

    if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${rules.label || 'This field'} must be at least ${rules.minLength} characters`);
    }

    if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(rules.message || `${rules.label || 'This field'} format is invalid`);
    }

    if (rules.custom) {
        const customError = rules.custom(value);
        if (customError) errors.push(customError);
    }

    return errors;
}

/**
 * Show field validation error
 */
function showFieldError(field, errors) {
    // Remove existing error
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) existingError.remove();

    if (errors.length > 0) {
        field.classList.add('border-loss', 'focus:border-loss');
        field.classList.remove('border-slate-600', 'focus:border-blue-500');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error text-loss text-xs mt-1';
        errorDiv.textContent = errors[0];
        field.parentNode.appendChild(errorDiv);

        return false;
    } else {
        field.classList.remove('border-loss', 'focus:border-loss');
        field.classList.add('border-slate-600', 'focus:border-blue-500');
        return true;
    }
}

// Detect symbol type based on exchange and symbol name
function detectSymbolType(exchange, symbol) {
    const upperSymbol = symbol.toUpperCase();

    // Check if it's an options contract first
    if (upperSymbol.includes('CE') || upperSymbol.includes('PE')) {
        return {
            type: 'OPTIONS',
            canTradeEquity: false,
            canTradeFno: false,
            isFnoEligible: false,
            displayType: 'OPTIONS'
        };
    }

    // Check if it's a futures contract
    if (exchange === 'NFO') {
        return {
            type: 'FUTURE',
            canTradeEquity: false,
            canTradeFno: true,
            isFnoEligible: true,
            displayType: 'FUTURE'
        };
    }

    // Check if it's an index (underlying for options)
    if (exchange === 'NSE_INDEX') {
        return {
            type: 'INDEX',
            canTradeEquity: true,
            canTradeFno: true,
            isFnoEligible: true,
            displayType: 'INDEX'
        };
    }

    // Regular equity symbol
    return {
        type: 'EQUITY',
        canTradeEquity: true,
        canTradeFno: true,
        isFnoEligible: true,
        displayType: 'EQUITY'
    };
}

// Enhanced F&O Eligibility Detection using OpenAlgo Search API
// This function queries the OpenAlgo search API to determine actual F&O capabilities
async function detectSymbolTypeEnhanced(symbol) {
    if (!symbol || symbol.trim() === '') {
        return {
            type: 'EQUITY',
            canTradeEquity: true,
            canTradeFno: false,
            isFnoEligible: false,
            hasOptions: false,
            hasFutures: false,
            displayType: 'EQUITY',
            searchResults: []
        };
    }

    const symbolUpper = symbol.toUpperCase().trim();

    // Check cache first (24-hour expiry)
    const cacheKey = `fno_cache_${symbolUpper}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const cachedData = JSON.parse(cached);
            const cacheTime = new Date(cachedData.cachedAt).getTime();
            const now = new Date().getTime();
            const hoursPassed = (now - cacheTime) / (1000 * 60 * 60);

            if (hoursPassed < 24) {
                console.log(`📋 Using cached F&O data for ${symbolUpper}`);
                return cachedData.result;
            }
        } catch (e) {
            // Invalid cache, continue with fresh fetch
        }
    }

    try {
        console.log(`🔍 Fetching F&O eligibility for ${symbolUpper} from OpenAlgo API`);

        // Query the symbol-search API
        const params = new URLSearchParams({
            q: symbolUpper
        });

        const response = await fetch(`${API_BASE}/api/symbols/search?${params}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.data || [];

        if (results.length === 0) {
            // No results - likely not a valid symbol or equity-only
            const result = {
                type: 'EQUITY',
                canTradeEquity: true,
                canTradeFno: false,
                isFnoEligible: false,
                hasOptions: false,
                hasFutures: false,
                displayType: 'EQUITY',
                searchResults: results
            };

            // Cache negative result too
            localStorage.setItem(cacheKey, JSON.stringify({
                cachedAt: new Date().toISOString(),
                result: result
            }));

            return result;
        }

        // Analyze results to determine F&O eligibility
        let hasOptions = false;
        let hasFutures = false;
        let hasEquity = false;
        let isIndex = false;

        // Group results by underlying name
        const byName = {};
        results.forEach(item => {
            const name = (item.name || item.symbol || '').toUpperCase();
            if (!byName[name]) {
                byName[name] = [];
            }
            byName[name].push(item);
        });

        // Check each group
        Object.keys(byName).forEach(name => {
            const group = byName[name];
            const firstItem = group[0];

            // Check for options (OPTIDX or OPTSTK)
            const hasOptionsInGroup = group.some(item => {
                const instType = (item.instrument_type || '').toUpperCase();
                return instType === 'OPTIDX' || instType === 'OPTSTK' ||
                       (item.symbol || '').includes('CE') || (item.symbol || '').includes('PE');
            });

            // Check for futures (FUT or has expiry)
            const hasFuturesInGroup = group.some(item => {
                const instType = (item.instrument_type || '').toUpperCase();
                const sym = (item.symbol || '').toUpperCase();
                return instType === 'FUT' || instType === 'FUTIDX' || instType === 'FUTSTK' ||
                       sym.includes('FUT') || item.expiry || item.expiry_date;
            });

            // Check for equity (no expiry, matches symbol)
            const hasEquityInGroup = group.some(item => {
                const sym = (item.symbol || '').toUpperCase();
                const name = (item.name || '').toUpperCase();
                return sym === name && !item.expiry && !item.expiry_date &&
                       !sym.includes('CE') && !sym.includes('PE') && !sym.includes('FUT');
            });

            if (hasOptionsInGroup) hasOptions = true;
            if (hasFuturesInGroup) hasFutures = true;
            if (hasEquityInGroup) hasEquity = true;

            // Check if it's an index (NSE_INDEX exchange)
            if (group.some(item => (item.exchange || '').toUpperCase() === 'NSE_INDEX')) {
                isIndex = true;
            }
        });

        // Determine symbol type
        let type = 'EQUITY';
        let displayType = 'EQUITY';
        let canTradeEquity = hasEquity;
        let canTradeFno = hasFutures || hasOptions;
        let isFnoEligible = canTradeFno;

        // Check if this is a direct options contract
        if (symbolUpper.includes('CE') || symbolUpper.includes('PE')) {
            type = 'OPTIONS';
            displayType = 'OPTIONS';
            canTradeEquity = false;
            canTradeFno = false;
            isFnoEligible = false;
        }
        // Check if this is a futures contract
        else if (results.some(item => (item.symbol || '').toUpperCase().includes('FUT'))) {
            type = 'FUTURE';
            displayType = 'FUTURE';
            canTradeEquity = false;
            canTradeFno = true;
            isFnoEligible = true;
        }
        // Check if this is an index
        else if (isIndex) {
            type = 'INDEX';
            displayType = 'INDEX';
            canTradeEquity = true;
            canTradeFno = true;
            isFnoEligible = true;
        }
        // Regular equity
        else {
            type = 'EQUITY';
            displayType = 'EQUITY';
            canTradeEquity = true;
            canTradeFno = hasFutures || hasOptions;
            isFnoEligible = hasFutures || hasOptions;
        }

        const result = {
            type: type,
            canTradeEquity: canTradeEquity,
            canTradeFno: canTradeFno,
            isFnoEligible: isFnoEligible,
            hasOptions: hasOptions,
            hasFutures: hasFutures,
            displayType: displayType,
            searchResults: results
        };

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
            cachedAt: new Date().toISOString(),
            result: result
        }));

        console.log(`✅ F&O detection complete for ${symbolUpper}:`, {
            type: type,
            hasEquity: canTradeEquity,
            hasFutures: hasFutures,
            hasOptions: hasOptions
        });

        return result;

    } catch (error) {
        console.error('Error detecting F&O eligibility:', error);

        // Return default equity-only on error
        const result = {
            type: 'EQUITY',
            canTradeEquity: true,
            canTradeFno: false,
            isFnoEligible: false,
            hasOptions: false,
            hasFutures: false,
            displayType: 'EQUITY',
            searchResults: [],
            error: error.message
        };

        return result;
    }
}

// Test function to verify F&O detection
// Can be called from browser console: testFnoDetection('RELIANCE')
async function testFnoDetection(symbol) {
    console.log(`\n🧪 Testing F&O Detection for: ${symbol}`);
    console.log('='.repeat(60));

    const result = await detectSymbolTypeEnhanced(symbol);

    console.log('\n📊 Detection Results:');
    console.log(`  Type: ${result.type}`);
    console.log(`  Display Type: ${result.displayType}`);
    console.log(`  Can Trade Equity: ${result.canTradeEquity}`);
    console.log(`  Can Trade F&O: ${result.canTradeFno}`);
    console.log(`  Is F&O Eligible: ${result.isFnoEligible}`);
    console.log(`  Has Options: ${result.hasOptions}`);
    console.log(`  Has Futures: ${result.hasFutures}`);
    console.log(`  Search Results Count: ${result.searchResults?.length || 0}`);

    if (result.searchResults && result.searchResults.length > 0) {
        console.log('\n🔍 Sample Search Results:');
        result.searchResults.slice(0, 3).forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.symbol} - ${item.exchange} - ${item.instrument_type}`);
        });
        if (result.searchResults.length > 3) {
            console.log(`  ... and ${result.searchResults.length - 3} more results`);
        }
    }

    if (result.error) {
        console.log(`\n❌ Error: ${result.error}`);
    }

    console.log('\n' + '='.repeat(60));
    return result;
}

// Calculate actual strike price for a given offset
function calculateStrikePrice(offsetType, underlyingLTP, strikeInt) {
    const config = PRECONFIGURED_OFFSETS[offsetType];
    if (!config) return null;

    const offsetPoints = config.offset * strikeInt;
    return Math.round(underlyingLTP / strikeInt) * strikeInt + offsetPoints;
}

// Get available strikes for display
function getAvailableStrikes(underlyingLTP, strikeInt) {
    return Object.keys(PRECONFIGURED_OFFSETS).map(key => ({
        type: key,
        ...PRECONFIGURED_OFFSETS[key],
        strikePrice: calculateStrikePrice(key, underlyingLTP, strikeInt)
    }));
}

// Initialize the application
async function init() {
    console.log('🚀 Initializing Simplifyed Trading Dashboard...');

    // Log system initialization
    logSystem('Development Console initialized - API calls and user actions will be logged');

    try {
        // Initialize Lucide icons
        lucide.createIcons();

        // Check authentication status
        const authResponse = await fetch(`${API_BASE}/api/user`, { credentials: 'include' });
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
    document.getElementById('main-content').classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    hideLoading();
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
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
        const response = await fetch(`${API_BASE}/api/instances`, { credentials: 'include' });
        
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
        document.getElementById('total-pnl').className = 'text-4xl md:text-5xl font-bold text-slate-400';
        document.getElementById('pnl-change').textContent = '0.00%';
        document.getElementById('pnl-trend-up').classList.add('hidden');
        document.getElementById('pnl-trend-down').classList.add('hidden');
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
    document.getElementById('total-cash').textContent = formatCurrency(totalCash);

    // Update P&L with comprehensive breakdown
    const pnlElement = document.getElementById('total-pnl');
    pnlElement.innerHTML = `
        <div class="text-4xl md:text-5xl font-bold ${displayedTotalPnl >= 0 ? 'text-profit' : 'text-loss'}">
            ${displayedTotalPnl >= 0 ? '+' : ''}${formatCurrency(displayedTotalPnl)}
        </div>
        ${(displayedRealizedPnl !== 0 || displayedUnrealizedPnl !== 0) ? `
        <div class="text-sm text-slate-400 mt-1">
            R: ${displayedRealizedPnl >= 0 ? '+' : ''}${formatCurrency(displayedRealizedPnl)} |
            U: ${displayedUnrealizedPnl >= 0 ? '+' : ''}${formatCurrency(displayedUnrealizedPnl)}
        </div>` : ''}
        ${displayedInstances.length !== instances.length ? `
        <div class="text-sm text-info mt-1">
            (${displayedInstances.length} of ${instances.length} instances)
        </div>` : ''}
    `;

    // Update P&L trend indicator
    const trendUp = document.getElementById('pnl-trend-up');
    const trendDown = document.getElementById('pnl-trend-down');
    const changeElement = document.getElementById('pnl-change');

    if (displayedTotalPnl > 0) {
        trendUp.classList.remove('hidden');
        trendDown.classList.add('hidden');
        changeElement.textContent = `+${formatNumber((displayedTotalPnl / totalCash) * 100, 2)}%`;
    } else if (displayedTotalPnl < 0) {
        trendUp.classList.add('hidden');
        trendDown.classList.remove('hidden');
        changeElement.textContent = `${formatNumber((displayedTotalPnl / totalCash) * 100, 2)}%`;
    } else {
        trendUp.classList.add('hidden');
        trendDown.classList.add('hidden');
        changeElement.textContent = '0.00%';
    }
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

    // Real-time form validation
    const nameField = document.getElementById('instance-name');
    const hostField = document.getElementById('host-url');
    const apiKeyField = document.getElementById('api-key');

    if (nameField) {
        nameField.addEventListener('input', (e) => {
            const errors = validateField(e.target, { required: true, label: 'Instance Name', minLength: 2 });
            showFieldError(e.target, errors);
        });
    }

    if (hostField) {
        hostField.addEventListener('input', (e) => {
            const errors = validateField(e.target, { required: true, label: 'Host URL' });
            showFieldError(e.target, errors);
        });
    }

    if (apiKeyField) {
        apiKeyField.addEventListener('input', (e) => {
            const errors = validateField(e.target, { required: true, label: 'API Key', minLength: 10 });
            showFieldError(e.target, errors);
        });
    }
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
    } else if (view === 'watchlists') {
        const watchlistsNav = document.querySelector('.watchlists-nav');
        if (watchlistsNav) {
            watchlistsNav.classList.remove('text-slate-300');
            watchlistsNav.classList.add('active', 'bg-blue-500/20', 'border', 'border-blue-500/30', 'text-white');
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
    document.getElementById('watchlists-view').classList.toggle('hidden', view !== 'watchlists');
    document.getElementById('users-view').classList.toggle('hidden', view !== 'users');

    if (view === 'admin') {
        loadAdminInstances();
    } else if (view === 'watchlists') {
        loadWatchlists();
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
    container.innerHTML = filteredInstances.map(instance => `
        <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-all duration-200">
            <!-- Header with checkbox and mode indicator -->
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <input type="checkbox" class="instance-checkbox" data-id="${instance.id}" onchange="handleInstanceSelection(${instance.id}, this.checked)">
                    <div class="flex items-center space-x-2">
                        <h3 class="text-white font-semibold text-base">${instance.name}</h3>
                        <a href="${instance.host_url}" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors duration-200">
                            <i data-lucide="external-link" class="w-4 h-4"></i>
                        </a>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="w-2 h-2 rounded-full ${instance.is_analyzer_mode ? 'bg-orange-400' : 'bg-green-400'}"></div>
                    <span class="${instance.is_analyzer_mode ? 'text-orange-400' : 'text-green-400'} text-sm font-medium">${instance.is_analyzer_mode ? 'Analyzer' : 'Live'}</span>
                </div>
            </div>
            
            <!-- Strategy tag -->
            ${instance.strategy_tag ? `<p class="text-slate-400 text-sm mb-4">${instance.strategy_tag}</p>` : '<div class="mb-4"></div>'}
            
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
                    Updated ${new Date(instance.last_updated).toLocaleDateString()}
                </p>
            </div>
            
            <!-- Action buttons -->
            <div class="flex space-x-2">
                <button onclick="refreshInstance(${instance.id})" class="flex-1 bg-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm hover:bg-slate-600 transition-colors duration-200 flex items-center justify-center space-x-1">
                    <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    <span>Refresh</span>
                </button>
                <button onclick="toggleAnalyzerMode(${instance.id}, ${!instance.is_analyzer_mode})" class="flex-1 ${instance.is_analyzer_mode ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} text-white py-2 px-4 rounded-lg text-sm transition-colors duration-200 flex items-center justify-center space-x-1">
                    <i data-lucide="power" class="w-4 h-4"></i>
                    <span>${instance.is_analyzer_mode ? 'Go Live' : 'Analyzer'}</span>
                </button>
            </div>
        </div>
    `).join('');
    
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
                    ${filteredInstances.map((instance, index) => `
                        <tr class="border-t border-slate-700/50 hover:bg-slate-700/20 transition-all duration-200">
                            <td class="p-4">
                                <input type="checkbox" class="instance-checkbox" data-id="${instance.id}" onchange="handleInstanceSelection(${instance.id}, this.checked)">
                            </td>
                            <td class="p-4">
                                <div class="text-white font-medium">${instance.name}</div>
                            </td>
                            <td class="p-4">
                                <a href="${instance.host_url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 text-sm transition-colors duration-200">
                                    ${instance.host_url}
                                </a>
                            </td>
                            <td class="p-4">
                                ${instance.strategy_tag ? `<span class="inline-block px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${instance.strategy_tag}</span>` : '<span class="text-slate-500">-</span>'}
                            </td>
                            <td class="p-4">
                                <div class="text-white">₹${formatCurrency(instance.current_balance)}</div>
                            </td>
                            <td class="p-4">
                                <div class="${(instance.total_pnl || instance.current_pnl) >= 0 ? 'text-green-400' : 'text-red-400'}">
                                    ${(instance.total_pnl || instance.current_pnl) >= 0 ? '+' : ''}₹${formatCurrency(instance.total_pnl || instance.current_pnl)}
                                </div>
                                ${(instance.realized_pnl !== undefined && instance.unrealized_pnl !== undefined) ? `
                                <div class="text-xs text-slate-400 mt-1">
                                    R: ₹${formatCurrency(instance.realized_pnl)} | U: ₹${formatCurrency(instance.unrealized_pnl)}
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
                                    <input type="checkbox" ${instance.is_analyzer_mode ? 'checked' : ''} 
                                           onchange="toggleAnalyzerMode(${instance.id}, this.checked)" 
                                           class="sr-only">
                                    <div class="w-10 h-5 rounded-full transition-colors duration-200 ${instance.is_analyzer_mode ? 'status-analyzer' : 'status-live'}">
                                        <div class="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${instance.is_analyzer_mode ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5"></div>
                                    </div>
                                    <span class="text-sm text-slate-300">${instance.is_analyzer_mode ? 'Analyzer' : 'Live'}</span>
                                </label>
                            </td>
                            <td class="p-4">
                                <div class="flex items-center space-x-2">
                                    <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}"></div>
                                    <span class="text-slate-300 text-sm">${instance.is_active ? 'Online' : 'Offline'}</span>
                                </div>
                            </td>
                            <td class="p-4">
                                <div class="flex items-center space-x-1">
                                    <button onclick="editInstance(${instance.id})" class="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200">
                                        <i data-lucide="edit" class="w-4 h-4"></i>
                                    </button>
                                    <button onclick="deleteInstance(${instance.id})" class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200">
                                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
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
    
    container.innerHTML = instanceList.map(instance => `
        <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all duration-200">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-4">
                        <div class="flex-1">
                            <h3 class="text-white font-semibold text-lg mb-1">${instance.name}</h3>
                            <a href="${instance.host_url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block transition-colors duration-200">
                                ${instance.host_url}
                            </a>
                            <div class="flex items-center space-x-4 text-sm text-slate-300">
                                ${instance.strategy_tag ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">${instance.strategy_tag}</span>` : ''}
                                <span>Balance: ₹${formatCurrency(instance.current_balance)}</span>
                                <span class="${(instance.total_pnl || instance.current_pnl) >= 0 ? 'text-green-400' : 'text-red-400'}">
                                    P&L: ${(instance.total_pnl || instance.current_pnl) >= 0 ? '+' : ''}₹${formatCurrency(instance.total_pnl || instance.current_pnl)}
                                    ${(instance.realized_pnl !== undefined && instance.unrealized_pnl !== undefined) ? ` (R: ₹${formatCurrency(instance.realized_pnl)}, U: ₹${formatCurrency(instance.unrealized_pnl)})` : ''}
                                </span>
                                <span class="flex items-center space-x-1">
                                    <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400' : 'bg-red-400'}"></div>
                                    <span>${instance.is_active ? 'Online' : 'Offline'}</span>
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
                    <button onclick="editInstance(${instance.id})" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200 flex items-center space-x-2">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                        <span>Edit</span>
                    </button>
                    <button onclick="deleteInstance(${instance.id})" class="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-all duration-200 flex items-center space-x-2">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
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
        const response = await fetch(`${API_BASE}/api/instances/${instanceId}/toggle-analyzer`, {
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
    document.getElementById('is-primary-admin').checked = Boolean(instance.is_primary_admin);
    document.getElementById('is-secondary-admin').checked = Boolean(instance.is_secondary_admin);
    document.getElementById('connection-status').innerHTML = '';
    document.getElementById('instance-modal').classList.add('active');
    lucide.createIcons();
}

// Close instance modal
function closeInstanceModal() {
    document.getElementById('instance-modal').classList.remove('active');
    document.getElementById('instance-form').reset();
    document.getElementById('instance-id').value = '';
    document.getElementById('modal-title').textContent = 'Add New Instance';
    document.getElementById('submit-btn').textContent = 'Add Instance';
    document.getElementById('connection-status').innerHTML = '';
    document.getElementById('is-primary-admin').checked = false;
    document.getElementById('is-secondary-admin').checked = false;
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
        const response = await fetch(`${API_BASE}/api/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ host_url: hostUrl, api_key: apiKey })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            statusDiv.innerHTML = `<span class="text-green-400">✓ Connection successful! Broker: ${result.broker || 'Unknown'}</span>`;
        } else {
            statusDiv.innerHTML = `<span class="text-red-400">✗ Connection failed: ${result.message || result.error}</span>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<span class="text-red-400">✗ Connection failed: ${error.message}</span>`;
    } finally {
        testBtn.textContent = 'Test';
        testBtn.disabled = false;
    }
}

// Handle instance form submit
async function handleInstanceSubmit(event) {
    event.preventDefault();

    const instanceId = document.getElementById('instance-id').value;
    const nameField = document.getElementById('instance-name');
    const hostField = document.getElementById('host-url');
    const apiKeyField = document.getElementById('api-key');

    // Validate required fields
    const nameErrors = validateField(nameField, { required: true, label: 'Instance Name', minLength: 2 });
    const hostErrors = validateField(hostField, { required: true, label: 'Host URL' });
    const apiKeyErrors = validateField(apiKeyField, { required: true, label: 'API Key', minLength: 10 });

    const isNameValid = showFieldError(nameField, nameErrors);
    const isHostValid = showFieldError(hostField, hostErrors);
    const isApiKeyValid = showFieldError(apiKeyField, apiKeyErrors);

    if (!isNameValid || !isHostValid || !isApiKeyValid) {
        showToast('Please fix the errors above', 'error');
        return;
    }

    const formData = {
        name: nameField.value.trim(),
        host_url: hostField.value.trim(),
        api_key: apiKeyField.value.trim(),
        strategy_tag: document.getElementById('strategy-tag').value.trim(),
        target_profit: parseFloat(document.getElementById('target-profit').value) || 5000,
        target_loss: parseFloat(document.getElementById('target-loss').value) || 2000,
        is_primary_admin: document.getElementById('is-primary-admin').checked ? 1 : 0,
        is_secondary_admin: document.getElementById('is-secondary-admin').checked ? 1 : 0
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
            showToast(`Instance ${instanceId ? 'updated' : 'created'} successfully`, 'success');
            await loadDashboardData();
            if (currentView === 'admin') {
                renderAdminInstances(instances);
            }
        } else {
            const error = await response.json();
            showToast(`Failed to ${instanceId ? 'update' : 'create'} instance: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error submitting instance:', error);
        showToast(`Failed to ${instanceId ? 'update' : 'create'} instance. Please try again.`, 'error');
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
                const response = await fetch(`${API_BASE}/api/instances/${id}`, {
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
        const response = await fetch(`${API_BASE}/api/users`, {
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

    container.innerHTML = users.map((user, index) => `
        <div class="flex items-center justify-between p-6 hover:bg-slate-700/20 transition-all duration-200">
            <div class="flex items-center space-x-4">
                <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
                    <span class="text-white font-semibold text-sm">${user.email.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                    <div class="text-white font-medium">${user.email}</div>
                    <div class="text-slate-400 text-sm">Added ${new Date(user.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <div class="flex items-center space-x-2">
                ${index === 0 ? 
                    '<span class="px-3 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">Admin</span>' : 
                    '<button onclick="removeUser(\'' + user.email + '\')" class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"><i data-lucide="trash-2" class="w-4 h-4"></i></button>'
                }
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
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
        const response = await fetch(`${API_BASE}/api/users`, {
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
                const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(email)}`, {
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

// ========================================
// WATCHLIST MANAGEMENT FUNCTIONS
// ========================================

// Load all watchlists
async function loadWatchlists() {
    try {
        const response = await fetch(`${API_BASE}/api/watchlists`, { credentials: 'include' });

        if (response.ok) {
            const data = await response.json();
            watchlists = data.data || data;
            filteredWatchlists = [...watchlists];
            renderWatchlists();
        } else {
            console.error('Failed to load watchlists');
            showWatchlistsEmptyState();
        }
    } catch (error) {
        console.error('Error loading watchlists:', error);
        showWatchlistsEmptyState();
    }
}

// Render watchlists with accordion layout
function renderWatchlists() {
    const container = document.getElementById('watchlists-list');
    const emptyState = document.getElementById('watchlists-empty-state');

    if (filteredWatchlists.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    console.log('DEBUG renderWatchlists: expandedWatchlistData cache:', expandedWatchlistData);
    console.log('DEBUG renderWatchlists: expandedWatchlistId:', expandedWatchlistId);

    container.innerHTML = filteredWatchlists.map(watchlist => {
        const isExpanded = expandedWatchlistId === watchlist.id;
        return `
            <div class="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden hover:border-slate-600/50 transition-all duration-200">
                <!-- Watchlist Header (Always Visible) -->
                <div class="p-6">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center space-x-3 mb-2">
                                <button onclick="toggleWatchlistExpansion(${watchlist.id})" class="text-white font-semibold text-lg hover:text-blue-300 flex items-center space-x-2">
                                    <i data-lucide="chevron-${isExpanded ? 'down' : 'right'}" class="w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}"></i>
                                    <span>${watchlist.name}</span>
                                </button>
                                <button onclick="viewWatchlist(${watchlist.id})" class="text-slate-400 hover:text-blue-300 p-1 rounded transition-all duration-200" title="View Details">
                                    <i data-lucide="eye" class="w-4 h-4"></i>
                                </button>
                                ${watchlist.is_active ?
                                    '<span class="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30">Active</span>' :
                                    '<span class="px-2 py-1 bg-slate-500/20 text-slate-300 text-xs rounded-full border border-slate-500/30">Inactive</span>'
                                }
                            </div>
                            ${watchlist.description ? `<p class="text-slate-400 text-sm mb-3">${watchlist.description}</p>` : ''}
                            <div class="flex items-center space-x-6 text-sm text-slate-300">
                                <span class="flex items-center space-x-1">
                                    <i data-lucide="list" class="w-4 h-4"></i>
                                    <span>${watchlist.symbol_count || 0} symbols</span>
                                </span>
                                <span class="flex items-center space-x-1">
                                    <i data-lucide="server" class="w-4 h-4"></i>
                                    <span>${watchlist.instance_count || 0} instances</span>
                                </span>
                                <span class="text-slate-500 text-xs">
                                    <i data-lucide="clock" class="w-3 h-3 inline mr-1"></i>
                                    Created ${new Date(watchlist.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 ml-6">
                            <button onclick="cloneWatchlist(${watchlist.id})" class="px-4 py-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-all duration-200 flex items-center space-x-2">
                                <i data-lucide="copy" class="w-4 h-4"></i>
                                <span>Clone</span>
                            </button>
                            <button onclick="exportWatchlistCsv(${watchlist.id})" class="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-300 rounded-lg hover:bg-green-500/30 transition-all duration-200" title="Export CSV">
                                <i data-lucide="download" class="w-4 h-4"></i>
                            </button>
                            <button onclick="showImportCsvModal(${watchlist.id})" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200" title="Import CSV">
                                <i data-lucide="upload" class="w-4 h-4"></i>
                            </button>
                            <button onclick="editWatchlist(${watchlist.id})" class="px-4 py-2 bg-slate-500/20 border border-slate-500/30 text-slate-300 rounded-lg hover:bg-slate-500/30 transition-all duration-200">
                                <i data-lucide="edit" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteWatchlist(${watchlist.id})" class="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-all duration-200">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Expanded Content (Symbols) -->
                ${isExpanded ? `
                    <div class="border-t border-slate-700/50 bg-slate-700/20 p-6">
                        <div id="watchlist-${watchlist.id}-content">
                            ${(() => {
                                const data = expandedWatchlistData[watchlist.id];
                                console.log('DEBUG: Inside render - watchlist.id=' + watchlist.id + ', data exists=' + !!data);
                                if (!data) {
                                    console.log('DEBUG: No data, showing loading');
                                    return '<div class="text-center py-8"><p class="text-slate-400">Loading symbols...</p></div>';
                                }

                                // INLINE LOGIC: Render symbols directly
                                const symbols = data.symbols || [];
                                const instances = data.instances || [];
                                console.log('DEBUG: Direct render - symbols=' + symbols.length + ', instances=' + instances.length);

                                if (symbols.length === 0) {
                                    return '<div class="text-center py-8">' +
                                        '<i data-lucide="list" class="w-12 h-12 text-slate-600 mx-auto mb-4"></i>' +
                                        '<p class="text-slate-400 mb-4">No symbols in this watchlist</p>' +
                                        '<button onclick="showAddSymbolForm()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200">' +
                                            '<i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Add Symbol' +
                                        '</button>' +
                                    '</div>';
                                }

                                // Has symbols - render them
                                let html = '<div class="space-y-4">' +
                                    '<div class="flex items-center justify-between mb-4">' +
                                        '<h4 class="text-white font-semibold">Symbols (' + symbols.length + ')</h4>' +
                                        '<div class="flex space-x-2">' +
                                            '<button onclick="showAddSymbolForm()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-sm hover:bg-blue-500/30 transition-all duration-200">' +
                                                '<i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Add Symbol' +
                                            '</button>' +
                                        '</div>' +
                                    '</div>' +
                                    '<div class="space-y-2">';

                                symbols.forEach(function(symbol) {
                                    // Use F&O configuration from database (Phase 2)
                                    // Check for integer 1 (from database) or boolean true (from code)
                                    const canTradeEquity = symbol.can_trade_equity === 1 || symbol.can_trade_equity === true || symbol.can_trade_equity === '1';
                                    const canTradeFutures = symbol.can_trade_futures === 1 || symbol.can_trade_futures === true || symbol.can_trade_futures === '1';
                                    const canTradeOptions = symbol.can_trade_options === 1 || symbol.can_trade_options === true || symbol.can_trade_options === '1';
                                    const optionsStrikeOffset = symbol.options_strike_offset || 'ATM';
                                    const optionsExpiryMode = symbol.options_expiry_mode || 'AUTO';

                                    let tradingSection = '';

                                    // Determine trading type for display
                                    let displayType = 'EQUITY';
                                    if (canTradeEquity && (canTradeFutures || canTradeOptions)) {
                                        displayType = 'F&O';
                                    } else if (canTradeFutures && !canTradeEquity) {
                                        displayType = 'FUTURES';
                                    } else if (canTradeOptions && !canTradeEquity) {
                                        displayType = 'OPTIONS';
                                    }

                                    // Generate trading buttons based on F&O configuration
                                    // Per Requirements: Show toggle for Equity+F&O symbols only, always show Options separately
                                    // Buttons: Only BUY/SELL/EXIT (no SHORT/COVER)
                                    if (canTradeEquity && canTradeFutures) {
                                        // Show toggle between Equity and Futures modes
                                        const toggleId = 'fno-toggle-' + symbol.symbol_id;
                                        tradingSection =
                                            '<div class="flex flex-col space-y-2 w-full">' +
                                                '<div class="flex items-center justify-between">' +
                                                    '<span class="text-xs text-slate-400">Trade Mode:</span>' +
                                                    '<span id="fno-mode-text-' + symbol.symbol_id + '" class="text-xs font-medium text-blue-300">Equity</span>' +
                                                '</div>' +
                                                '<div class="flex items-center space-x-2">' +
                                                    '<label class="relative inline-flex items-center cursor-pointer">' +
                                                        '<input type="checkbox" id="' + toggleId + '" class="sr-only peer" onchange="toggleFnoMode(' + symbol.symbol_id + ', this.checked)">' +
                                                        '<div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>' +
                                                    '</label>' +
                                                '</div>' +
                                                '<div id="equity-buttons-' + symbol.symbol_id + '" class="flex space-x-2">' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\')" class="flex-1 px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY</button>' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\')" class="flex-1 px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL</button>' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'EXIT\')" class="flex-1 px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30">EXIT</button>' +
                                                '</div>' +
                                                '<div id="fno-buttons-' + symbol.symbol_id + '" class="hidden flex flex-wrap gap-1">' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY</button>' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL</button>' +
                                                    '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'EXIT\')" class="px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30">EXIT</button>' +
                                                '</div>' +
                                            '</div>';

                                        // Always show Options buttons if available
                                        if (canTradeOptions) {
                                            tradingSection +=
                                                '<div class="flex flex-col space-y-1 mt-2">' +
                                                    '<div class="text-xs text-slate-400">Options: ' + optionsStrikeOffset + ' • ' + optionsExpiryMode + '</div>' +
                                                    '<div class="flex flex-wrap gap-2">' +
                                                        '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\', \'CE\')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY CE</button>' +
                                                        '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\', \'CE\')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL CE</button>' +
                                                        '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\', \'PE\')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY PE</button>' +
                                                        '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\', \'PE\')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL PE</button>' +
                                                        '<button onclick="exitAllOptionsPositions(' + symbol.symbol_id + ')" class="px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30">EXIT ALL</button>' +
                                                    '</div>' +
                                                '</div>';
                                        }
                                    } else if (canTradeFutures && !canTradeEquity) {
                                        // Futures only (no equity) - simple buttons only
                                        tradingSection =
                                            '<div class="flex space-x-2">' +
                                                '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\')" class="flex-1 px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY</button>' +
                                                '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\')" class="flex-1 px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL</button>' +
                                                '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'EXIT\')" class="flex-1 px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30">EXIT</button>' +
                                            '</div>';
                                    } else {
                                        // Equity only
                                        tradingSection =
                                            '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'BUY\')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30">BUY</button>' +
                                            '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'SELL\')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30">SELL</button>' +
                                            '<button onclick="placeQuickOrder(' + symbol.symbol_id + ', \'EXIT\')" class="px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30">EXIT</button>';
                                    }

                                    html += '<div class="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">' +
                                        '<div class="flex items-start justify-between">' +
                                            '<div class="flex-1">' +
                                                '<div class="text-white font-semibold">' + symbol.symbol + '</div>' +
                                                '<div class="text-slate-400 text-sm mb-1">' + symbol.exchange + ' • ' + displayType + '</div>' +
                                                '<div class="text-slate-400 text-sm">Config: ' + (symbol.qty_mode || 'fixed') + ' - ' + (symbol.qty_value || 1) + ' ' + (symbol.qty_units || 'units') + '</div>' +
                                            '</div>' +
                                            '<div class="flex space-x-2 ml-4">' +
                                                '<button onclick="editSymbolConfig(' + symbol.symbol_id + ')" class="px-3 py-1 bg-slate-500/20 border border-slate-500/30 text-slate-300 rounded text-sm hover:bg-slate-500/30" title="Edit Symbol"><i data-lucide="edit" class="w-3 h-3"></i></button>' +
                                                '<button onclick="deleteSymbol(' + symbol.symbol_id + ', \'' + symbol.symbol + '\', ' + watchlist.id + ')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30" title="Delete Symbol"><i data-lucide="trash-2" class="w-3 h-3"></i></button>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div class="mt-3">' + tradingSection + '</div>' +
                                    '</div>';
                                });

                                html += '</div></div>';

                                // Render instances section
                                if (instances.length > 0) {
                                    html += '<div class="mt-6">' +
                                        '<div class="flex items-center justify-between mb-3">' +
                                            '<h4 class="text-white font-semibold">Assigned Instances (' + instances.length + ')</h4>' +
                                        '</div>' +
                                        '<div class="grid grid-cols-2 gap-2">';

                                    instances.forEach(instance => {
                                        html += '<div class="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg">' +
                                            '<div class="w-2 h-2 rounded-full ' + (instance.is_active ? 'bg-green-400' : 'bg-red-400') + '"></div>' +
                                            '<div class="flex-1 min-w-0">' +
                                                '<div class="text-white text-sm font-medium truncate">' + instance.name + '</div>' +
                                                '<div class="text-slate-400 text-xs truncate">' + (instance.broker || 'Unknown Broker') + '</div>' +
                                            '</div>' +
                                            '<div class="text-xs">' +
                                                (instance.is_analyzer_mode ?
                                                    '<span class="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">Analyzer</span>' :
                                                    '<span class="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">Live</span>') +
                                            '</div>' +
                                        '</div>';
                                    });

                                    html += '</div></div>';
                                }

                                return html;
                            })()}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    lucide.createIcons();

    // Load expanded watchlist data if needed
    if (expandedWatchlistId && !expandedWatchlistData[expandedWatchlistId]) {
        loadWatchlistDetails(expandedWatchlistId);
    }
}

// Start LTP refresh for expanded watchlist
function startLtpRefresh(watchlistId) {
    console.log('[LTP] Starting refresh for watchlist:', watchlistId);

    // Log system event
    logSystem(`LTP refresh started for watchlist ${watchlistId}`, { interval: '15 seconds' });

    // Clear existing interval
    if (ltpRefreshInterval) {
        clearInterval(ltpRefreshInterval);
    }

    // Initial fetch
    refreshWatchlistLtp(watchlistId);

    // Set up 15-second interval (as per requirements)
    ltpRefreshInterval = setInterval(() => {
        refreshWatchlistLtp(watchlistId);
    }, 15000); // 15 seconds

    console.log('[LTP] Refresh interval started (15 seconds)');
}

// Stop LTP refresh
function stopLtpRefresh() {
    if (ltpRefreshInterval) {
        clearInterval(ltpRefreshInterval);
        ltpRefreshInterval = null;
        console.log('[LTP] Refresh interval stopped');
    }
}

// Refresh LTP for a watchlist
async function refreshWatchlistLtp(watchlistId) {
    try {
        console.log('[LTP] Fetching market data for watchlist:', watchlistId);
        logSystem(`Fetching LTP data for watchlist ${watchlistId}`);

        const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}`, { credentials: 'include' });

        if (response.ok) {
            const result = await response.json();
            const watchlistData = result.data || result;

            if (watchlistData.symbols && Array.isArray(watchlistData.symbols)) {
                console.log('[LTP] Refreshing ' + watchlistData.symbols.length + ' symbols');

                // Fetch quotes for each symbol
                for (const symbol of watchlistData.symbols) {
                    try {
                        // Use quotes API to get LTP
                        const quotesResponse = await fetch(`${API_BASE}/api/quotes`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                exchange: symbol.exchange,
                                symbol: symbol.symbol
                            })
                        });

                        if (quotesResponse.ok) {
                            const quotesResult = await quotesResponse.json();
                            console.log('[LTP] Updated:', symbol.symbol, 'LTP:', quotesResult.data?.ltp);
                        }
                    } catch (error) {
                        console.error('[LTP] Failed to fetch LTP for', symbol.symbol, ':', error.message);
                    }
                }

                // Re-render to show updated prices
                renderWatchlists();
            }
        }
    } catch (error) {
        console.error('[LTP] Failed to refresh watchlist LTP:', error);
    }
}

// Toggle watchlist expansion
async function toggleWatchlistExpansion(watchlistId) {
    // Log user action
    logUserAction(`${expandedWatchlistId === watchlistId ? 'Collapsing' : 'Expanding'} watchlist ${watchlistId}`);

    console.log('DEBUG toggleWatchlistExpansion: watchlistId=' + watchlistId + ', current expandedWatchlistId=' + expandedWatchlistId);
    if (expandedWatchlistId === watchlistId) {
        // Collapse - stop LTP refresh
        console.log('DEBUG: Collapsing watchlist - stopping LTP refresh');
        stopLtpRefresh();
        expandedWatchlistId = null;
        renderWatchlists();
        logSystem('LTP refresh stopped');
    } else {
        // Expand - start LTP refresh
        console.log('DEBUG: Expanding watchlist - starting LTP refresh');
        expandedWatchlistId = watchlistId;

        // Load data BEFORE rendering to prevent "undefined" error
        await loadWatchlistDetails(watchlistId);
        renderWatchlists();

        // Start LTP refresh every 15 seconds (as per requirements)
        startLtpRefresh(watchlistId);
    }
}

// Load watchlist details (symbols and instances)
async function loadWatchlistDetails(watchlistId) {
    try {
        console.log('DEBUG: Loading watchlist details for ID:', watchlistId);
        const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}`, { credentials: 'include' });

        if (response.ok) {
            const result = await response.json();
            const watchlistData = result.data || result;

            console.log('DEBUG: API response structure:', result);
            console.log('DEBUG: watchlistData type:', typeof watchlistData, 'keys:', Object.keys(watchlistData));
            console.log('DEBUG: symbols count:', watchlistData.symbols ? watchlistData.symbols.length : 'N/A');
            console.log('DEBUG: instances count:', watchlistData.instances ? watchlistData.instances.length : 'N/A');

            // Store in cache
            expandedWatchlistData[watchlistId] = watchlistData;
            console.log('DEBUG: Data stored in cache. Cache now has:', Object.keys(expandedWatchlistData));
        } else {
            console.error('DEBUG: Failed to load watchlist details - status:', response.status);
        }
    } catch (error) {
        console.error('DEBUG: Error loading watchlist details:', error);
    }
}

// Render symbols for expanded watchlist
function renderWatchlistSymbols(watchlistId, watchlistData) {
    console.log('=== START renderWatchlistSymbols function ===');
    console.log('watchlistId:', watchlistId);
    console.log('watchlistData type:', typeof watchlistData);
    console.log('=== END START logs ===');

    // Debug: Check if watchlistData exists and log
    if (!watchlistData) {
        console.error('ERROR: renderWatchlistSymbols called with null/undefined watchlistData for ID:', watchlistId);
        return `
            <div class="text-center py-8">
                <p class="text-red-400">Error: Watchlist data not loaded (ID: ${watchlistId})</p>
                <button onclick="loadWatchlistDetails(${watchlistId}); renderWatchlists()" class="mt-4 px-4 py-2 bg-blue-500/20 text-blue-300 rounded">Retry</button>
            </div>
        `;
    }

    const symbols = watchlistData.symbols || [];
    const instances = watchlistData.instances || [];

    console.log('DEBUG renderWatchlistSymbols: watchlistId=' + watchlistId + ', symbols=' + symbols.length + ', instances=' + instances.length);

    if (symbols.length === 0) {
        return `
            <div class="text-center py-8">
                <i data-lucide="list" class="w-12 h-12 text-slate-600 mx-auto mb-4"></i>
                <p class="text-slate-400 mb-4">No symbols in this watchlist</p>
                <button onclick="showAddSymbolForm()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200">
                    <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Add Symbol
                </button>
            </div>
        `;
    }

    return `
        <div class="space-y-4">
            <!-- Actions Bar -->
            <div class="flex items-center justify-between mb-4">
                <h4 class="text-white font-semibold">Symbols (${symbols.length})</h4>
                <div class="flex space-x-2">
                    <button onclick="showAddSymbolForm()" class="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-sm hover:bg-blue-500/30 transition-all duration-200">
                        <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Add Symbol
                    </button>
                    <button onclick="exportWatchlistCsv(${watchlistId})" class="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-300 rounded-lg text-sm hover:bg-green-500/30 transition-all duration-200">
                        <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>Export CSV
                    </button>
                </div>
            </div>

            <!-- Symbols List -->
            <div class="space-y-2">
                ${symbols.map(symbol => {
                    const symbolType = detectSymbolType(symbol.exchange, symbol.symbol);
                    const isOptions = symbolType === 'OPTIONS';
                    const isFuture = symbolType === 'FUTURE';
                    const isEquity = symbolType === 'EQUITY';
                    return `
                    <div class="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center space-x-3 mb-2">
                                    <span class="text-white font-semibold">${symbol.symbol}</span>
                                    <span class="px-2 py-1 bg-slate-600/50 text-slate-300 text-xs rounded">${symbol.exchange}</span>
                                    ${!symbol.is_enabled ? '<span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded">Disabled</span>' : ''}
                                </div>
                                <div class="text-sm text-slate-400">
                                    <span class="mr-4">Config: ${symbol.qty_mode || 'fixed'} - ${symbol.qty_value || 1} ${symbol.qty_units || 'units'}</span>
                                    ${symbol.lot_size ? `<span class="mr-4">Lot: ${symbol.lot_size}</span>` : ''}
                                    ${symbol.target_value ? `<span class="mr-4">Target: ${symbol.target_value}${symbol.target_type === 'PERCENTAGE' ? '%' : ''}</span>` : ''}
                                    ${symbol.sl_value ? `<span>SL: ${symbol.sl_value}${symbol.sl_type === 'PERCENTAGE' ? '%' : ''}</span>` : ''}
                                </div>
                                ${instances.length > 0 ? `
                                    <div class="text-xs text-slate-500 mt-1">
                                        <i data-lucide="server" class="w-3 h-3 inline mr-1"></i>
                                        Assigned to ${instances.length} instance${instances.length > 1 ? 's' : ''}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="flex items-center space-x-2">
                                ${symbol.is_enabled ? `
                                    ${isOptions ? `
                                        <button onclick="tradeOption(${symbol.symbol_id}, '${symbol.symbol}', 'BUY', '${symbol.symbol.includes('CE') ? 'CE' : 'PE'}')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30 transition-all duration-200">BUY</button>
                                        <button onclick="tradeOption(${symbol.symbol_id}, '${symbol.symbol}', 'SELL', '${symbol.symbol.includes('CE') ? 'CE' : 'PE'}')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30 transition-all duration-200">SELL</button>
                                        <button onclick="exitOptionsPosition(${symbol.symbol_id}, '${symbol.symbol}')" class="px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded text-sm hover:bg-orange-500/30 transition-all duration-200">EXIT</button>
                                    ` : isFuture ? `
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'BUY')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30 transition-all duration-200">BUY</button>
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'SELL')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30 transition-all duration-200">SELL</button>
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'SHORT')" class="px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded text-sm hover:bg-yellow-500/30 transition-all duration-200">SHORT</button>
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'COVER')" class="px-3 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded text-sm hover:bg-blue-500/30 transition-all duration-200">COVER</button>
                                    ` : `
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'BUY')" class="px-3 py-1 bg-green-500/20 border border-green-500/30 text-green-300 rounded text-sm hover:bg-green-500/30 transition-all duration-200">BUY</button>
                                        <button onclick="placeQuickOrder(${symbol.symbol_id}, 'SELL')" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30 transition-all duration-200">SELL</button>
                                    `}
                                ` : ''}
                                <button onclick="editSymbolConfig(${symbol.symbol_id})" class="px-3 py-1 bg-slate-500/20 border border-slate-500/30 text-slate-300 rounded text-sm hover:bg-slate-500/30 transition-all duration-200">
                                    <i data-lucide="edit" class="w-3 h-3"></i>
                                </button>
                                <button onclick="deleteSymbol(${watchlistId}, ${symbol.symbol_id})" class="px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 rounded text-sm hover:bg-red-500/30 transition-all duration-200">
                                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `;
}

// Quick order placement (placeholder)
// Fetch LTP for a symbol
async function fetchLTPBasic(exchange, symbol) {
    try {
        const response = await fetch(`/api/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ exchange, symbol })
        });

        const result = await response.json();
        if (result.status === 'success' && result.data && result.data.ltp) {
            return Number(result.data.ltp);
        }
    } catch (error) {
        console.error('Error fetching LTP:', error);
    }
    return null;
}

// Place quick order for a symbol (one-click, no quantity modification)
async function placeQuickOrder(symbolId, action, optionType = null) {
    // Log user action
    logUserAction(`Order initiated: ${action}${optionType ? ' (' + optionType + ')' : ''} for symbol ID ${symbolId}`);

    // Get watchlist ID from expanded watchlist
    const watchlistId = expandedWatchlistId;
    if (!watchlistId) {
        alert('Please expand a watchlist first.');
        logUserAction(`Order failed: No watchlist expanded`);
        return;
    }

    // Get symbol data
    const watchlistData = expandedWatchlistData[watchlistId];
    if (!watchlistData || !watchlistData.symbols) {
        alert('Watchlist data not loaded. Please try again.');
        return;
    }

    const symbol = watchlistData.symbols.find(s => s.symbol_id === symbolId);
    if (!symbol) {
        alert('Symbol not found.');
        return;
    }

    // Validate action
    const validActions = ['BUY', 'SELL', 'SHORT', 'COVER', 'EXIT'];
    const actionUpper = action.toUpperCase();
    if (!validActions.includes(actionUpper)) {
        alert(`Invalid action. Must be one of: ${validActions.join(', ')}`);
        return;
    }

    // Validate optionType if provided
    if (optionType && !['CE', 'PE'].includes(optionType.toUpperCase())) {
        alert('Invalid option type. Must be CE or PE.');
        return;
    }

    // Check if symbol is enabled (only check for non-exit actions)
    if (symbol.is_enabled === 0 && actionUpper !== 'EXIT') {
        alert(`Symbol ${symbol.symbol} is disabled. Please enable it in symbol configuration.`);
        return;
    }

    // Validate trade mode compatibility
    const canTradeEquity = symbol.can_trade_equity === 1 || symbol.can_trade_equity === true;
    const canTradeFutures = symbol.can_trade_futures === 1 || symbol.can_trade_futures === true;
    const canTradeOptions = symbol.can_trade_options === 1 || symbol.can_trade_options === true;

    // For options orders, validate symbol supports options
    if (optionType) {
        if (!canTradeOptions) {
            alert(`Symbol ${symbol.symbol} is not configured for options trading. Please enable options in symbol configuration.`);
            return;
        }
    }

    // For non-options orders, validate symbol supports the trading mode
    if (!optionType && actionUpper !== 'EXIT') {
        // Check if trying to trade futures on equity-only symbol
        if (canTradeFutures && !canTradeEquity) {
            // This is a futures-only symbol, allow it
        } else if (!canTradeEquity) {
            alert(`Symbol ${symbol.symbol} is not configured for equity trading.`);
            return;
        }
    }

    // For options orders, generate the actual contract symbol
    let displaySymbol = symbol.symbol;
    let actualSymbol = symbol.symbol;
    if (optionType) {
        try {
            console.log('[Options] Generating contract for', symbol.symbol, optionType);
            const response = await fetch(`${API_BASE}/api/options/generate-symbol`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    underlying: symbol.symbol,
                    option_type: optionType,
                    strike_offset: symbol.options_strike_offset || 'ATM'
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data && result.data.symbol) {
                    actualSymbol = result.data.symbol;
                    displaySymbol = result.data.symbol;
                    console.log('[Options] Generated contract:', displaySymbol);
                } else {
                    console.error('[Options] Invalid API response:', result);
                    alert(`Failed to generate options contract symbol for ${optionType}. Please try again.`);
                    return;
                }
            } else {
                console.error('[Options] API error:', response.status, await response.text());
                alert(`Failed to generate options contract symbol. API returned error ${response.status}.`);
                return;
            }
        } catch (error) {
            console.error('[Options] Failed to generate contract:', error);
            alert(`Failed to generate options contract symbol. Please check your connection and try again.`);
            return;
        }
    }

    // Build confirmation message with quantity calculation for capital mode
    let confirmMessage = '';
    if (actionUpper === 'EXIT') {
        confirmMessage = `Exit all open positions for ${symbol.symbol} (${symbol.exchange})?\n\nThis will place exit orders for all open positions across all assigned instances.`;
    } else {
        const optionText = optionType ? ` ${optionType}` : '';
        const symbolToShow = optionType ? `${symbol.symbol} → ${displaySymbol}` : symbol.symbol;
        confirmMessage = `Place ${actionUpper}${optionText} order for ${symbolToShow} (${symbol.exchange})?`;

        // For capital mode, show calculated quantity
        if ((symbol.qty_mode || '').toUpperCase() === 'CAPITAL' || (symbol.qty_type || '').toUpperCase() === 'CAPITAL') {
            const capital = Number(symbol.qty_value);
            const ltp = await fetchLTPBasic(symbol.exchange, symbol.symbol);

            if (ltp && ltp > 0) {
                const calculatedQty = Math.max(1, Math.floor(capital / ltp));
                confirmMessage += `

Underlying: ${symbol.symbol}
Contract: ${displaySymbol}
Capital: ₹${capital}
LTP: ₹${ltp}
Calculated Quantity: ${calculatedQty} shares
Product: ${symbol.product_type}
Order Type: ${symbol.order_type}`;
            } else {
                confirmMessage += `

Underlying: ${symbol.symbol}
Contract: ${displaySymbol}
Capital: ₹${capital}
LTP: Loading...
Quantity will be calculated based on current market price
Product: ${symbol.product_type}
Order Type: ${symbol.order_type}`;
            }
        } else {
            // For fixed mode, show the configured quantity
            confirmMessage += `

Underlying: ${symbol.symbol}
Contract: ${displaySymbol}
Quantity: ${symbol.qty_value} ${symbol.qty_units || 'units'}
Product: ${symbol.product_type}
Order Type: ${symbol.order_type}`;
        }

        confirmMessage += `

This will be placed on all assigned instances for this watchlist.`;
    }

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        // Show loading state
        const button = document.querySelector(`[onclick="placeQuickOrder(${symbolId}, '${action}')"]`);
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `
            <svg class="animate-spin w-4 h-4 mr-2 inline" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Placing...
        `;

        // Call order placement API
        const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}/place-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                symbol_ids: [symbolId],
                action: actionUpper,
                option_type: optionType || null
            })
        });

        const result = await response.json();

        if (response.ok) {
            const successCount = result.results?.filter(r => r.status === 'success').length || 0;
            const errorCount = result.results?.filter(r => r.status === 'error').length || 0;

            // Show success feedback
            button.innerHTML = `
                <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                Success (${successCount}/${successCount + errorCount})
            `;
            button.className = button.className.replace('bg-green-500/20', 'bg-green-600/30');

            showAlert(
                `${actionUpper} order placed successfully for ${symbol.symbol} on ${successCount} instance(s)`,
                'success'
            );

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                button.className = button.className.replace('bg-green-600/30', 'bg-green-500/20');
            }, 3000);
        } else {
            // Show error
            const errorMsg = result.error || 'Failed to place order';
            button.innerHTML = `
                <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                Failed
            `;
            button.className = button.className.replace('bg-green-500/20', 'bg-red-500/30');

            showAlert(`Failed to place ${actionUpper} order: ${errorMsg}`, 'error');

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                button.className = button.className.replace('bg-red-500/30', 'bg-green-500/20');
            }, 3000);
        }
    } catch (error) {
        console.error('Error placing order:', error);

        // Reset button
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
            button.className = button.className.replace('bg-green-500/20', 'bg-green-500/20');
        }

        alert('Failed to place order. Please try again.');
    }
}

/**
 * Exit all positions for an options symbol
 */
async function exitAllOptionsPositions(symbolId) {
    // Get watchlist ID from expanded watchlist
    const watchlistId = expandedWatchlistId;
    if (!watchlistId) {
        alert('Please expand a watchlist first.');
        return;
    }

    // Get symbol data
    const watchlistData = expandedWatchlistData[watchlistId];
    if (!watchlistData || !watchlistData.symbols) {
        alert('Watchlist data not loaded. Please try again.');
        return;
    }

    const symbol = watchlistData.symbols.find(s => s.symbol_id === symbolId);
    if (!symbol) {
        alert('Symbol not found.');
        return;
    }

    // Confirm exit
    const confirmMessage = `EXIT ALL positions for ${symbol.symbol} (${symbol.exchange})?\n\nThis will place exit orders for all open positions across all assigned instances.\n\nFor options symbols, this will exit positions for the underlying symbol (e.g., NIFTY, BANKNIFTY).`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        // Show loading state
        const button = document.querySelector(`[onclick="exitAllOptionsPositions(${symbolId})"]`);
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `
            <svg class="animate-spin w-4 h-4 mr-2 inline" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Exiting...
        `;

        // Call exit all API
        const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}/exit-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                symbol_id: symbolId
            })
        });

        const result = await response.json();

        if (response.ok) {
            const successCount = result.results?.length || 0;
            const errorCount = result.errors?.length || 0;
            const totalClosed = result.summary?.total_positions_closed || 0;

            // Show success feedback
            button.innerHTML = `
                <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                Exited (${totalClosed} positions)
            `;
            button.className = button.className.replace('bg-orange-500/20', 'bg-orange-600/30');

            showAlert(
                `EXIT ALL: Successfully closed ${totalClosed} position(s) for ${symbol.symbol} on ${successCount} instance(s)`,
                'success'
            );

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                button.className = button.className.replace('bg-orange-600/30', 'bg-orange-500/20');
            }, 3000);
        } else {
            // Show error
            const errorMsg = result.error || 'Failed to exit positions';
            button.innerHTML = `
                <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                Failed
            `;
            button.className = button.className.replace('bg-orange-500/20', 'bg-red-500/30');

            showAlert(`Failed to exit positions: ${errorMsg}`, 'error');

            // Reset button after 3 seconds
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                button.className = button.className.replace('bg-red-500/30', 'bg-orange-500/20');
            }, 3000);
        }
    } catch (error) {
        console.error('Error exiting positions:', error);

        // Reset button
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
            button.className = button.className.replace('bg-orange-500/20', 'bg-orange-500/20');
        }

        alert('Failed to exit positions. Please try again.');
    }
}

// Delete symbol from watchlist
async function deleteSymbol(watchlistId, symbolId) {
    const symbol = expandedWatchlistData[watchlistId]?.symbols?.find(s => s.symbol_id === symbolId);
    const symbolName = symbol?.symbol || `ID ${symbolId}`;

    showConfirmModal(
        'Delete Symbol',
        `Are you sure you want to delete "${symbolName}" from this watchlist?`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}/symbols/${symbolId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                const result = await response.json();

                if (response.ok) {
                    // Remove from cache
                    if (expandedWatchlistData[watchlistId]) {
                        expandedWatchlistData[watchlistId].symbols = expandedWatchlistData[watchlistId].symbols.filter(s => s.symbol_id !== symbolId);
                        // Re-render
                        renderWatchlists();
                    }
                    showAlert(result.message || 'Symbol deleted successfully', 'success');
                } else {
                    alert(`Failed to delete symbol: ${result.message || result.error}`);
                }
            } catch (error) {
                console.error('Error deleting symbol:', error);
                alert('Failed to delete symbol. Please try again.');
            }
        }
    );
}

// Show empty state
function showWatchlistsEmptyState() {
    document.getElementById('watchlists-list').innerHTML = '';
    document.getElementById('watchlists-empty-state').classList.remove('hidden');
}

// Show create watchlist modal
function showCreateWatchlistModal() {
    document.getElementById('watchlist-modal-title').textContent = 'Create Watchlist';
    document.getElementById('watchlist-submit-btn').textContent = 'Create Watchlist';
    document.getElementById('watchlist-form').reset();
    document.getElementById('watchlist-id').value = '';
    document.getElementById('watchlist-active').checked = true;

    // Load instances for assignment
    loadWatchlistInstancesForSelection();

    document.getElementById('watchlist-modal').classList.add('active');
    lucide.createIcons();
}

// Load instances for selection in Create Watchlist modal
async function loadWatchlistInstancesForSelection() {
    const container = document.getElementById('watchlist-instances-selection');
    container.innerHTML = '<div class="text-slate-400 text-sm">Loading instances...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/instances`, { credentials: 'include' });

        if (response.ok) {
            const allInstances = await response.json();

            if (allInstances.length === 0) {
                container.innerHTML = '<div class="text-slate-400 text-sm">No instances available. Create an instance first.</div>';
                return;
            }

            container.innerHTML = allInstances.map(instance => `
                <label class="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-all duration-200">
                    <input type="checkbox"
                           class="watchlist-instance-checkbox"
                           data-instance-id="${instance.id}"
                           class="w-5 h-5 rounded border-slate-600 bg-slate-700/50 text-blue-500">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <span class="text-white font-medium">${instance.name}</span>
                            ${instance.broker ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${instance.broker}</span>` : ''}
                            ${!instance.is_active ? '<span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">Offline</span>' : ''}
                        </div>
                        <span class="text-slate-400 text-xs">${instance.host_url}</span>
                    </div>
                    <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400' : 'bg-red-400'}"></div>
                </label>
            `).join('');
        } else {
            container.innerHTML = '<div class="text-red-400 text-sm">Failed to load instances</div>';
        }
    } catch (error) {
        console.error('Error loading instances:', error);
        container.innerHTML = '<div class="text-red-400 text-sm">Error loading instances</div>';
    }
}

// Load instances for selection in Edit Watchlist modal with pre-selection
async function loadWatchlistInstancesForSelectionWithAssignment(assignedInstances) {
    const container = document.getElementById('watchlist-instances-selection');
    container.innerHTML = '<div class="text-slate-400 text-sm">Loading instances...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/instances`, { credentials: 'include' });

        if (response.ok) {
            const allInstances = await response.json();

            if (allInstances.length === 0) {
                container.innerHTML = '<div class="text-slate-400 text-sm">No instances available. Create an instance first.</div>';
                return;
            }

            // Create a set of assigned instance IDs for quick lookup
            const assignedIds = new Set(assignedInstances.map(inst => inst.id));

            container.innerHTML = allInstances.map(instance => {
                const isAssigned = assignedIds.has(instance.id);
                return `
                    <label class="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-all duration-200">
                        <input type="checkbox"
                               class="watchlist-instance-checkbox"
                               data-instance-id="${instance.id}"
                               ${isAssigned ? 'checked' : ''}
                               class="w-5 h-5 rounded border-slate-600 bg-slate-700/50 text-blue-500">
                        <div class="flex-1">
                            <div class="flex items-center space-x-2">
                                <span class="text-white font-medium">${instance.name}</span>
                                ${instance.broker ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${instance.broker}</span>` : ''}
                                ${!instance.is_active ? '<span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">Offline</span>' : ''}
                            </div>
                            <span class="text-slate-400 text-xs">${instance.host_url}</span>
                        </div>
                        <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400' : 'bg-red-400'}"></div>
                    </label>
                `;
            }).join('');
        } else {
            container.innerHTML = '<div class="text-red-400 text-sm">Failed to load instances</div>';
        }
    } catch (error) {
        console.error('Error loading instances:', error);
        container.innerHTML = '<div class="text-red-400 text-sm">Error loading instances</div>';
    }
}

// Toggle all instances in Create Watchlist modal
function toggleAllWatchlistInstances() {
    const checkboxes = document.querySelectorAll('.watchlist-instance-checkbox');
    const firstCheckbox = checkboxes[0];
    const shouldCheck = !firstCheckbox.checked;

    checkboxes.forEach(checkbox => {
        checkbox.checked = shouldCheck;
    });
}

// Edit watchlist
async function editWatchlist(id) {
    const watchlist = watchlists.find(w => w.id === id);
    if (!watchlist) return;

    // Load full watchlist details including instances
    try {
        const response = await fetch(`${API_BASE}/api/watchlists/${id}`, { credentials: 'include' });
        if (response.ok) {
            const result = await response.json();
            const watchlistData = result.data || result;
            currentWatchlist = watchlistData;

            // Set form fields
            document.getElementById('watchlist-modal-title').textContent = 'Edit Watchlist';
            document.getElementById('watchlist-submit-btn').textContent = 'Update Watchlist';
            document.getElementById('watchlist-id').value = watchlist.id;
            document.getElementById('watchlist-name').value = watchlist.name;
            document.getElementById('watchlist-description').value = watchlist.description || '';
            document.getElementById('watchlist-active').checked = watchlist.is_active;

            // Load instances for selection in modal with pre-selection
            await loadWatchlistInstancesForSelectionWithAssignment(watchlistData.instances || []);

            document.getElementById('watchlist-modal').classList.add('active');
            lucide.createIcons();
        } else {
            alert('Failed to load watchlist details');
        }
    } catch (error) {
        console.error('Error loading watchlist:', error);
        alert('Failed to load watchlist. Please try again.');
    }
}

// Close watchlist modal
function closeWatchlistModal() {
    document.getElementById('watchlist-modal').classList.remove('active');
    currentWatchlist = null;
}

// Handle watchlist form submit
document.getElementById('watchlist-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const watchlistId = document.getElementById('watchlist-id').value;
    const isEditing = !!watchlistId;

    const formData = {
        name: document.getElementById('watchlist-name').value.trim(),
        description: document.getElementById('watchlist-description').value.trim(),
        is_active: document.getElementById('watchlist-active').checked
    };

    // Get selected instances for both new and edit
    let instanceIds = [];
    const checkboxes = document.querySelectorAll('.watchlist-instance-checkbox:checked');
    instanceIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.instanceId));

    try {
        // Create or update watchlist
        const url = isEditing ? `${API_BASE}/api/watchlists/${watchlistId}` : `${API_BASE}/api/watchlists`;
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            const targetWatchlistId = isEditing ? watchlistId : result.data?.id;

            // Assign instances for both new and existing watchlists
            if (targetWatchlistId && instanceIds.length > 0) {
                try {
                    await fetch(`${API_BASE}/api/watchlists/${targetWatchlistId}/instances`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ instance_ids: instanceIds })
                    });
                } catch (error) {
                    console.error('Error assigning instances:', error);
                }
            }

            closeWatchlistModal();
            await loadWatchlists();
            showAlert(result.message || `Watchlist ${isEditing ? 'updated' : 'created'} successfully`, 'success');
        } else {
            alert(`Failed to ${isEditing ? 'update' : 'create'} watchlist: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error submitting watchlist:', error);
        alert(`Failed to ${isEditing ? 'update' : 'create'} watchlist. Please try again.`);
    }
});

// Delete watchlist
function deleteWatchlist(id) {
    const watchlist = watchlists.find(w => w.id === id);
    if (!watchlist) return;

    showConfirmModal(
        'Delete Watchlist',
        `Are you sure you want to delete "${watchlist.name}"? This will remove all symbols and configurations. This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/watchlists/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                const result = await response.json();

                if (response.ok) {
                    await loadWatchlists();
                    showAlert(result.message || 'Watchlist deleted successfully', 'success');
                } else {
                    alert(`Failed to delete watchlist: ${result.message || result.error}`);
                }
            } catch (error) {
                console.error('Error deleting watchlist:', error);
                alert('Failed to delete watchlist. Please try again.');
            }
        }
    );
}

// Clone watchlist
let cloneWatchlistId = null;

function cloneWatchlist(id) {
    const watchlist = watchlists.find(w => w.id === id);
    if (!watchlist) return;

    // Store the ID for later use
    cloneWatchlistId = id;

    // Populate the form
    document.getElementById('clone-original-name').value = watchlist.name;
    document.getElementById('clone-new-name').value = `${watchlist.name} (Copy)`;

    // Show modal
    document.getElementById('clone-watchlist-modal').classList.add('active');
    lucide.createIcons();

    // Focus the name input
    setTimeout(() => {
        const input = document.getElementById('clone-new-name');
        input.focus();
        input.select();
    }, 100);
}

// Close clone watchlist modal
function closeCloneWatchlistModal() {
    document.getElementById('clone-watchlist-modal').classList.remove('active');
    cloneWatchlistId = null;
}

// Submit clone watchlist
async function submitCloneWatchlist(event) {
    event.preventDefault();

    if (!cloneWatchlistId) return;

    const newName = document.getElementById('clone-new-name').value.trim();
    if (!newName) {
        alert('Please enter a name for the cloned watchlist');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/watchlists/${cloneWatchlistId}/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: newName })
        });

        const result = await response.json();

        if (response.ok) {
            closeCloneWatchlistModal();
            await loadWatchlists();
            showAlert(result.message || 'Watchlist cloned successfully', 'success');
        } else {
            alert(`Failed to clone watchlist: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error cloning watchlist:', error);
        alert('Failed to clone watchlist. Please try again.');
    }
}

// View watchlist details
async function viewWatchlist(id) {
    try {
        console.log(`Loading watchlist ${id}...`);
        const response = await fetch(`${API_BASE}/api/watchlists/${id}`, { credentials: 'include' });

        console.log('Response status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('Watchlist data:', result);
            currentWatchlist = result.data || result;
            showWatchlistDetailModal();
        } else {
            const errorData = await response.json().catch(() => null);
            console.error('Failed to load watchlist:', errorData);
            alert(`Failed to load watchlist details: ${errorData?.message || response.statusText}`);
        }
    } catch (error) {
        console.error('Error loading watchlist details:', error);
        alert(`Failed to load watchlist details: ${error.message}. Please check the browser console for more details.`);
    }
}

// Show watchlist detail modal
function showWatchlistDetailModal() {
    if (!currentWatchlist) return;

    document.getElementById('watchlist-detail-name').textContent = currentWatchlist.name;
    document.getElementById('watchlist-detail-description').textContent = currentWatchlist.description || '';

    // Reset to symbols tab
    currentWatchlistTab = 'symbols';
    showWatchlistTab('symbols');

    // Show modal
    document.getElementById('watchlist-detail-modal').classList.add('active');
    lucide.createIcons();
}

// Close watchlist detail modal
function closeWatchlistDetailModal() {
    document.getElementById('watchlist-detail-modal').classList.remove('active');
    currentWatchlist = null;
}

// Show watchlist tab
function showWatchlistTab(tab) {
    currentWatchlistTab = tab;

    // Update tab buttons
    ['symbols', 'instances', 'import'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const tabContent = document.getElementById(`watchlist-${t}-tab`);

        if (t === tab) {
            btn.classList.add('text-white', 'bg-blue-500/20', 'border', 'border-blue-500/30');
            btn.classList.remove('text-slate-300', 'hover:bg-slate-700/30');
            tabContent.classList.remove('hidden');
        } else {
            btn.classList.remove('text-white', 'bg-blue-500/20', 'border', 'border-blue-500/30');
            btn.classList.add('text-slate-300', 'hover:bg-slate-700/30');
            tabContent.classList.add('hidden');
        }
    });

    // Load tab content
    if (tab === 'symbols') {
        renderWatchlistSymbolsTab();
    } else if (tab === 'instances') {
        renderWatchlistInstances();
    }

    lucide.createIcons();
}

// Render watchlist symbols
function renderWatchlistSymbolsTab() {
    if (!currentWatchlist) return;

    const symbols = currentWatchlist.symbols || [];
    document.getElementById('watchlist-symbols-count').textContent = symbols.length;

    const container = document.getElementById('watchlist-symbols-list');

    if (symbols.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center">
                <div class="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="list" class="w-6 h-6 text-slate-400"></i>
                </div>
                <h3 class="text-white font-semibold mb-2">No symbols added</h3>
                <p class="text-slate-400 text-sm">Add symbols using the CSV import or manually</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <table class="w-full">
            <thead class="bg-slate-700/50">
                <tr class="text-left text-sm">
                    <th class="p-3 text-slate-300 font-medium">Symbol</th>
                    <th class="p-3 text-slate-300 font-medium">Exchange</th>
                    <th class="p-3 text-slate-300 font-medium">Lot Size</th>
                    <th class="p-3 text-slate-300 font-medium">Qty Type</th>
                    <th class="p-3 text-slate-300 font-medium">Product</th>
                    <th class="p-3 text-slate-300 font-medium">Status</th>
                    <th class="p-3 text-slate-300 font-medium">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-700/50">
                ${symbols.map(symbol => `
                    <tr class="hover:bg-slate-700/20 transition-all duration-200">
                        <td class="p-3 text-white font-medium">${symbol.symbol}</td>
                        <td class="p-3 text-slate-300">${symbol.exchange}</td>
                        <td class="p-3 text-slate-300 text-sm">${symbol.lot_size || 1}</td>
                        <td class="p-3 text-slate-300 text-sm">${symbol.qty_type || 'FIXED'}</td>
                        <td class="p-3 text-slate-300 text-sm">${symbol.product_type || 'MIS'}</td>
                        <td class="p-3">
                            ${symbol.is_enabled !== false ?
                                '<span class="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Enabled</span>' :
                                '<span class="px-2 py-1 bg-slate-500/20 text-slate-300 text-xs rounded-full">Disabled</span>'
                            }
                        </td>
                        <td class="p-3">
                            <div class="flex items-center space-x-2">
                                <button onclick="editSymbolConfig(${symbol.symbol_id})" class="p-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-all duration-200" title="Edit Config">
                                    <i data-lucide="edit" class="w-4 h-4"></i>
                                </button>
                                <button onclick="deleteSymbolFromCurrentWatchlist(${symbol.symbol_id})" class="p-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-all duration-200" title="Delete Symbol">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    lucide.createIcons();
}

// Render watchlist instances
function renderWatchlistInstances() {
    if (!currentWatchlist) return;

    const instances = currentWatchlist.instances || [];
    document.getElementById('watchlist-instances-count').textContent = instances.length;

    const container = document.getElementById('watchlist-instances-list');

    if (instances.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center bg-slate-700/30 rounded-lg">
                <div class="w-12 h-12 bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="server" class="w-6 h-6 text-slate-400"></i>
                </div>
                <h3 class="text-white font-semibold mb-2">No instances assigned</h3>
                <p class="text-slate-400 text-sm">Assign instances to use this watchlist</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = instances.map(instance => `
        <div class="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/40 transition-all duration-200">
            <div class="flex items-center space-x-4">
                <div class="flex items-center space-x-2">
                    <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}"></div>
                    <span class="text-white font-medium">${instance.name}</span>
                </div>
                ${instance.broker ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${instance.broker}</span>` : ''}
                ${instance.is_analyzer_mode ?
                    '<span class="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs rounded-full">Analyzer</span>' :
                    '<span class="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Live</span>'
                }
            </div>
            <div class="flex items-center space-x-2">
                <span class="text-slate-400 text-xs">Assigned ${new Date(instance.assigned_at).toLocaleDateString()}</span>
                <button onclick="removeWatchlistInstance(${instance.id})" class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

// Show assign instances form
async function showAssignInstancesForm() {
    if (!currentWatchlist) return;

    // Load all instances
    try {
        const response = await fetch(`${API_BASE}/api/instances`, { credentials: 'include' });

        if (response.ok) {
            const allInstances = await response.json();
            const assignedInstanceIds = (currentWatchlist.instances || []).map(i => i.id);

            const container = document.getElementById('assign-instances-list');
            container.innerHTML = allInstances.map(instance => `
                <label class="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-all duration-200">
                    <input type="checkbox"
                           class="assign-instance-checkbox"
                           data-instance-id="${instance.id}"
                           ${assignedInstanceIds.includes(instance.id) ? 'checked' : ''}
                           class="w-5 h-5 rounded border-slate-600 bg-slate-700/50 text-blue-500">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <span class="text-white font-medium">${instance.name}</span>
                            ${instance.broker ? `<span class="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">${instance.broker}</span>` : ''}
                        </div>
                        <span class="text-slate-400 text-xs">${instance.host_url}</span>
                    </div>
                    <div class="w-2 h-2 rounded-full ${instance.is_active ? 'bg-green-400' : 'bg-red-400'}"></div>
                </label>
            `).join('');

            document.getElementById('assign-instances-modal').classList.add('active');
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading instances:', error);
        alert('Failed to load instances. Please try again.');
    }
}

// Close assign instances modal
function closeAssignInstancesModal() {
    document.getElementById('assign-instances-modal').classList.remove('active');
}

// Save assigned instances
async function saveAssignedInstances() {
    if (!currentWatchlist) return;

    const checkboxes = document.querySelectorAll('.assign-instance-checkbox:checked');
    const instanceIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.instanceId));

    try {
        const response = await fetch(`${API_BASE}/api/watchlists/${currentWatchlist.id}/instances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ instance_ids: instanceIds })
        });

        const result = await response.json();

        if (response.ok) {
            closeAssignInstancesModal();
            // Reload watchlist details
            await viewWatchlist(currentWatchlist.id);
            showAlert(result.message || 'Instances assigned successfully', 'success');
        } else {
            alert(`Failed to assign instances: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error assigning instances:', error);
        alert('Failed to assign instances. Please try again.');
    }
}

// Remove instance from watchlist
function removeWatchlistInstance(instanceId) {
    if (!currentWatchlist) return;

    showConfirmModal(
        'Remove Instance',
        'Are you sure you want to remove this instance from the watchlist?',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/watchlists/${currentWatchlist.id}/instances/${instanceId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                const result = await response.json();

                if (response.ok) {
                    // Reload watchlist details
                    await viewWatchlist(currentWatchlist.id);
                    showAlert(result.message || 'Instance removed successfully', 'success');
                } else {
                    alert(`Failed to remove instance: ${result.message || result.error}`);
                }
            } catch (error) {
                console.error('Error removing instance:', error);
                alert('Failed to remove instance. Please try again.');
            }
        }
    );
}

// Export watchlist CSV
async function exportWatchlistCsv(watchlistId) {
    const watchlist = watchlists.find(w => w.id === watchlistId);
    if (!watchlist && !currentWatchlist) return;

    const wl = watchlist || currentWatchlist;

    try {
        const response = await fetch(`${API_BASE}/api/watchlists/${wl.id}/export`, {
            credentials: 'include'
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${wl.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showAlert('CSV exported successfully', 'success');
        } else {
            alert('Failed to export CSV');
        }
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Failed to export CSV. Please try again.');
    }
}

// Show import CSV modal
function showImportCsvModal(watchlistId) {
    const watchlist = watchlists.find(w => w.id === watchlistId);
    if (!watchlist) return;

    importWatchlistId = watchlistId;
    const modal = document.getElementById('import-csv-modal');
    const nameSpan = document.getElementById('import-watchlist-name');

    if (nameSpan) {
        nameSpan.textContent = watchlist.name;
    }

    modal.classList.add('active');
    lucide.createIcons();
}

// Close import CSV modal
function closeImportCsvModal() {
    importWatchlistId = null;
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
        fileInput.value = '';
    }
    document.getElementById('import-csv-modal').classList.remove('active');
}

// Import watchlist CSV
async function importWatchlistCsv() {
    if (!importWatchlistId) return;

    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file to import');
        return;
    }

    const mode = document.querySelector('input[name="import-mode"]:checked').value;

    try {
        const csvText = await file.text();

        const response = await fetch(`${API_BASE}/api/watchlists/${importWatchlistId}/import?mode=${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            credentials: 'include',
            body: csvText
        });

        const result = await response.json();

        if (response.ok) {
            fileInput.value = '';
            // Reload watchlist accordion view
            await loadWatchlists();
            closeImportCsvModal();
            showAlert(result.message || 'CSV imported successfully', 'success');
        } else {
            alert(`Failed to import CSV: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error importing CSV:', error);
        alert('Failed to import CSV. Please try again.');
    }
}

// Show alert (simple notification)
function showAlert(message, type = 'info') {
    // You can implement a more sophisticated notification system here
    // For now, we'll use console.log
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Optional: Show a temporary toast notification
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white z-[100] ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        'bg-blue-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Add watchlist search functionality
document.addEventListener('DOMContentLoaded', () => {
    const watchlistSearchInput = document.getElementById('watchlist-search-input');
    if (watchlistSearchInput) {
        watchlistSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            filteredWatchlists = watchlists.filter(w => {
                return !query ||
                    w.name.toLowerCase().includes(query) ||
                    (w.description && w.description.toLowerCase().includes(query));
            });
            renderWatchlists();
        });
    }
});

// ========================================
// SYMBOL MANAGEMENT FUNCTIONS
// ========================================

// Validate symbol and fetch lot size from OpenAlgo search API
async function validateAndFetchLotSize() {
    const symbol = document.getElementById('add-symbol-name').value.trim();
    const exchange = document.getElementById('add-symbol-exchange').value;
    const statusElement = document.getElementById('add-symbol-validation-status');
    const lotSizeInput = document.getElementById('add-symbol-lot-size');

    // Reset status
    statusElement.textContent = '';
    statusElement.className = 'text-xs text-slate-400';

    if (!symbol || !exchange) {
        return; // Don't validate if fields are empty
    }

    try {
        // Call the symbol validation endpoint to get metadata from OpenAlgo search API
        const response = await fetch('/api/symbols/validate', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: symbol,
                exchange: exchange
            })
        });

        const result = await response.json();

        if (result.valid && result.data && result.data.metadata) {
            // Symbol is valid and we have metadata from OpenAlgo
            const metadata = result.data.metadata;

            // Extract lot size from metadata
            const lotSize = metadata.lotsize || 1;
            lotSizeInput.value = lotSize;

            // Store additional metadata for future use
            // This can be used for enhanced features later
            lotSizeInput.dataset.tickSize = metadata.tick_size || '';
            lotSizeInput.dataset.expiry = metadata.expiry || '';
            lotSizeInput.dataset.strike = metadata.strike || '';
            lotSizeInput.dataset.optionType = metadata.option_type || '';
            lotSizeInput.dataset.instrumentType = metadata.instrument_type || '';
            lotSizeInput.dataset.name = metadata.name || '';
            lotSizeInput.dataset.isin = metadata.isin || '';

            // Show success status
            statusElement.textContent = `✓ Validated (Lot: ${lotSize})`;
            statusElement.className = 'text-xs text-green-400';
        } else if (result.valid && result.data && !result.data.metadata) {
            // Symbol is valid but no metadata available
            statusElement.textContent = `✓ Valid (using default lot size)`;
            statusElement.className = 'text-xs text-yellow-400';
        } else {
            // Validation failed
            const errorMsg = result.message || 'Symbol not found';
            statusElement.textContent = `✗ ${errorMsg}`;
            statusElement.className = 'text-xs text-red-400';
            lotSizeInput.value = 1;
        }
    } catch (error) {
        console.error('Error validating symbol:', error);
        statusElement.textContent = '✗ Validation error (using default)';
        statusElement.className = 'text-xs text-yellow-400';

        // Set default lot size as fallback
        let defaultLotSize = 1;
        if (exchange === 'NFO') defaultLotSize = 25;
        else if (exchange === 'MCX') defaultLotSize = 1000;
        else if (exchange === 'NSE') defaultLotSize = 1;

        lotSizeInput.value = defaultLotSize;
    }
}

// Validate that quantity is a multiple of lot size for F&O symbols
function validateQuantityLotSize(exchange, qtyMode, qtyValue, lotSize, qtyUnits, minQty = null) {
    // Only validate for F&O exchanges and fixed quantity mode
    if (exchange === 'NFO' || exchange === 'MCX') {
        if (qtyMode === 'fixed') {
            if (qtyUnits === 'units') {
                // When units = "units", quantity must be multiple of lot size
                if (qtyValue % lotSize !== 0) {
                    return {
                        valid: false,
                        message: `For ${exchange} symbols with "Units", quantity must be in multiples of lot size (${lotSize}). Current: ${qtyValue}`
                    };
                }
                if (minQty !== null && minQty % lotSize !== 0) {
                    return {
                        valid: false,
                        message: `For ${exchange} symbols with "Units", min quantity must be in multiples of lot size (${lotSize}). Current: ${minQty}`
                    };
                }
            } else if (qtyUnits === 'lots') {
                // When units = "lots", quantity represents number of lots (must be whole numbers)
                if (qtyValue <= 0 || !Number.isInteger(qtyValue)) {
                    return {
                        valid: false,
                        message: `For ${exchange} symbols with "Lots", quantity must be a whole number (number of lots). Current: ${qtyValue}`
                    };
                }
                if (minQty !== null && (minQty <= 0 || !Number.isInteger(minQty))) {
                    return {
                        valid: false,
                        message: `For ${exchange} symbols with "Lots", min quantity must be a whole number (number of lots). Current: ${minQty}`
                    };
                }
            }
        }
    }
    return { valid: true };
}

// Show add symbol form
// Debounce timer for symbol search
let symbolSearchTimeout = null;

// Debounce symbol search
function debounceSymbolSearch() {
    // Clear existing timeout
    if (symbolSearchTimeout) {
        clearTimeout(symbolSearchTimeout);
    }

    // Set new timeout
    symbolSearchTimeout = setTimeout(() => {
        performSymbolSearch();
    }, 500); // 500ms delay
}

// Perform symbol search
async function performSymbolSearch() {
    const searchInput = document.getElementById('add-symbol-search');
    const searchSpinner = document.getElementById('search-spinner');
    const searchResults = document.getElementById('search-results');

    if (!searchInput) return;

    const query = searchInput.value.trim();

    // Clear previous timeout
    if (symbolSearchTimeout) {
        clearTimeout(symbolSearchTimeout);
    }

    // If query is too short, hide results
    if (query.length < 2) {
        searchResults.classList.add('hidden');
        searchResults.innerHTML = '';
        return;
    }

    // Show spinner
    searchSpinner.classList.remove('hidden');

    try {
        // Get type filters (with null checks since these elements may not exist)
        const filters = [];
        const equityFilter = document.getElementById('search-filter-equity');
        const futuresFilter = document.getElementById('search-filter-futures');
        const optionsFilter = document.getElementById('search-filter-options');

        if (equityFilter && equityFilter.checked) filters.push('EQ');
        if (futuresFilter && futuresFilter.checked) filters.push('FUT');
        if (optionsFilter && optionsFilter.checked) filters.push('OPT');

        // Build query parameters
        const params = new URLSearchParams({
            q: query
        });

        // Make API call
        const response = await fetch(`${API_BASE}/api/symbols/search?${params}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'success' && data.data) {
            displaySearchResults(data.data, data.source, query);
        } else {
            displayNoResults();
        }
    } catch (error) {
        console.error('Symbol search error:', error);
        displaySearchError(error.message);
    } finally {
        // Hide spinner
        searchSpinner.classList.add('hidden');
    }
}

// Display search results
function displaySearchResults(results, source, query) {
    const searchResults = document.getElementById('search-results');

    if (!results || results.length === 0) {
        displayNoResults();
        return;
    }

    // Filter results based on query suffix (e.g., "reliance fut" -> only futures)
    let filteredResults = results;
    if (query) {
        const queryUpper = query.toUpperCase();
        if (queryUpper.includes(' FUT') || queryUpper.endsWith(' FUT')) {
            filteredResults = results.filter(r => {
                const sym = (r.symbol || '').toUpperCase();
                const ex = (r.exchange || '').toUpperCase();
                return ex === 'NFO' || ex === 'BFO' || sym.includes('FUT');
            });
        } else if (queryUpper.includes(' OPT') || queryUpper.endsWith(' OPT') ||
                   queryUpper.includes(' CE') || queryUpper.endsWith(' CE') ||
                   queryUpper.includes(' PE') || queryUpper.endsWith(' PE')) {
            filteredResults = results.filter(r => {
                const ex = (r.exchange || '').toUpperCase();
                return ex === 'NFO' || ex === 'BFO';
            });
        } else if (queryUpper.includes(' EQ') || queryUpper.endsWith(' EQ') ||
                   queryUpper.includes(' EQUITY') || queryUpper.endsWith(' EQUITY')) {
            filteredResults = results.filter(r => {
                const ex = (r.exchange || '').toUpperCase();
                return ex === 'NSE' || ex === 'BSE';
            });
        }
    }

    // Clear previous results
    searchResults.innerHTML = '';

    // Create result items
    filteredResults.forEach(result => {
        const item = document.createElement('div');
        item.className = 'p-3 border-b border-slate-600/50 last:border-b-0 hover:bg-slate-700/50 cursor-pointer transition-all duration-200';
        item.onclick = () => selectSearchResult(result);

        // Get instrument type color
        const typeColor = getInstrumentTypeColor(result.instrument_type);
        const typeIcon = getInstrumentTypeIcon(result.instrument_type);

        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                        <i data-lucide="${typeIcon}" class="w-5 h-5 ${typeColor}"></i>
                    </div>
                    <div>
                        <div class="text-white font-medium">${result.symbol}</div>
                        <div class="text-slate-400 text-sm">${result.name || 'N/A'}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-slate-300 font-medium">${result.exchange}</div>
                    <div class="text-slate-400 text-sm flex items-center justify-end">
                        <span class="px-2 py-1 rounded text-xs ${typeColor.replace('text-', 'bg-').replace('-400', '-500/20')} ${typeColor}">
                            ${result.instrument_type || 'EQ'}
                        </span>
                    </div>
                </div>
            </div>
        `;

        searchResults.appendChild(item);
    });

    // Show results
    searchResults.classList.remove('hidden');

    // Re-initialize icons
    lucide.createIcons();
}

// Display no results message
function displayNoResults() {
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = `
        <div class="p-4 text-center text-slate-400">
            <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
            <p>No symbols found. Try a different search term.</p>
        </div>
    `;
    searchResults.classList.remove('hidden');
    lucide.createIcons();
}

// Display search error
function displaySearchError(message) {
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = `
        <div class="p-4 text-center text-red-400">
            <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2"></i>
            <p>Error searching symbols: ${message}</p>
        </div>
    `;
    searchResults.classList.remove('hidden');
    lucide.createIcons();
}

// Get instrument type color
function getInstrumentTypeColor(instrumentType) {
    if (!instrumentType) return 'text-green-400';

    const type = instrumentType.toUpperCase();
    if (type.includes('EQ') || type === 'EQ') return 'text-green-400';
    if (type.includes('FUT')) return 'text-purple-400';
    if (type.includes('OPT')) return 'text-amber-400';
    return 'text-blue-400';
}

// Get instrument type icon
function getInstrumentTypeIcon(instrumentType) {
    if (!instrumentType) return 'trending-up';

    const type = instrumentType.toUpperCase();
    if (type.includes('EQ') || type === 'EQ') return 'trending-up';
    if (type.includes('FUT')) return 'arrow-up-right';
    if (type.includes('OPT')) return 'grid-3x3';
    return 'hash';
}

// Select search result and populate form
// Update trading type checkboxes based on F&O detection
async function updateTradingTypeCheckboxes(symbolName) {
    try {
        console.log(`🔍 Detecting F&O capabilities for ${symbolName}...`);
        const detection = await detectSymbolTypeEnhanced(symbolName);

        // Update checkboxes based on detection
        const equityCheckbox = document.getElementById('trade-type-equity');
        const futuresCheckbox = document.getElementById('trade-type-futures');
        const optionsCheckbox = document.getElementById('trade-type-options');

        // Always enable and check Equity checkbox (equity trading is available for all symbols)
        if (equityCheckbox) {
            equityCheckbox.checked = true;
            equityCheckbox.disabled = false;
            const equityLabel = equityCheckbox.parentElement.querySelector('span');
            if (equityLabel) {
                equityLabel.classList.remove('opacity-50', 'cursor-not-allowed');
                equityLabel.classList.add('cursor-pointer');
            }
        }
        if (futuresCheckbox) {
            futuresCheckbox.checked = detection.canTradeFno && detection.hasFutures;
            futuresCheckbox.disabled = !detection.hasFutures; // Disable if no futures
            const futuresLabel = futuresCheckbox.parentElement.querySelector('span');
            if (futuresLabel) {
                if (!detection.hasFutures) {
                    futuresLabel.classList.add('opacity-50', 'cursor-not-allowed');
                    futuresLabel.classList.remove('cursor-pointer');
                } else {
                    futuresLabel.classList.remove('opacity-50', 'cursor-not-allowed');
                    futuresLabel.classList.add('cursor-pointer');
                }
            }
        }
        if (optionsCheckbox) {
            optionsCheckbox.checked = detection.canTradeFno && detection.hasOptions;
            optionsCheckbox.disabled = !detection.hasOptions; // Disable if no options
            const optionsLabel = optionsCheckbox.parentElement.querySelector('span');
            if (optionsLabel) {
                if (!detection.hasOptions) {
                    optionsLabel.classList.add('opacity-50', 'cursor-not-allowed');
                    optionsLabel.classList.remove('cursor-pointer');
                } else {
                    optionsLabel.classList.remove('opacity-50', 'cursor-not-allowed');
                    optionsLabel.classList.add('cursor-pointer');
                }
            }
        }

        // Show/hide Options Configuration section
        const optionsConfigSection = document.getElementById('options-config-section');
        if (optionsConfigSection) {
            if (detection.hasOptions) {
                optionsConfigSection.classList.remove('hidden');
            } else {
                optionsConfigSection.classList.add('hidden');
            }
        }

        // Show/hide quantity configuration sections based on checkbox states
        updateQuantitySectionVisibility();

        console.log('✅ F&O detection complete:', {
            symbol: symbolName,
            type: detection.type,
            canTradeEquity: detection.canTradeEquity,
            canTradeFno: detection.canTradeFno,
            hasOptions: detection.hasOptions,
            hasFutures: detection.hasFutures
        });

        return detection;
    } catch (error) {
        console.error('Error detecting F&O capabilities:', error);

        // Set defaults on error
        const equityCheckbox = document.getElementById('trade-type-equity');
        const futuresCheckbox = document.getElementById('trade-type-futures');
        const optionsCheckbox = document.getElementById('trade-type-options');

        if (equityCheckbox) equityCheckbox.checked = true;
        if (futuresCheckbox) {
            futuresCheckbox.checked = false;
            futuresCheckbox.disabled = true;
        }
        if (optionsCheckbox) {
            optionsCheckbox.checked = false;
            optionsCheckbox.disabled = true;
        }

        const optionsConfigSection = document.getElementById('options-config-section');
        if (optionsConfigSection) {
            optionsConfigSection.classList.add('hidden');
        }

        return null;
    }
}

function selectSearchResult(result) {
    // Populate basic information
    document.getElementById('add-symbol-name').value = result.symbol;
    document.getElementById('add-symbol-exchange').value = result.exchange;
    document.getElementById('add-symbol-lot-size').value = result.lot_size || 1;

    // Hide search results
    document.getElementById('search-results').classList.add('hidden');

    // Extract base symbol name (remove CE/PE/FUT suffixes)
    let baseSymbol = result.symbol;
    if (result.name && result.name !== result.symbol) {
        baseSymbol = result.name;
    } else {
        // Remove common suffixes to get base symbol
        baseSymbol = baseSymbol.replace(/\d{2}[A-Z]{3}\d{2}[A-Z]{3}FUT$/, ''); // Remove like 25NOV25FUT
        baseSymbol = baseSymbol.replace(/\d{8}[CP]E?$/, ''); // Remove like 2554800CE
        baseSymbol = baseSymbol.replace(/FUT$/, ''); // Remove FUT
        baseSymbol = baseSymbol.replace(/[CP]E?$/, ''); // Remove CE/PE
    }

    // Update trading type checkboxes based on F&O detection
    updateTradingTypeCheckboxes(baseSymbol);

    // Trigger validation
    validateAndFetchLotSize();

    // Update quantity units if needed (for F&O)
    const qtyUnitsSelect = document.getElementById('add-symbol-qty-units');
    if (qtyUnitsSelect && (result.exchange === 'NFO' || result.exchange === 'BFO' || result.exchange === 'MCX')) {
        qtyUnitsSelect.value = 'lots';
        const lotSize = parseInt(result.lot_size) || 1;
        document.getElementById('add-symbol-min-qty').value = '1';
    }
}

function showAddSymbolForm() {
    // Get watchlist ID from expanded watchlist
    const watchlistId = expandedWatchlistId;

    if (!watchlistId) {
        alert('Please expand a watchlist first to add symbols.');
        return;
    }

    // Get watchlist data
    const watchlistData = expandedWatchlistData[watchlistId];
    if (!watchlistData) {
        alert('Please expand the watchlist first and wait for it to load.');
        return;
    }

    // Store for form submission
    currentWatchlistForAddSymbol = { id: watchlistId, ...watchlistData };

    // Reset form
    document.getElementById('add-symbol-form').reset();

    // Set default values
    document.getElementById('add-symbol-is-enabled').checked = true;
    document.getElementById('add-symbol-contract-multiplier').value = '1.0';
    document.getElementById('add-symbol-rounding').value = 'floor_to_lot';
    document.getElementById('add-symbol-min-qty').value = '1';
    document.getElementById('add-symbol-qty').value = '1';
    document.getElementById('add-symbol-lot-size').value = '1';

    // Initialize field visibility for V2 fields
    updateAddSymbolQtyModeFields();
    updateAddSymbolTargetFields();
    updateAddSymbolSLFields();
    updateAddSymbolTSFields();
    updateAddSymbolTrailingActivationFields();

    // Add event listener for quantity units change to auto-update min qty
    const qtyUnitsSelect = document.getElementById('add-symbol-qty-units');
    if (qtyUnitsSelect) {
        // Remove existing listeners by cloning
        const newQtyUnitsSelect = qtyUnitsSelect.cloneNode(true);
        qtyUnitsSelect.parentNode.replaceChild(newQtyUnitsSelect, qtyUnitsSelect);

        // Add new listener
        newQtyUnitsSelect.addEventListener('change', function() {
            const lotSize = parseInt(document.getElementById('add-symbol-lot-size').value) || 1;
            // Min qty should be 1 (representing 1 lot or 1 unit)
            document.getElementById('add-symbol-min-qty').value = '1';
        });
    }

    // Initialize trading type checkboxes and quantity section visibility
    initializeTradingTypeCheckboxes();
    updateQuantitySectionVisibility();

    // Show modal
    document.getElementById('add-symbol-modal').classList.add('active');
    lucide.createIcons();
}

// Update quantity section visibility based on checkbox states
function updateQuantitySectionVisibility() {
    const equityCheckbox = document.getElementById('trade-type-equity');
    const futuresCheckbox = document.getElementById('trade-type-futures');
    const optionsCheckbox = document.getElementById('trade-type-options');

    const equitySection = document.getElementById('equity-qty-config');
    const futuresSection = document.getElementById('futures-qty-config');
    const optionsSection = document.getElementById('options-qty-config');

    if (equitySection) {
        equitySection.style.display = equityCheckbox?.checked ? 'block' : 'none';
    }
    if (futuresSection) {
        futuresSection.style.display = futuresCheckbox?.checked ? 'block' : 'none';
    }
    if (optionsSection) {
        optionsSection.style.display = optionsCheckbox?.checked ? 'block' : 'none';
    }
}

// Add event listeners to trading type checkboxes
function initializeTradingTypeCheckboxes() {
    const equityCheckbox = document.getElementById('trade-type-equity');
    const futuresCheckbox = document.getElementById('trade-type-futures');
    const optionsCheckbox = document.getElementById('trade-type-options');

    if (equityCheckbox) {
        equityCheckbox.addEventListener('change', updateQuantitySectionVisibility);
    }
    if (futuresCheckbox) {
        futuresCheckbox.addEventListener('change', updateQuantitySectionVisibility);
    }
    if (optionsCheckbox) {
        optionsCheckbox.addEventListener('change', updateQuantitySectionVisibility);
    }
}

// Close add symbol modal
function closeAddSymbolModal() {
    document.getElementById('add-symbol-modal').classList.remove('active');

    // Clear search results
    const searchResults = document.getElementById('search-results');
    const searchInput = document.getElementById('add-symbol-search');
    if (searchResults) {
        searchResults.classList.add('hidden');
        searchResults.innerHTML = '';
    }
    if (searchInput) {
        searchInput.value = '';
    }

    // Clear search timeout
    if (symbolSearchTimeout) {
        clearTimeout(symbolSearchTimeout);
        symbolSearchTimeout = null;
    }
}

// Submit add symbol form
async function submitAddSymbol(event) {
    event.preventDefault();

    if (!currentWatchlistForAddSymbol) {
        alert('No watchlist selected. Please try again.');
        return;
    }

    try {
        const qtyMode = document.getElementById('add-symbol-qtytype').value;
        const targetType = document.getElementById('add-symbol-target-type').value;
        const slType = document.getElementById('add-symbol-sl-type').value;
        const tsType = document.getElementById('add-symbol-ts-type').value;
        const trailingActivationType = document.getElementById('add-symbol-trailing-activation-type').value;

        // Validate lot size requirement for F&O
        const exchange = document.getElementById('add-symbol-exchange').value;
        const qtyValue = parseFloat(document.getElementById('add-symbol-qty').value) || 1;
        const lotSize = parseInt(document.getElementById('add-symbol-lot-size').value) || 1;
        const minQty = parseInt(document.getElementById('add-symbol-min-qty').value) || 1;
        const qtyUnits = document.getElementById('add-symbol-qty-units')?.value || 'units';

        const validation = validateQuantityLotSize(exchange, qtyMode, qtyValue, lotSize, qtyUnits, minQty);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        const symbolData = {
            // Basic Information
            symbol: document.getElementById('add-symbol-name').value.trim().toUpperCase(),
            exchange: document.getElementById('add-symbol-exchange').value,
            lot_size: lotSize,

            // V2 Quantity Fields
            qty_mode: qtyMode,
            qty_value: qtyValue,
            qty_units: qtyMode === 'fixed'
                ? document.getElementById('add-symbol-qty-units').value
                : null,
            min_qty_per_click: parseInt(document.getElementById('add-symbol-min-qty').value) || 1,
            max_qty_per_click: document.getElementById('add-symbol-max-qty').value
                ? parseInt(document.getElementById('add-symbol-max-qty').value)
                : null,
            capital_ceiling_per_trade: document.getElementById('add-symbol-capital-ceiling').value
                ? parseFloat(document.getElementById('add-symbol-capital-ceiling').value)
                : null,
            contract_multiplier: parseFloat(document.getElementById('add-symbol-contract-multiplier').value) || 1.0,
            rounding: document.getElementById('add-symbol-rounding').value,

            // Product & Order Type
            product_type: document.getElementById('add-symbol-product').value,
            order_type: document.getElementById('add-symbol-ordertype').value,

            // Trading Types (F&O Awareness)
            can_trade_equity: document.getElementById('trade-type-equity')?.checked || false,
            can_trade_futures: document.getElementById('trade-type-futures')?.checked || false,
            can_trade_options: document.getElementById('trade-type-options')?.checked || false,

            // Options Configuration
            options_strike_offset: document.getElementById('options-strike-offset')?.value || 'ATM',
            options_expiry_mode: 'AUTO', // Always auto for now

            // Per-Type Quantity Configuration (NEW - V3)
            equity_qty_mode: document.getElementById('equity-qty-mode')?.value || 'fixed',
            equity_qty_value: parseFloat(document.getElementById('equity-qty-value')?.value) || 1,
            equity_qty_units: document.getElementById('equity-qty-units')?.value || 'units',
            futures_qty_mode: document.getElementById('futures-qty-mode')?.value || 'fixed',
            futures_qty_value: parseFloat(document.getElementById('futures-qty-value')?.value) || 1,
            futures_qty_units: document.getElementById('futures-qty-units')?.value || 'lots',
            options_qty_mode: document.getElementById('options-qty-mode')?.value || 'fixed',
            options_qty_value: parseFloat(document.getElementById('options-qty-value')?.value) || 1,
            options_qty_units: document.getElementById('options-qty-units')?.value || 'lots',

            // Target Settings
            target_type: targetType,
            target_value: targetType !== 'NONE'
                ? parseFloat(document.getElementById('add-symbol-target-value').value) || null
                : null,

            // Stop Loss Settings
            sl_type: slType,
            sl_value: slType !== 'NONE'
                ? parseFloat(document.getElementById('add-symbol-sl-value').value) || null
                : null,

            // Trailing Stop Loss
            ts_type: tsType,
            ts_value: tsType !== 'NONE'
                ? parseFloat(document.getElementById('add-symbol-ts-value').value) || null
                : null,
            trailing_activation_type: trailingActivationType,
            trailing_activation_value: trailingActivationType !== 'IMMEDIATE'
                ? parseFloat(document.getElementById('add-symbol-trailing-activation-value').value) || null
                : null,

            // Advanced Settings
            max_position_size: document.getElementById('add-symbol-max-position-size').value
                ? parseInt(document.getElementById('add-symbol-max-position-size').value)
                : null,
            max_instances: document.getElementById('add-symbol-max-instances').value
                ? parseInt(document.getElementById('add-symbol-max-instances').value)
                : null,
            is_enabled: document.getElementById('add-symbol-is-enabled').checked ? 1 : 0,

            // Legacy V1 Field (for backward compatibility)
            qty_type: qtyMode === 'capital' ? 'CAPITAL' : 'FIXED'
        };

        const response = await fetch(`${API_BASE}/api/watchlists/${currentWatchlistForAddSymbol.id}/symbols`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(symbolData)
        });

        const result = await response.json();

        if (response.ok) {
            closeAddSymbolModal();

            // Refresh the expanded watchlist data and re-render
            await loadWatchlistDetails(currentWatchlistForAddSymbol.id);
            renderWatchlists();

            showAlert(result.message || 'Symbol added successfully', 'success');
        } else {
            alert(`Failed to add symbol: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error adding symbol:', error);
        alert('Failed to add symbol. Please try again.');
    }
}

// ========================================
// EDIT SYMBOL CONFIGURATION
// ========================================

// Store current symbol being edited
let currentEditingSymbol = null;

// Open edit symbol config modal
async function editSymbolConfig(symbolId) {
    // Log user action
    logUserAction(`Opening edit modal for symbol ID ${symbolId}`);

    // Try to get watchlist from accordion expansion first, then from modal
    let watchlistData = null;
    let watchlistId = null;

    if (expandedWatchlistId && expandedWatchlistData[expandedWatchlistId]) {
        // Using accordion expansion
        watchlistData = expandedWatchlistData[expandedWatchlistId];
        watchlistId = expandedWatchlistId;
    } else if (currentWatchlist) {
        // Using modal view
        watchlistData = currentWatchlist;
        watchlistId = currentWatchlist.id;
    } else {
        alert('No watchlist selected. Please expand a watchlist first.');
        return;
    }

    // Find symbol in watchlist data
    const symbol = watchlistData.symbols?.find(s => s.symbol_id === symbolId);
    if (!symbol) {
        alert('Symbol not found');
        return;
    }

    currentEditingSymbol = symbol;

    // Populate form fields with existing values or defaults
    document.getElementById('edit-symbol-name').textContent = `${symbol.symbol} (${symbol.exchange})`;

    // V2 Quantity Fields (with backward compatibility from v1)
    const qtyMode = symbol.qty_mode || (symbol.qty_type === 'CAPITAL' ? 'capital' : 'fixed');
    const qtyUnits = symbol.qty_units || 'units';
    const lotSize = symbol.lot_size || 1;
    const minQty = symbol.min_qty_per_click || lotSize;
    const maxQty = symbol.max_qty_per_click || '';
    const capitalCeiling = symbol.capital_ceiling_per_trade || '';

    document.getElementById('edit-qty-mode').value = qtyMode;
    document.getElementById('edit-qty-units').value = qtyUnits;
    document.getElementById('edit-qty-value').value = symbol.qty_value || 1;
    document.getElementById('edit-lot-size').value = lotSize;
    document.getElementById('edit-min-qty').value = minQty;
    document.getElementById('edit-max-qty').value = maxQty;
    document.getElementById('edit-capital-ceiling').value = capitalCeiling;

    // Product & Order Type
    document.getElementById('edit-product-type').value = symbol.product_type || 'MIS';
    document.getElementById('edit-order-type').value = symbol.order_type || 'MARKET';

    // Target Settings
    document.getElementById('edit-target-type').value = symbol.target_type || 'NONE';
    document.getElementById('edit-target-value').value = symbol.target_value || '';

    // Stop Loss Settings
    document.getElementById('edit-sl-type').value = symbol.sl_type || 'NONE';
    document.getElementById('edit-sl-value').value = symbol.sl_value || '';

    // Trailing Stop Loss
    document.getElementById('edit-ts-type').value = symbol.ts_type || 'NONE';
    document.getElementById('edit-ts-value').value = symbol.ts_value || '';
    document.getElementById('edit-trailing-activation-type').value = symbol.trailing_activation_type || 'IMMEDIATE';
    document.getElementById('edit-trailing-activation-value').value = symbol.trailing_activation_value || '';

    // Advanced Settings
    document.getElementById('edit-max-position-size').value = symbol.max_position_size || '';
    document.getElementById('edit-max-instances').value = symbol.max_instances || '';
    document.getElementById('edit-contract-multiplier').value = symbol.contract_multiplier || '1.0';
    document.getElementById('edit-rounding').value = symbol.rounding || 'floor_to_lot';
    document.getElementById('edit-is-enabled').checked = symbol.is_enabled !== 0;

    // F&O Configuration
    const canTradeEquity = symbol.can_trade_equity === 1 || symbol.can_trade_equity === true;
    const canTradeFutures = symbol.can_trade_futures === 1 || symbol.can_trade_futures === true;
    const canTradeOptions = symbol.can_trade_options === 1 || symbol.can_trade_options === true;

    document.getElementById('edit-trade-type-equity').checked = canTradeEquity;
    document.getElementById('edit-trade-type-futures').checked = canTradeFutures;
    document.getElementById('edit-trade-type-options').checked = canTradeOptions;

    // Options configuration
    document.getElementById('edit-options-strike-offset').value = symbol.options_strike_offset || 'ATM';

    // Show/hide options config section based on can_trade_options
    const editOptionsConfigSection = document.getElementById('edit-options-config-section');
    if (canTradeOptions) {
        editOptionsConfigSection.classList.remove('hidden');
    } else {
        editOptionsConfigSection.classList.add('hidden');
    }

    // Show/hide conditional fields
    updateEditQtyModeFields();
    updateEditTargetFields();
    updateEditSLFields();
    updateEditTSFields();
    updateEditTrailingActivationFields();

    // Add event listener for quantity units change to auto-update min qty
    const qtyUnitsSelect = document.getElementById('edit-qty-units');
    if (qtyUnitsSelect) {
        // Remove existing listeners by cloning
        const newQtyUnitsSelect = qtyUnitsSelect.cloneNode(true);
        qtyUnitsSelect.parentNode.replaceChild(newQtyUnitsSelect, qtyUnitsSelect);

        // Add new listener
        newQtyUnitsSelect.addEventListener('change', function() {
            const lotSize = parseInt(document.getElementById('edit-lot-size').value) || 1;
            // Min qty should be 1 (representing 1 lot or 1 unit)
            document.getElementById('edit-min-qty').value = '1';
        });
    }

    // Add event listeners for F&O checkboxes
    const editOptionsCheckbox = document.getElementById('edit-trade-type-options');
    if (editOptionsCheckbox) {
        editOptionsCheckbox.addEventListener('change', function() {
            const editOptionsConfigSection = document.getElementById('edit-options-config-section');
            if (this.checked) {
                editOptionsConfigSection.classList.remove('hidden');
            } else {
                editOptionsConfigSection.classList.add('hidden');
            }
        });
    }

    // Show modal
    document.getElementById('edit-symbol-config-modal').classList.add('active');
    lucide.createIcons();
}

// Close edit modal
function closeEditSymbolConfigModal() {
    logUserAction('Closing edit symbol modal');
    currentEditingSymbol = null;
    document.getElementById('edit-symbol-config-modal').classList.remove('active');
}

// Update target value field visibility
function updateEditTargetFields() {
    const targetType = document.getElementById('edit-target-type').value;
    const targetValueGroup = document.getElementById('edit-target-value-group');
    if (targetType === 'NONE') {
        targetValueGroup.style.display = 'none';
    } else {
        targetValueGroup.style.display = 'block';
    }
}

// Update SL value field visibility
function updateEditSLFields() {
    const slType = document.getElementById('edit-sl-type').value;
    const slValueGroup = document.getElementById('edit-sl-value-group');
    if (slType === 'NONE') {
        slValueGroup.style.display = 'none';
    } else {
        slValueGroup.style.display = 'block';
    }
}

// Update TS value field visibility
function updateEditTSFields() {
    const tsType = document.getElementById('edit-ts-type').value;
    const tsValueGroup = document.getElementById('edit-ts-value-group');
    const trailingActivationGroup = document.getElementById('edit-trailing-activation-group');
    if (tsType === 'NONE') {
        tsValueGroup.style.display = 'none';
        trailingActivationGroup.style.display = 'none';
    } else {
        tsValueGroup.style.display = 'block';
        trailingActivationGroup.style.display = 'block';
    }
}

// Update trailing activation value field visibility
function updateEditTrailingActivationFields() {
    const activationType = document.getElementById('edit-trailing-activation-type').value;
    const activationValueGroup = document.getElementById('edit-trailing-activation-value-group');
    if (activationType === 'IMMEDIATE') {
        activationValueGroup.style.display = 'none';
    } else {
        activationValueGroup.style.display = 'block';
    }
}

// Update quantity mode fields visibility
function updateEditQtyModeFields() {
    const qtyMode = document.getElementById('edit-qty-mode').value;
    const qtyUnitsGroup = document.getElementById('edit-qty-units-group');
    const lotSizeGroup = document.getElementById('edit-lot-size-group');
    const qtyValueHelp = document.getElementById('edit-qty-value-help');

    // Show/hide units and lot size for fixed mode
    if (qtyMode === 'fixed') {
        qtyUnitsGroup.style.display = 'block';
        lotSizeGroup.style.display = 'block';
        qtyValueHelp.textContent = 'Units/lots';
    } else {
        qtyUnitsGroup.style.display = 'none';
        lotSizeGroup.style.display = 'none';
        qtyValueHelp.textContent = qtyMode === 'capital'
            ? 'Capital amount in ₹'
            : 'Percentage (e.g., 2.5 for 2.5%)';
    }
}

// Save symbol config
async function saveSymbolConfig() {
    if (!currentEditingSymbol) {
        alert('No symbol selected for editing');
        logUserAction('Save symbol config failed: No symbol selected');
        return;
    }

    // Log user action
    logUserAction(`Saving configuration for symbol ${currentEditingSymbol.symbol}`);

    // Get watchlist ID from accordion or modal
    const watchlistId = expandedWatchlistId || currentWatchlist?.id;
    if (!watchlistId) {
        alert('No watchlist selected. Please expand a watchlist first.');
        return;
    }

    // Validate lot size requirement for F&O
    const exchange = currentEditingSymbol.exchange;
    const qtyMode = document.getElementById('edit-qty-mode').value;
    const qtyValue = parseFloat(document.getElementById('edit-qty-value').value) || 1;
    const lotSize = parseInt(document.getElementById('edit-lot-size').value) || 1;
    const minQty = parseInt(document.getElementById('edit-min-qty').value) || 1;
    const qtyUnits = document.getElementById('edit-qty-units')?.value || 'units';

    const validation = validateQuantityLotSize(exchange, qtyMode, qtyValue, lotSize, qtyUnits, minQty);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }

    const config = {
        // V2 Quantity Fields
        qty_mode: qtyMode,
        qty_value: qtyValue,
        qty_units: document.getElementById('edit-qty-mode').value === 'fixed'
            ? document.getElementById('edit-qty-units').value
            : null,
        lot_size: parseInt(document.getElementById('edit-lot-size').value) || 1,
        min_qty_per_click: parseInt(document.getElementById('edit-min-qty').value) || 1,
        max_qty_per_click: document.getElementById('edit-max-qty').value
            ? parseInt(document.getElementById('edit-max-qty').value)
            : null,
        capital_ceiling_per_trade: document.getElementById('edit-capital-ceiling').value
            ? parseFloat(document.getElementById('edit-capital-ceiling').value)
            : null,

        // Product & Order Type
        product_type: document.getElementById('edit-product-type').value,
        order_type: document.getElementById('edit-order-type').value,

        // Target Settings
        target_type: document.getElementById('edit-target-type').value,
        target_value: document.getElementById('edit-target-type').value !== 'NONE'
            ? parseFloat(document.getElementById('edit-target-value').value) || null
            : null,

        // Stop Loss Settings
        sl_type: document.getElementById('edit-sl-type').value,
        sl_value: document.getElementById('edit-sl-type').value !== 'NONE'
            ? parseFloat(document.getElementById('edit-sl-value').value) || null
            : null,

        // Trailing Stop Loss
        ts_type: document.getElementById('edit-ts-type').value,
        ts_value: document.getElementById('edit-ts-type').value !== 'NONE'
            ? parseFloat(document.getElementById('edit-ts-value').value) || null
            : null,
        trailing_activation_type: document.getElementById('edit-trailing-activation-type').value,
        trailing_activation_value: document.getElementById('edit-trailing-activation-type').value !== 'IMMEDIATE'
            ? parseFloat(document.getElementById('edit-trailing-activation-value').value) || null
            : null,

        // Advanced Settings
        max_position_size: document.getElementById('edit-max-position-size').value
            ? parseInt(document.getElementById('edit-max-position-size').value)
            : null,
        max_instances: document.getElementById('edit-max-instances').value
            ? parseInt(document.getElementById('edit-max-instances').value)
            : null,
        contract_multiplier: parseFloat(document.getElementById('edit-contract-multiplier').value) || 1.0,
        rounding: document.getElementById('edit-rounding').value,

        // F&O Configuration
        can_trade_equity: document.getElementById('edit-trade-type-equity').checked ? 1 : 0,
        can_trade_futures: document.getElementById('edit-trade-type-futures').checked ? 1 : 0,
        can_trade_options: document.getElementById('edit-trade-type-options').checked ? 1 : 0,
        options_strike_offset: document.getElementById('edit-options-strike-offset').value || 'ATM',
        options_expiry_mode: 'AUTO',

        // Legacy V1 Fields (for backward compatibility)
        qty_type: document.getElementById('edit-qty-mode').value === 'capital'
            ? 'CAPITAL'
            : 'FIXED',

        is_enabled: document.getElementById('edit-is-enabled').checked ? 1 : 0
    };

    try {
        const response = await fetch(
            `${API_BASE}/api/watchlists/${watchlistId}/symbols/${currentEditingSymbol.symbol_id}/config`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(config)
            }
        );

        const result = await response.json();

        if (response.ok) {
            closeEditSymbolConfigModal();
            if (expandedWatchlistId) {
                // Refresh accordion data
                await loadWatchlistDetails(expandedWatchlistId);
                renderWatchlists();
            } else {
                await viewWatchlist(watchlistId);
            }
            showAlert(result.message || 'Symbol configuration updated successfully', 'success');
        } else {
            alert(`Failed to update configuration: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Error updating symbol config:', error);
        alert('Failed to update symbol configuration. Please try again.');
    }
}

// ============================================================================
// Add Symbol Modal - Helper Functions (V2 Fields)
// ============================================================================

// Update quantity mode fields visibility
function updateAddSymbolQtyModeFields() {
    const qtyMode = document.getElementById('add-symbol-qtytype').value;
    const qtyUnitsGroup = document.getElementById('add-symbol-qty-units-group');
    const qtyValueHelp = document.getElementById('add-symbol-qty-help');

    // Show/hide units for fixed mode
    if (qtyMode === 'fixed') {
        qtyUnitsGroup.style.display = 'block';
        qtyValueHelp.textContent = 'Units/lots';
    } else {
        qtyUnitsGroup.style.display = 'none';
        if (qtyMode === 'capital') {
            qtyValueHelp.textContent = 'Capital amount (₹)';
        } else if (qtyMode === 'funds_percent') {
            qtyValueHelp.textContent = 'Percentage of available funds (%)';
        }
    }
}

// Update target fields visibility
function updateAddSymbolTargetFields() {
    const targetType = document.getElementById('add-symbol-target-type').value;
    const targetValueGroup = document.getElementById('add-symbol-target-value-group');
    if (targetType === 'NONE') {
        targetValueGroup.style.display = 'none';
    } else {
        targetValueGroup.style.display = 'block';
    }
}

// Update stop loss fields visibility
function updateAddSymbolSLFields() {
    const slType = document.getElementById('add-symbol-sl-type').value;
    const slValueGroup = document.getElementById('add-symbol-sl-value-group');
    if (slType === 'NONE') {
        slValueGroup.style.display = 'none';
    } else {
        slValueGroup.style.display = 'block';
    }
}

// Update trailing stop loss fields visibility
function updateAddSymbolTSFields() {
    const tsType = document.getElementById('add-symbol-ts-type').value;
    const tsValueGroup = document.getElementById('add-symbol-ts-value-group');
    const activationGroup = document.getElementById('add-symbol-trailing-activation-group');

    if (tsType === 'NONE') {
        tsValueGroup.style.display = 'none';
        activationGroup.style.display = 'none';
    } else {
        tsValueGroup.style.display = 'block';
        activationGroup.style.display = 'grid';
    }
}

// Update trailing activation value field visibility
function updateAddSymbolTrailingActivationFields() {
    const activationType = document.getElementById('add-symbol-trailing-activation-type').value;
    const activationValueGroup = document.getElementById('add-symbol-trailing-activation-value-group');
    if (activationType === 'IMMEDIATE') {
        activationValueGroup.style.display = 'none';
    } else {
        activationValueGroup.style.display = 'block';
    }
}

// Delete symbol
async function deleteSymbolFromCurrentWatchlist(symbolId) {
    if (!currentWatchlist) return;

    const symbol = currentWatchlist.symbols.find(s => s.symbol_id === symbolId);
    if (!symbol) return;

    showConfirmModal(
        `Delete ${symbol.symbol}?`,
        `Are you sure you want to remove ${symbol.symbol} (${symbol.exchange}) from this watchlist? This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`${API_BASE}/api/watchlists/${currentWatchlist.id}/symbols/${symbolId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                const result = await response.json();

                if (response.ok) {
                    await viewWatchlist(currentWatchlist.id); // Refresh watchlist details
                    showAlert(result.message || 'Symbol deleted successfully', 'success');
                } else {
                    alert(`Failed to delete symbol: ${result.message || result.error}`);
                }
            } catch (error) {
                console.error('Error deleting symbol:', error);
                alert('Failed to delete symbol. Please try again.');
            }
        }
    );
}

// ========================================
// ORDER PLACEMENT FUNCTIONS
// ========================================

// Show place orders modal
function showPlaceOrdersModal() {
    if (!currentWatchlist) return;

    // Reset form
    document.getElementById('place-orders-form').classList.remove('hidden');
    document.getElementById('place-orders-progress').classList.add('hidden');
    document.getElementById('place-orders-results').classList.add('hidden');

    // Reset selections
    document.getElementById('select-all-symbols').checked = true;
    document.getElementById('select-all-instances').checked = true;
    document.getElementById('order-product-type').value = '';
    document.getElementById('order-type').value = '';
    document.getElementById('order-price').value = '';
    document.getElementById('order-price-container').classList.add('hidden');

    // Select BUY by default
    document.querySelector('input[name="order-action"][value="BUY"]').checked = true;

    // Load symbols
    loadOrderSymbols();

    // Load instances
    loadOrderInstances();

    // Show modal
    document.getElementById('place-orders-modal').classList.add('active');
    lucide.createIcons();
}

// Close place orders modal
function closePlaceOrdersModal() {
    document.getElementById('place-orders-modal').classList.remove('active');
}

// Load symbols for order placement
function loadOrderSymbols() {
    const container = document.getElementById('order-symbols-list');
    const symbols = currentWatchlist.symbols || [];

    if (symbols.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-sm">No symbols available</p>';
        return;
    }

    container.innerHTML = symbols.map(symbol => `
        <label class="flex items-center space-x-3 p-3 bg-slate-600/30 rounded-lg hover:bg-slate-600/50 cursor-pointer transition-all duration-200">
            <input type="checkbox" class="order-symbol-checkbox rounded text-blue-500" value="${symbol.symbol_id}" checked>
            <div class="flex-1">
                <div class="flex items-center space-x-2">
                    <span class="text-white font-medium">${symbol.symbol}</span>
                    <span class="text-slate-400 text-sm">${symbol.exchange}</span>
                </div>
            </div>
        </label>
    `).join('');
}

// Load instances for order placement
async function loadOrderInstances() {
    const container = document.getElementById('order-instances-list');

    if (!currentWatchlist.instances || currentWatchlist.instances.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-sm">No instances assigned to this watchlist</p>';
        return;
    }

    container.innerHTML = currentWatchlist.instances.map(instance => `
        <label class="flex items-center space-x-3 p-3 bg-slate-600/30 rounded-lg hover:bg-slate-600/50 cursor-pointer transition-all duration-200">
            <input type="checkbox" class="order-instance-checkbox rounded text-blue-500" value="${instance.id}" ${instance.is_active && instance.order_placement_enabled ? 'checked' : 'disabled'}>
            <div class="flex-1">
                <div class="flex items-center space-x-2">
                    <span class="text-white font-medium">${instance.name}</span>
                    ${instance.is_active ?
                        (instance.order_placement_enabled ?
                            '<span class="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">Active</span>' :
                            '<span class="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">Order Disabled</span>'
                        ) :
                        '<span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">Inactive</span>'
                    }
                </div>
                <span class="text-slate-400 text-sm">${instance.broker}</span>
            </div>
        </label>
    `).join('');
}

// Toggle all symbols
function toggleAllSymbols() {
    const checked = document.getElementById('select-all-symbols').checked;
    document.querySelectorAll('.order-symbol-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

// Toggle all instances
function toggleAllInstances() {
    const checked = document.getElementById('select-all-instances').checked;
    document.querySelectorAll('.order-instance-checkbox:not(:disabled)').forEach(cb => {
        cb.checked = checked;
    });
}

// Toggle price input visibility
function togglePriceInput() {
    const orderType = document.getElementById('order-type').value;
    const priceContainer = document.getElementById('order-price-container');

    if (orderType === 'LIMIT') {
        priceContainer.classList.remove('hidden');
    } else {
        priceContainer.classList.add('hidden');
    }
}

// Submit place orders
async function submitPlaceOrders() {
    try {
        // Get selected action
        const action = document.querySelector('input[name="order-action"]:checked').value;

        // Get selected symbols
        const selectedSymbols = Array.from(document.querySelectorAll('.order-symbol-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedSymbols.length === 0) {
            alert('Please select at least one symbol');
            return;
        }

        // Get selected instances
        const selectedInstances = Array.from(document.querySelectorAll('.order-instance-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedInstances.length === 0) {
            alert('Please select at least one instance');
            return;
        }

        // Get order parameters
        const productType = document.getElementById('order-product-type').value;
        const orderType = document.getElementById('order-type').value;
        const price = document.getElementById('order-price').value;

        // Validate LIMIT order price
        if (orderType === 'LIMIT' && (!price || parseFloat(price) <= 0)) {
            alert('Please enter a valid price for LIMIT orders');
            return;
        }

        // Build request body
        const requestBody = {
            symbol_ids: selectedSymbols,
            action: action,
            instance_ids: selectedInstances
        };

        if (productType) {
            requestBody.product_type = productType;
        }

        if (orderType) {
            requestBody.order_type = orderType;
        }

        if (orderType === 'LIMIT' && price) {
            requestBody.price = parseFloat(price);
        }

        // Hide form, show progress
        document.getElementById('place-orders-form').classList.add('hidden');
        document.getElementById('place-orders-progress').classList.remove('hidden');

        // Reset progress
        document.getElementById('progress-bar').style.width = '0%';
        document.getElementById('progress-percentage').textContent = '0%';
        document.getElementById('progress-status').innerHTML = '';
        document.getElementById('progress-close-btn').disabled = true;

        // Show starting message
        addProgressMessage('Initiating order placement...', 'info');

        // Make API call
        const response = await fetch(`${API_BASE}/api/watchlists/${currentWatchlist.id}/place-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        // Update progress to 100%
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('progress-percentage').textContent = '100%';

        if (response.ok) {
            addProgressMessage(`Order placement complete: ${result.summary.successful} successful, ${result.summary.failed} failed`, 'success');

            // Wait a moment then show results
            setTimeout(() => {
                showOrderResults(result);
            }, 1000);
        } else {
            addProgressMessage(`Error: ${result.error || 'Failed to place orders'}`, 'error');
            document.getElementById('progress-close-btn').disabled = false;
        }

    } catch (error) {
        console.error('Error placing orders:', error);
        addProgressMessage(`Error: ${error.message}`, 'error');
        document.getElementById('progress-close-btn').disabled = false;
    }
}

// Add progress message
function addProgressMessage(message, type = 'info') {
    const container = document.getElementById('progress-status');
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex items-start space-x-2 p-3 rounded-lg ${
        type === 'success' ? 'bg-green-500/20 text-green-300' :
        type === 'error' ? 'bg-red-500/20 text-red-300' :
        type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
        'bg-blue-500/20 text-blue-300'
    }`;

    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'x-circle' :
                 type === 'warning' ? 'alert-triangle' :
                 'info';

    messageDiv.innerHTML = `
        <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
        <span class="text-sm flex-1">${message}</span>
    `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
}

// Show order results
function showOrderResults(result) {
    // Hide progress, show results
    document.getElementById('place-orders-progress').classList.add('hidden');
    document.getElementById('place-orders-results').classList.remove('hidden');

    // Update summary counts
    document.getElementById('results-success-count').textContent = result.summary.successful;
    document.getElementById('results-failed-count').textContent = result.summary.failed;

    // Build results table
    const tbody = document.getElementById('results-table-body');
    const allResults = [
        ...(result.results || []).map(r => ({ ...r, success: true })),
        ...(result.errors || []).map(e => ({ ...e, success: false }))
    ];

    tbody.innerHTML = allResults.map(item => `
        <tr class="hover:bg-slate-700/20 transition-all duration-200">
            <td class="p-3 text-white font-medium">${item.symbol}</td>
            <td class="p-3 text-slate-300">${item.instance}</td>
            <td class="p-3">
                ${item.success ?
                    '<span class="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full flex items-center space-x-1 w-fit"><i data-lucide="check" class="w-3 h-3"></i><span>Success</span></span>' :
                    '<span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full flex items-center space-x-1 w-fit"><i data-lucide="x" class="w-3 h-3"></i><span>Failed</span></span>'
                }
            </td>
            <td class="p-3 text-slate-300 font-mono text-sm">${item.order_id || '-'}</td>
            <td class="p-3 text-slate-300">${item.quantity || '-'}</td>
            <td class="p-3 text-slate-300 text-sm">${item.message || item.error || '-'}</td>
        </tr>
    `).join('');

    lucide.createIcons();
}

// ========================================
// OPTIONS TRADING FUNCTIONS
// ========================================

// Show options trading panel for an INDEX symbol
async function showOptionsPanel(symbolId, underlyingSymbol) {
    console.log('Opening options panel for:', underlyingSymbol);
    currentOptionsSymbol = { symbol_id: symbolId, symbol: underlyingSymbol };
    optionsMode = 'buyer'; // Reset to buyer mode

    try {
        // Load expiries
        console.log('Fetching expiries for:', underlyingSymbol);
        const expiryResponse = await fetch(`${API_BASE}/options/expiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ underlying: underlyingSymbol })
        });

        console.log('Expiry response status:', expiryResponse.status);

        if (!expiryResponse.ok) {
            const errorText = await expiryResponse.text();
            console.error('Expiry API error:', errorText);
            throw new Error(`API error: ${expiryResponse.status} - ${errorText}`);
        }

        const expiryData = await expiryResponse.json();
        console.log('Expiry data received:', expiryData);

        if (expiryData.status === 'success') {
            currentOptionsExpiries = expiryData.data.expiry_list;
            console.log('Set expiries:', currentOptionsExpiries);
        } else {
            console.error('Expiry API returned error status:', expiryData);
            // If no expiries loaded, show a message but continue
            if (expiryData.error) {
                console.error('Error message:', expiryData.error);
            }
        }

        // Fetch LTP for underlying
        const ltp = await fetchLTP(underlyingSymbol === 'NIFTY' || underlyingSymbol === 'BANKNIFTY' ? 'NSE_INDEX' : 'NSE', underlyingSymbol);

        // Create options panel
        showOptionsTradingPanel(underlyingSymbol, ltp, currentOptionsExpiries);

    } catch (error) {
        console.error('Error loading options data:', error);
        alert('Failed to load options data: ' + error.message);
        // Still try to open panel with empty expiries
        showOptionsTradingPanel(underlyingSymbol, 0, []);
    }
}

// Toggle between Buyer and Writer mode
function toggleOptionsMode() {
    if (optionsMode === 'buyer') {
        // Switching to Writer mode - show warning
        const confirmMessage = `
⚠️  WARNING: Options Writer Mode

In Writer mode:
• SELL opens SHORT positions (writes options)
• BUY closes SHORT positions (covers options)
• Requires margin for short positions
• Unlimited loss potential

Are you sure you want to switch to Writer mode?
        `;

        if (confirm(confirmMessage)) {
            optionsMode = 'writer';
            updateModeDisplay();
            showWriterWarning();
        }
    } else {
        // Switching back to Buyer mode
        optionsMode = 'buyer';
        updateModeDisplay();
    }
}

// Update mode display
function updateModeDisplay() {
    const modeLabel = document.getElementById('options-mode-label');
    if (modeLabel) {
        if (optionsMode === 'buyer') {
            modeLabel.textContent = 'Options Buyer Mode';
            modeLabel.className = 'text-green-300';
        } else {
            modeLabel.textContent = 'Options Writer Mode';
            modeLabel.className = 'text-yellow-300';
        }
    }
}

// Show writer mode warning
function showWriterWarning() {
    const optionsPanel = document.getElementById('options-trading-panel');
    if (!optionsPanel) return;

    const warningDiv = document.createElement('div');
    warningDiv.className = 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 p-3 rounded-lg mb-4 flex items-start space-x-2';
    warningDiv.innerHTML = `
        <i data-lucide="alert-triangle" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
        <div>
            <strong>Writer Mode Active</strong>
            <p class="text-sm mt-1"><strong>BUY</strong>: Cover short positions (close)</p>
            <p class="text-sm"><strong>SELL</strong>: Write options (open short)</p>
            <p class="text-sm">Margin required for short positions!</p>
        </div>
    `;

    // Insert at the top of the panel
    optionsPanel.insertBefore(warningDiv, optionsPanel.firstChild);

    // Auto-hide after 15 seconds
    setTimeout(() => warningDiv.remove(), 15000);
    lucide.createIcons();
}

// Fetch LTP for a symbol
async function fetchLTP(exchange, symbol) {
    try {
        const response = await fetch(`${API_BASE}/api/watchlists/quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ exchange, symbol })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.data?.ltp || getMockLTP(symbol);
    } catch (error) {
        console.warn('LTP API failed, using mock data for:', symbol, error.message);
        return getMockLTP(symbol);
    }
}

// Get mock LTP for testing when API fails
function getMockLTP(symbol) {
    // Return realistic mock prices for major indices
    const mockPrices = {
        'NIFTY': 24000,
        'BANKNIFTY': 52000,
        'RELIANCE': 2500,
        'TCS': 3500,
        'INFY': 1800
    };

    // Round to nearest 50 for indices (realistic for options)
    if (symbol === 'NIFTY') return 24000;
    if (symbol === 'BANKNIFTY') return 52000;

    // Return existing price or a default
    return mockPrices[symbol] || 100;
}

// Show options trading panel
function showOptionsTradingPanel(underlyingSymbol, underlyingLTP, expiries) {
    // Calculate strike interval
    const strikeInt = underlyingSymbol === 'NIFTY' ? 50 :
                      underlyingSymbol === 'BANKNIFTY' ? 100 : 50;

    const strikes = getAvailableStrikes(underlyingLTP, strikeInt);

    // Create modal HTML
    const modalHtml = `
        <div id="options-trading-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div class="bg-slate-800 rounded-lg border border-slate-600 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div class="p-4 border-b border-slate-600 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-white">${underlyingSymbol} Options Trading</h2>
                    <button onclick="closeOptionsPanel()" class="text-slate-400 hover:text-white">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>

                <div id="options-trading-panel" class="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                    <!-- Mode Toggle -->
                    <div class="flex items-center justify-between mb-6">
                        <div class="flex items-center space-x-4">
                            <span class="text-slate-300">Mode:</span>
                            <span id="options-mode-label" class="text-green-300 font-semibold">Options Buyer Mode</span>
                        </div>
                        <button onclick="toggleOptionsMode()" class="px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded hover:bg-yellow-500/30 text-sm">
                            <i data-lucide="refresh-ccw" class="w-4 h-4 inline mr-2"></i>Switch to Writer ⚠️
                        </button>
                    </div>

                    <!-- Config Display -->
                    <div class="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30 mb-6">
                        <div class="grid grid-cols-4 gap-4 text-sm">
                            <div>
                                <span class="text-slate-400">Expiry:</span>
                                <select id="options-expiry-dropdown" class="mt-1 w-full bg-slate-700 border border-slate-600 text-white rounded px-3 py-2">
                                    ${expiries && expiries.length > 0
                                        ? expiries.map(exp => `<option value="${exp}">${exp}</option>`).join('')
                                        : '<option value="" disabled selected>No expiries available</option>'
                                    }
                                </select>
                                ${expiries && expiries.length === 0
                                    ? '<div class="text-red-400 text-xs mt-1">⚠️ Unable to load expiries from API</div>'
                                    : ''
                                }
                            </div>
                            <div>
                                <span class="text-slate-400">Lotsize:</span>
                                <div class="text-white font-semibold mt-1">${underlyingSymbol === 'NIFTY' ? 25 : underlyingSymbol === 'BANKNIFTY' ? 15 : 1}</div>
                            </div>
                            <div>
                                <span class="text-slate-400">Current:</span>
                                <div class="text-white font-semibold mt-1">${underlyingLTP.toFixed(2)}</div>
                            </div>
                            <div>
                                <span class="text-slate-400">Strike Int:</span>
                                <div class="text-white font-semibold mt-1">${strikeInt}</div>
                            </div>
                        </div>
                    </div>

                    <!-- CE Strikes -->
                    <div class="mb-6">
                        <h3 class="text-white font-semibold mb-3">CE Strikes</h3>
                        <div class="grid grid-cols-5 gap-2">
                            ${strikes.map(strike => `
                                <div class="bg-slate-700/30 rounded p-3 border border-slate-600/30 text-center">
                                    <div class="text-xs text-slate-400">${strike.type}</div>
                                    <div class="text-white font-semibold">${strike.strikePrice}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-3 flex space-x-2">
                            <button onclick="buyOption('CE', 'ATM')" class="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-300 rounded hover:bg-green-500/30">BUY CE</button>
                            <button onclick="sellOption('CE', 'ATM')" class="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded hover:bg-red-500/30">SELL CE</button>
                        </div>
                    </div>

                    <!-- PE Strikes -->
                    <div class="mb-6">
                        <h3 class="text-white font-semibold mb-3">PE Strikes</h3>
                        <div class="grid grid-cols-5 gap-2">
                            ${strikes.map(strike => `
                                <div class="bg-slate-700/30 rounded p-3 border border-slate-600/30 text-center">
                                    <div class="text-xs text-slate-400">${strike.type}</div>
                                    <div class="text-white font-semibold">${strike.strikePrice}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-3 flex space-x-2">
                            <button onclick="buyOption('PE', 'ATM')" class="px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-300 rounded hover:bg-green-500/30">BUY PE</button>
                            <button onclick="sellOption('PE', 'ATM')" class="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded hover:bg-red-500/30">SELL PE</button>
                        </div>
                    </div>

                    <!-- Strategies -->
                    <div>
                        <h3 class="text-white font-semibold mb-3">Strategies</h3>
                        <div class="flex space-x-2">
                            <button onclick="buyStraddle()" class="px-4 py-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded hover:bg-purple-500/30">BUY STRADDLE</button>
                            <button onclick="buyStrangle()" class="px-4 py-2 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded hover:bg-purple-500/30">BUY STRANGLE</button>
                            <button onclick="exitAllOptionsPositions()" class="px-4 py-2 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded hover:bg-orange-500/30">EXIT ALL</button>
                        </div>
                        <div class="mt-2 text-xs text-slate-400">
                            <p>BUY: Open long or close short</p>
                            <p>SELL: Close long or open short (write)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

// Close options panel
function closeOptionsPanel() {
    const modal = document.getElementById('options-trading-modal');
    if (modal) {
        modal.remove();
    }
    currentOptionsSymbol = null;
}

// Buy/Sell option
async function buyOption(optionType, offset) {
    if (!currentOptionsSymbol) return;

    const expiry = document.getElementById('options-expiry-dropdown')?.value;
    const underlying = currentOptionsSymbol.symbol;
    const strikeInt = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;

    const params = {
        underlying,
        expiry_date: expiry,
        strike_int: strikeInt,
        offset: offset || 'ATM',
        option_type: optionType,
        action: 'BUY',
        quantity: 1,
        pricetype: 'MARKET',
        product: 'MIS'
    };

    try {
        const response = await fetch(`${API_BASE}/api/options/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(params)
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`✅ BUY ${optionType} order placed: ${result.orderid}`);
            closeOptionsPanel();
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('Failed to place order: ' + error.message);
    }
}

async function sellOption(optionType, offset) {
    if (!currentOptionsSymbol) return;

    const expiry = document.getElementById('options-expiry-dropdown')?.value;
    const underlying = currentOptionsSymbol.symbol;
    const strikeInt = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;

    const params = {
        underlying,
        expiry_date: expiry,
        strike_int: strikeInt,
        offset: offset || 'ATM',
        option_type: optionType,
        action: 'SELL',
        quantity: 1,
        pricetype: 'MARKET',
        product: optionsMode === 'writer' ? 'NRML' : 'MIS'
    };

    try {
        const response = await fetch(`${API_BASE}/api/options/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(params)
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`✅ SELL ${optionType} order placed: ${result.orderid}`);
            closeOptionsPanel();
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('Failed to place order: ' + error.message);
    }
}

// Straddle/Strangle
async function buyStraddle() {
    if (!currentOptionsSymbol) return;

    const expiry = document.getElementById('options-expiry-dropdown')?.value;
    const underlying = currentOptionsSymbol.symbol;
    const strikeInt = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;

    const params = {
        strategy: 'STRADDLE',
        underlying,
        expiry_date: expiry,
        strike_int: strikeInt,
        offset: 'ATM',
        quantity: 1,
        pricetype: 'MARKET',
        product: 'MIS'
    };

    try {
        const response = await fetch(`${API_BASE}/api/options/basket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(params)
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`✅ STRADDLE placed: ${result.orders.length} legs`);
            closeOptionsPanel();
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('Failed to place order: ' + error.message);
    }
}

async function buyStrangle() {
    if (!currentOptionsSymbol) return;

    const expiry = document.getElementById('options-expiry-dropdown')?.value;
    const underlying = currentOptionsSymbol.symbol;
    const strikeInt = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;

    const params = {
        strategy: 'STRANGLE',
        underlying,
        expiry_date: expiry,
        strike_int: strikeInt,
        offset: 'OTM1',
        quantity: 1,
        pricetype: 'MARKET',
        product: 'MIS'
    };

    try {
        const response = await fetch(`${API_BASE}/api/options/basket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(params)
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`✅ STRANGLE placed: ${result.orders.length} legs`);
            closeOptionsPanel();
        } else {
            alert(`❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('Failed to place order: ' + error.message);
    }
}

// Toggle between Equity and F&O mode for equity symbols
function toggleFnoMode(symbolId, isFnoMode) {
    const equityButtons = document.getElementById('equity-buttons-' + symbolId);
    const fnoButtons = document.getElementById('fno-buttons-' + symbolId);
    const modeText = document.getElementById('fno-mode-text-' + symbolId);

    if (equityButtons && fnoButtons) {
        if (isFnoMode) {
            equityButtons.classList.add('hidden');
            fnoButtons.classList.remove('hidden');
            modeText.textContent = 'F&O';
            modeText.className = 'text-xs font-medium text-yellow-300';
        } else {
            equityButtons.classList.remove('hidden');
            fnoButtons.classList.add('hidden');
            modeText.textContent = 'Equity';
            modeText.className = 'text-xs font-medium text-blue-300';
        }
    }
}

// Exit all options positions for an index symbol
async function exitAllOptionsPositions(symbolId) {
    const watchlistId = expandedWatchlistId;
    if (!watchlistId) {
        alert('Please expand a watchlist first.');
        return;
    }

    // Get symbol data
    const watchlistData = expandedWatchlistData[watchlistId];
    if (!watchlistData || !watchlistData.symbols) {
        alert('Watchlist data not loaded. Please try again.');
        return;
    }

    const symbol = watchlistData.symbols.find(s => s.symbol_id === symbolId);
    if (!symbol) {
        alert('Symbol not found.');
        return;
    }

    const confirmMessage = `Exit all open positions for ${symbol.symbol}? This will place exit orders for all open positions across all assigned instances.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/watchlists/${watchlistId}/place-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                symbol_ids: [symbolId],
                action: 'EXIT'
            })
        });

        const result = await response.json();

        if (response.ok) {
            const successCount = result.results?.filter(r => r.status === 'success').length || 0;
            const errorCount = result.results?.filter(r => r.status === 'error').length || 0;
            showAlert(
                `Exit orders placed for ${symbol.symbol} on ${successCount} instance(s)`,
                'success'
            );
        } else {
            const errorMsg = result.error || 'Failed to place exit orders';
            showAlert(`Failed to exit positions: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Error placing exit orders:', error);
        alert('Failed to place exit orders. Please try again.');
    }
}

/**
 * Delete a symbol from the watchlist
 */
async function deleteSymbol(symbolId, symbolName, watchlistId) {
    if (!confirm(`Are you sure you want to delete "${symbolName}" from this watchlist?`)) {
        return;
    }

    console.log(`Attempting to delete symbol: ${symbolName} (ID: ${symbolId}) from watchlist: ${watchlistId}`);

    try {
        const response = await fetch(`/api/watchlists/${watchlistId}/symbols/${symbolId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Delete response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Delete failed with status', response.status, 'Response:', errorText);
            try {
                const errorJson = JSON.parse(errorText);
                showAlert(errorJson.message || `Failed to delete symbol (Status: ${response.status})`, 'error');
            } catch (e) {
                showAlert(`Failed to delete symbol. Server returned: ${errorText}`, 'error');
            }
            return;
        }

        const result = await response.json();
        console.log('Delete result:', result);

        if (result.status === 'success') {
            showAlert(`Symbol "${symbolName}" deleted successfully`, 'success');
            // Refresh the watchlist data
            loadWatchlists();
        } else {
            showAlert(result.message || 'Failed to delete symbol', 'error');
        }
    } catch (error) {
        console.error('Error deleting symbol:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        showAlert(`Failed to delete symbol: ${error.message}`, 'error');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
