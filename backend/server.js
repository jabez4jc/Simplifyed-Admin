import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cron from 'node-cron';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { configureAuth, setupAuthRoutes, requireAuth } from './auth.js';
import { updateInstancesData as updater_updateInstancesData, performHealthChecks as updater_performHealthChecks } from './lib/instance-updater.js';
import watchlistRoutes from './routes/watchlist/index.js';
import symbolRoutes from './routes/symbols.js';
import symbolSearchRoutes from './routes/symbol-search.js';
import instanceRoutes from './routes/instances.js';
import websocketStatusRoutes from './routes/websocket-status.js';
import watchlistOrderRoutes from './routes/watchlist-orders.js';
import optionsRoutes from './routes/options.js';
import quotesRoutes from './routes/quotes.js';
import AlertService from './lib/alert-service.js';
import WebSocketManager from './lib/websocket-manager.js';
import MarketDataProcessor from './lib/market-data-processor.js';
import PositionManager from './lib/position-manager.js';
import RuleEvaluator from './lib/rule-evaluator.js';
import RateLimiterManager from './lib/rate-limiter.js';
import OrderPlacementService from './lib/order-placement-service.js';
import OrderStatusTracker from './lib/order-status-tracker.js';
import OptionsTradingService from './lib/options-trading-service.js';
import MarketDataRefreshService from './lib/market-data-refresh-service.js';
import createPositionRoutes from './routes/positions.js';
import createOrderRoutes from './routes/orders.js';
import { Server as SocketIOServer } from 'socket.io';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { addVersionHeaders } from './middleware/api-versioning.js';
import { createV1Router } from './routes/v1/index.js';

const ALLOWED_HOST_PROTOCOLS = new Set(['http:', 'https:']);
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

function normalizeHostUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_HOST_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    parsed.search = '';

    // Remove trailing slash to keep consistent storage
    const sanitizedPath = parsed.pathname.replace(/\/+$/, '');
    const base = `${parsed.origin}${sanitizedPath}`;
    return base || parsed.origin;
  } catch {
    return null;
  }
}

function sanitizeApiKey(apiKey) {
  if (typeof apiKey !== 'string') {
    return '';
  }
  return apiKey.trim();
}

function maskApiKey(apiKey) {
  if (!apiKey) {
    return '';
  }
  const visibleLength = Math.min(4, apiKey.length);
  const hiddenLength = Math.max(0, apiKey.length - visibleLength);
  return `${'*'.repeat(hiddenLength)}${apiKey.slice(-visibleLength)}`;
}

const requestTimeoutMs = (() => {
  const parsed = Number.parseInt(process.env.OPENALGO_REQUEST_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
})();

const app = express();
const port = process.env.PORT || 3000;

// Ensure database directory exists
const dbDir = join(__dirname, 'database');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(join(dbDir, 'simplifyed.db'));

// Promise wrapper for database operations
const dbAsync = {
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  })
};

/**
 * Initialize database with migration system
 *
 * DEPRECATED: Old initializeDatabase() function has been replaced
 * with proper migration system in db/migrations/
 *
 * This function now runs the migration system automatically.
 */
async function initializeDatabase() {
  console.log('🔄 Running database migrations...');

  try {
    // Import migrations dynamically
    const migrations = [
      await import('./db/migrations/000_initial_schema.js'),
      await import('./db/migrations/001_add_missing_tables.js'),
      await import('./db/migrations/002_add_database_indexes.js'),
      await import('./db/migrations/003_enable_sqlite_optimizations.js'),
      await import('./db/migrations/004_add_symbol_configs_and_admin_fields.js'),
      await import('./db/migrations/005_add_watchlist_positions_is_closed.js'),
      await import('./db/migrations/006_fix_missing_columns_and_tables.js')
    ];

    // Create migration tracking table
    await dbAsync.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get already applied migrations
    const applied = await dbAsync.all('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(applied.map(row => row.version));

    // Run pending migrations
    let appliedCount = 0;
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`  ⬆️  Applying migration: ${migration.name}`);
        await migration.up(dbAsync);
        await dbAsync.run(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      console.log('✅ Database is up to date (no pending migrations)');
    } else {
      console.log(`✅ Applied ${appliedCount} migration(s)`);
    }
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error; // Fail fast on migration errors
  }
}

// Configure authentication
configureAuth(app, __dirname, dbAsync);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Setup auth routes
setupAuthRoutes(app);

// Make dbAsync and utility functions available to routes
app.locals.dbAsync = dbAsync;
app.locals.normalizeHostUrl = normalizeHostUrl;
app.locals.sanitizeApiKey = sanitizeApiKey;
app.locals.updater_updateInstancesData = updater_updateInstancesData;

// Add API versioning headers to all /api/* routes
app.use('/api', addVersionHeaders);

// Mount API v1 routes (NEW - versioned routes)
const v1Router = createV1Router({ dbAsync, io: null }); // io will be set after server starts
app.use('/api/v1', v1Router);

// Legacy routes (DEPRECATED - kept for backward compatibility)
// These will be removed in v2.0.0
console.log('⚠️  Mounting legacy /api/* routes for backward compatibility');
app.use('/api/watchlists', requireAuth, watchlistRoutes);
app.use('/api/watchlists', requireAuth, symbolRoutes);
app.use('/api/watchlists', requireAuth, watchlistOrderRoutes);
app.use('/api/instances', instanceRoutes); // Unified instances router (auth handled within)
app.use('/api/websocket', requireAuth, websocketStatusRoutes);
app.use('/api/symbols', requireAuth, symbolSearchRoutes);
app.use('/api/symbols', requireAuth, symbolRoutes);
app.use('/api/options', requireAuth, optionsRoutes);
app.use('/api/quotes', requireAuth, quotesRoutes);

// API Routes
app.get('/api/user', async (req, res) => {
  // Check if test mode is enabled
  const isTestMode = process.env.TEST_MODE === 'true';

  if (isTestMode) {
    // In test mode, return the test user
    res.json({
      authenticated: true,
      user: { email: 'test@simplifyed.in', name: 'Test User', is_admin: true },
      isAdmin: true
    });
    return;
  }

  if (req.isAuthenticated()) {
    try {
      // Check if user is admin
      const userEmail = (req.user.email || '').toLowerCase();
      const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);

      res.json({
        authenticated: true,
        user: req.user,
        isAdmin: currentUser ? Boolean(currentUser.is_admin) : false
      });
    } catch (error) {
      console.error('Error checking user admin status:', error);
      res.json({
        authenticated: true,
        user: req.user,
        isAdmin: false
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

// Instance CRUD operations moved to routes/instances.js

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test connection and refresh operations moved to routes/instances.js
// Analyzer operations moved to routes/instances.js

// User Management API Routes

// Get all users
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = (req.user.email || '').toLowerCase();
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const users = await dbAsync.all('SELECT email, is_admin, created_at FROM users ORDER BY created_at ASC');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Add user
app.post('/api/users', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = (req.user.email || '').toLowerCase();
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if user already exists
    const existingUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    await dbAsync.run('INSERT INTO users (email) VALUES (?)', [email.toLowerCase()]);
    
    const newUser = await dbAsync.get('SELECT email, is_admin, created_at FROM users WHERE email = ?', [email.toLowerCase()]);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Remove user
app.delete('/api/users/:email', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = (req.user.email || '').toLowerCase();
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const { email } = req.params;
    
    // Prevent removing the first user (admin)
    const targetUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (targetUser && targetUser.is_admin) {
      return res.status(400).json({ error: 'Cannot remove admin user' });
    }
    
    await dbAsync.run('DELETE FROM users WHERE email = ?', [email]);
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// Make OpenAlgo API request function
async function makeOpenAlgoRequest(instance, endpoint, method = 'POST', data = {}) {
  const normalizedHostUrl = normalizeHostUrl(instance.host_url);
  if (!normalizedHostUrl) {
    throw new Error('Invalid host URL provided for OpenAlgo request');
  }

  const sanitizedApiKey = sanitizeApiKey(instance.api_key);
  if (!sanitizedApiKey) {
    throw new Error('API key is required for OpenAlgo requests');
  }

  const normalizedEndpoint = typeof endpoint === 'string' ? endpoint.replace(/^\//, '') : '';
  if (!normalizedEndpoint) {
    throw new Error('Endpoint is required for OpenAlgo requests');
  }

  const baseData = data && typeof data === 'object' ? data : {};
  const url = `${normalizedHostUrl}/api/v1/${normalizedEndpoint}`;
  const payload = { ...baseData, apikey: sanitizedApiKey };
  const maskedPayload = { ...baseData, apikey: maskApiKey(payload.apikey) };

  console.log(`🔍 Making OpenAlgo request to: ${url}`);
  console.log(`🔍 Payload preview:`, maskedPayload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method && method.toUpperCase() === 'GET' ? undefined : JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// P&L helper functions are implemented in `backend/lib/pnl.js` and imported above.

// `getAccountPnL` moved to `backend/lib/account-pnl.js` and imported above.

// Use dependency-injected update functions from `lib/instance-updater.js`

// Health checks are implemented in `backend/lib/instance-updater.js` (performHealthChecks)

// Auto-switch implementation moved to `backend/lib/instance-updater.js` (autoSwitchToAnalyzer)

// Initialize AlertService and WebSocketManager (Phase 2: WebSocket Integration)
// Phase 3: Position Management
// Phase 4: Order Placement & Rate Limiting
let alertService = null;
let wsManager = null;
let marketDataProcessor = null;
let positionManager = null;
let ruleEvaluator = null;
let rateLimiterManager = null;
let orderPlacementService = null;
let orderStatusTracker = null;
let monitoringLoopInterval = null;
let io = null;

async function initializeWebSocketServices(httpServer) {
  try {
    console.log('🔌 Initializing WebSocket services...');

    // Initialize AlertService with optional email config
    const emailConfig = {
      enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO
    };

    alertService = new AlertService(dbAsync, emailConfig);
    console.log('✅ AlertService initialized');

    // Initialize WebSocketManager
    wsManager = new WebSocketManager(dbAsync, alertService);
    console.log('✅ WebSocketManager initialized');

    // Initialize MarketDataProcessor
    marketDataProcessor = new MarketDataProcessor(dbAsync, wsManager);
    console.log('✅ MarketDataProcessor initialized');

    // Initialize Socket.IO for dashboard broadcasting
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.BASE_URL || 'http://localhost:3000',
        credentials: true
      }
    });

    // Handle frontend WebSocket connections
    io.on('connection', (socket) => {
      console.log(`🔌 Frontend client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`🔌 Frontend client disconnected: ${socket.id}`);
      });

      // Send initial market data cache
      socket.emit('market_data_snapshot', Array.from(wsManager.marketDataCache.entries()));
    });

    // Forward market ticks to all connected frontend clients
    wsManager.on('market_tick', (tick) => {
      if (io) {
        io.emit('market_tick', tick);
      }
    });

    // Forward WebSocket status changes to frontend
    wsManager.on('connected', (data) => {
      if (io) {
        io.emit('ws_status', { event: 'connected', data });
      }
    });

    wsManager.on('disconnected', (data) => {
      if (io) {
        io.emit('ws_status', { event: 'disconnected', data });
      }
    });

    // Start WebSocket connection to Primary Admin (if configured)
    await wsManager.initialize();
    console.log('✅ WebSocket services initialized successfully');

    // Start MarketDataProcessor (batches DB updates every 1 second)
    marketDataProcessor.start();
    console.log('✅ MarketDataProcessor started');

    // Make services available to routes
    app.locals.alertService = alertService;
    app.locals.wsManager = wsManager;
    app.locals.marketDataProcessor = marketDataProcessor;

    // Initialize Phase 3: Position Management
    console.log('📊 Initializing Position Management...');

    // Initialize PositionManager
    positionManager = new PositionManager(dbAsync, alertService);
    console.log('✅ PositionManager initialized');

    // Initialize RuleEvaluator
    ruleEvaluator = new RuleEvaluator(dbAsync, positionManager, alertService, wsManager);
    console.log('✅ RuleEvaluator initialized');

    // Mount position management routes
    const positionRoutes = createPositionRoutes(dbAsync, positionManager, ruleEvaluator, alertService);
    app.use('/api/positions', requireAuth, positionRoutes);
    console.log('✅ Position management routes mounted');

    // Start continuous monitoring loop (every 2 seconds)
    startMonitoringLoop();
    console.log('✅ Position monitoring loop started');

    // Initialize Phase 4: Order Placement & Rate Limiting
    console.log('📦 Initializing Order Placement & Rate Limiting...');

    // Initialize RateLimiterManager
    rateLimiterManager = new RateLimiterManager(dbAsync);
    console.log('✅ RateLimiterManager initialized');

    // Initialize OrderPlacementService
    orderPlacementService = new OrderPlacementService(dbAsync, rateLimiterManager, alertService, makeOpenAlgoRequest);
    console.log('✅ OrderPlacementService initialized');

    // Make OrderPlacementService and makeOpenAlgoRequest available to routes
    app.locals.orderPlacementService = orderPlacementService;
    app.locals.makeOpenAlgoRequest = makeOpenAlgoRequest;

    // Connect OrderPlacementService to PositionManager
    positionManager.setOrderPlacementService(orderPlacementService);
    console.log('✅ PositionManager connected to OrderPlacementService');

    // Initialize OrderStatusTracker
    orderStatusTracker = new OrderStatusTracker(dbAsync, orderPlacementService, alertService);
    console.log('✅ OrderStatusTracker initialized');

    // Initialize OptionsTradingService
    const optionsTradingService = new OptionsTradingService(dbAsync, makeOpenAlgoRequest);
    console.log('✅ OptionsTradingService initialized');

    // Make OptionsTradingService available to routes
    app.locals.optionsTradingService = optionsTradingService;

    // Start order status polling
    orderStatusTracker.start();
    console.log('✅ Order status tracking started');

    // Initialize Phase 6: Market Data Refresh Service
    console.log('📈 Initializing Market Data Refresh Service...');

    // Initialize MarketDataRefreshService
    const marketDataRefreshService = new MarketDataRefreshService(dbAsync, makeOpenAlgoRequest, alertService);
    console.log('✅ MarketDataRefreshService initialized');

    // Make MarketDataRefreshService available to routes
    app.locals.marketDataRefreshService = marketDataRefreshService;

    // Start market data refresh (every 30 seconds)
    marketDataRefreshService.start();
    console.log('✅ Market data refresh service started');

    // Mount order management routes
    const orderRoutes = createOrderRoutes(dbAsync, orderPlacementService, rateLimiterManager);
    app.use('/api/orders', requireAuth, orderRoutes);
    console.log('✅ Order management routes mounted');

    // Add error handling middleware (MUST be last)
    app.use(notFoundHandler); // 404 handler
    app.use(errorHandler);    // Global error handler
    console.log('✅ Error handling middleware mounted');
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket services:', error);
    console.log('⚠️  Server will continue without WebSocket functionality');
  }
}

/**
 * Start continuous monitoring loop for position exit detection
 * Runs every 2 seconds to evaluate all open positions
 */
function startMonitoringLoop() {
  if (monitoringLoopInterval) {
    clearInterval(monitoringLoopInterval);
  }

  monitoringLoopInterval = setInterval(async () => {
    try {
      if (!ruleEvaluator) {
        return;
      }

      const result = await ruleEvaluator.evaluateExitSignals();

      // Log only if positions were evaluated or closed
      if (result.evaluated > 0) {
        console.log(`[MonitoringLoop] Evaluated ${result.evaluated} positions, closed ${result.closed}`);
      }

      // If positions were closed, emit event to frontend
      if (result.closed > 0 && io) {
        io.emit('positions_closed', {
          count: result.closed,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('[MonitoringLoop] Error in monitoring loop:', error.message);
    }
  }, 2000); // Run every 2 seconds

  console.log('✅ Position monitoring loop started (2-second interval)');
}

/**
 * Stop monitoring loop (for graceful shutdown)
 */
function stopMonitoringLoop() {
  if (monitoringLoopInterval) {
    clearInterval(monitoringLoopInterval);
    monitoringLoopInterval = null;
    console.log('🛑 Position monitoring loop stopped');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📪 SIGTERM received, shutting down gracefully...');
  stopMonitoringLoop();
  if (orderStatusTracker) {
    orderStatusTracker.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📪 SIGINT received, shutting down gracefully...');
  stopMonitoringLoop();
  if (orderStatusTracker) {
    orderStatusTracker.stop();
  }
  process.exit(0);
});

// Schedule instance data updates every 30 seconds (as per architecture requirements)
cron.schedule('*/30 * * * * *', () => updater_updateInstancesData(dbAsync, makeOpenAlgoRequest));

// Schedule health checks every 30 seconds (updated from 20 minutes)
cron.schedule('*/30 * * * * *', () => updater_performHealthChecks(dbAsync, makeOpenAlgoRequest));

// Run initial data update after 3 seconds
setTimeout(() => {
  console.log('🔄 Running initial instance data update...');
  updater_updateInstancesData(dbAsync, makeOpenAlgoRequest);
}, 3000);

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();

    // Create HTTP server for Socket.IO
    const http = await import('http');
    const httpServer = http.createServer(app);

    // Start HTTP server
    httpServer.listen(port, async () => {
      console.log(`🚀 Simplifyed Trading Backend running on port ${port}`);
      console.log(`🔗 API Base URL: http://localhost:${port}/api`);
      console.log(`🔐 Auth URL: http://localhost:${port}/auth/google`);

      // Initialize WebSocket services after server starts
      await initializeWebSocketServices(httpServer);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
