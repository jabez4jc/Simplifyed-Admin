/**
 * Test Utilities
 * Common functions for all tests
 */

import http from 'http';
import { URL } from 'url';
import config from './config.js';

const colors = config.colors;

/**
 * Log a message with color
 */
export function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Log a test result
 */
export function logTest(name, passed, details = '') {
  const symbol = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`  ${symbol} ${name}`, color);
  if (details) {
    log(`    ${details}`, 'yellow');
  }
}

/**
 * Make HTTP request
 */
export function makeRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.server.host);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Assert helper
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert equals
 */
export function assertEquals(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
  }
}

/**
 * Assert not null/undefined
 */
export function assertNotNull(value, message = 'Value should not be null/undefined') {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert has property
 */
export function assertHasProperty(obj, prop, message = '') {
  if (!obj.hasOwnProperty(prop)) {
    throw new Error(`Object should have property '${prop}'. ${message}`);
  }
}

/**
 * Wait for specified milliseconds
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if server is healthy
 */
export async function checkServerHealth() {
  try {
    const response = await makeRequest('/api/health');
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for server to be ready
 */
export async function waitForServer(maxAttempts = 30, interval = 1000) {
  log('Waiting for server to be ready...', 'blue');

  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServerHealth()) {
      log('✅ Server is ready', 'green');
      return true;
    }
    await wait(interval);
  }

  throw new Error('Server did not become ready in time');
}

/**
 * Format test results summary
 */
export function formatSummary(results) {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = ((passed / total) * 100).toFixed(1);

  log('\n' + '='.repeat(70), 'blue');
  log('Test Summary', 'cyan');
  log('='.repeat(70), 'cyan');
  log(`Total Tests: ${total}`, 'cyan');
  log(`Passed: ${passed} (${passRate}%)`, passed > 0 ? 'green' : 'yellow');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log('='.repeat(70), 'blue');

  return { total, passed, failed, passRate };
}

/**
 * Generate random test data
 */
export function generateTestData(type, options = {}) {
  const data = config.testData;

  switch (type) {
    case 'expiry':
      return {
        underlying: options.underlying || data.underlying.NIFTY
      };

    case 'symbol':
      return {
        underlying: options.underlying || data.underlying.NIFTY,
        expiry_date: options.expiry_date || data.expiryDates.NIFTY,
        strike_int: options.strike_int || data.strikeIntervals.NIFTY,
        offset: options.offset || data.offsets[0],
        option_type: options.option_type || data.optionTypes[0]
      };

    case 'ltp':
      return {
        instance_id: options.instance_id || data.instanceId,
        underlying: options.underlying || data.underlying.NIFTY,
        expiry_date: options.expiry_date || data.expiryDates.NIFTY,
        strike_int: options.strike_int || data.strikeIntervals.NIFTY,
        call_offset: options.call_offset || data.offsets[0],
        put_offset: options.put_offset || data.offsets[0]
      };

    case 'order':
      return {
        instance_id: options.instance_id || data.instanceId,
        underlying: options.underlying || data.underlying.NIFTY,
        expiry_date: options.expiry_date || data.expiryDates.NIFTY,
        strike_int: options.strike_int || data.strikeIntervals.NIFTY,
        offset: options.offset || data.offsets[0],
        option_type: options.option_type || data.optionTypes[0],
        action: options.action || 'BUY',
        quantity: options.quantity || data.quantities[0],
        pricetype: options.pricetype || data.orderTypes[0],
        price: options.price || 0
      };

    case 'basket':
      return {
        instance_id: options.instance_id || data.instanceId,
        strategy: options.strategy || data.strategies[0],
        underlying: options.underlying || data.underlying.NIFTY,
        expiry_date: options.expiry_date || data.expiryDates.NIFTY,
        strike_int: options.strike_int || data.strikeIntervals.NIFTY,
        offset: options.offset || data.offsets[0],
        quantity: options.quantity || data.quantities[0]
      };

    default:
      return {};
  }
}
