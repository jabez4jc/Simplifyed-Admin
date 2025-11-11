/**
 * Test Configuration
 * Centralized configuration for all tests
 */

const config = {
  // Server Configuration
  server: {
    host: 'http://localhost',
    port: process.env.TEST_PORT || 3000,
    timeout: 30000,
    testMode: process.env.TEST_MODE === 'true' || true // Default to true for test environment
  },

  // Test User Credentials (TEST_MODE)
  testUser: {
    email: 'test@simplifyed.in',
    password: null, // Not needed in TEST_MODE
    isAdmin: true
  },

  // Test Data
  testData: {
    // Valid test instance
    instanceId: 1,

    // Test underlying symbols
    underlying: {
      NIFTY: 'NIFTY',
      BANKNIFTY: 'BANKNIFTY'
    },

    // Test expiry dates (current week)
    expiryDates: {
      NIFTY: '28NOV24',
      BANKNIFTY: '28NOV24'
    },

    // Strike intervals
    strikeIntervals: {
      NIFTY: 50,
      BANKNIFTY: 100
    },

    // Offset types
    offsets: ['ATM', 'ITM1', 'ITM2', 'OTM1', 'OTM2'],

    // Option types
    optionTypes: ['CE', 'PE'],

    // Test quantities
    quantities: [1, 2, 5],

    // Order types
    orderTypes: ['MARKET', 'LIMIT'],

    // Products
    products: ['MIS', 'NRML'],

    // Strategies
    strategies: ['STRADDLE', 'STRANGLE']
  },

  // Colors for console output
  colors: {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
  },

  // Test options
  testOptions: {
    runInBand: false, // Run tests serially
    timeout: 60000, // Default timeout
    retries: 1 // Retry failed tests
  }
};

export default config;
