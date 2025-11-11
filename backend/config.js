/**
 * Centralized Configuration Management
 *
 * All application configuration in one place for easy maintenance.
 * Environment variables are validated and defaults are provided.
 */

// Validate required environment variables in production
function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const required = ['SESSION_SECRET', 'BASE_URL'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables in production:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }
}

validateProductionConfig();

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  // Database
  database: {
    path: process.env.DB_PATH || './database/simplifyed.db',
    sessionPath: './database/sessions.db',
    // SQLite optimizations
    walMode: true,
    cacheSize: -10000, // 10MB
    busyTimeout: 5000, // 5 seconds
  },

  // OpenAlgo API
  openalgo: {
    requestTimeout: parseInt(process.env.OPENALGO_REQUEST_TIMEOUT_MS || '15000', 10),
    maxRetries: 3,
    retryDelayMs: 2000,
  },

  // Rate Limiting
  rateLimit: {
    // Authentication endpoints
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // requests per window
    },
    // API endpoints
    api: {
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // requests per window
    },
    // Order placement (more restrictive)
    orders: {
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // requests per window
    }
  },

  // Cron Jobs
  cron: {
    // Instance updates and health checks
    updateInterval: '*/2 * * * *', // Every 2 minutes (changed from 30 seconds)
    healthCheckInterval: '*/5 * * * *', // Every 5 minutes
  },

  // Session
  session: {
    secret: process.env.SESSION_SECRET,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
  },

  // Security
  security: {
    corsOrigin: process.env.CORS_ORIGIN || process.env.BASE_URL || 'http://localhost:3000',
    helmetEnabled: true,
    testModeAllowed: process.env.NODE_ENV !== 'production',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || 'combined',
  },

  // Frontend
  frontend: {
    // Polling intervals (in milliseconds)
    dashboardRefreshInterval: 30000, // 30 seconds
    orderRefreshInterval: 5000, // 5 seconds
    ltpRefreshInterval: 2000, // 2 seconds for live updates
  },

  // Features
  features: {
    websocketEnabled: true,
    alertServiceEnabled: true,
    autoSwitchEnabled: true,
  },

  // Test Mode (development only)
  testMode: {
    enabled: process.env.TEST_MODE === 'true' && process.env.NODE_ENV !== 'production',
    testEmail: 'test@simplifyed.in',
  }
};

// Log configuration on startup
if (config.isDevelopment) {
  console.log('📋 Configuration loaded:');
  console.log('   Environment:', config.env);
  console.log('   Port:', config.port);
  console.log('   Base URL:', config.baseUrl);
  console.log('   Test Mode:', config.testMode.enabled);
  console.log('   Database:', config.database.path);
}

export default config;
