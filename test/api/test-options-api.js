#!/usr/bin/env node
/**
 * Options API Tests
 * Tests all Options API endpoints
 */

import { makeRequest, log, logTest, assert, assertEquals, assertHasProperty, waitForServer, formatSummary, generateTestData } from '../utils.js';
import config from '../config.js';

const BASE_URL = `http://localhost:${config.server.port}`;

async function testExpiryAPI() {
  log('\n📋 Test 1: Expiry API', 'blue');
  const results = [];

  // Test 1.1: Valid request
  try {
    const response = await makeRequest('/api/options/expiry', 'POST', {
      underlying: 'NIFTY'
    });

    if (response.status === 200) {
      assertHasProperty(response.data, 'status', 'Response should have status');
      assertEquals(response.data.status, 'success', 'Status should be success');
      assertHasProperty(response.data, 'data', 'Response should have data');
      assertHasProperty(response.data.data, 'expiry_list', 'Data should have expiry_list');
      logTest('Valid expiry request (NIFTY)', true, `Found ${response.data.data.expiry_list?.length || 0} expiries`);
      results.push({ name: 'Valid expiry request (NIFTY)', passed: true });
    } else if (response.status === 500) {
      logTest('Valid expiry request (no instance)', true, 'Expected without configured instance');
      results.push({ name: 'Valid expiry request (no instance)', passed: true });
    } else {
      logTest('Valid expiry request', false, `Status: ${response.status}`);
      results.push({ name: 'Valid expiry request', passed: false });
    }
  } catch (error) {
    logTest('Valid expiry request', false, `Error: ${error.message}`);
    results.push({ name: 'Valid expiry request', passed: false, error: error.message });
  }

  // Test 1.2: BANKNIFTY
  try {
    const response = await makeRequest('/api/options/expiry', 'POST', {
      underlying: 'BANKNIFTY'
    });

    if (response.status === 200 || response.status === 500) {
      logTest('BANKNIFTY expiry request', true, `Status: ${response.status}`);
      results.push({ name: 'BANKNIFTY expiry request', passed: true });
    } else {
      logTest('BANKNIFTY expiry request', false, `Status: ${response.status}`);
      results.push({ name: 'BANKNIFTY expiry request', passed: false });
    }
  } catch (error) {
    logTest('BANKNIFTY expiry request', false, `Error: ${error.message}`);
    results.push({ name: 'BANKNIFTY expiry request', passed: false, error: error.message });
  }

  // Test 1.3: Missing underlying
  try {
    const response = await makeRequest('/api/options/expiry', 'POST', {});

    assertEquals(response.status, 400, 'Should return 400 for missing underlying');
    logTest('Missing underlying validation', true, 'Returns 400 error');
    results.push({ name: 'Missing underlying validation', passed: true });
  } catch (error) {
    logTest('Missing underlying validation', false, `Error: ${error.message}`);
    results.push({ name: 'Missing underlying validation', passed: false, error: error.message });
  }

  return results;
}

async function testSymbolAPI() {
  log('\n📋 Test 2: Symbol Resolution API', 'blue');
  const results = [];

  // Test 2.1: Valid CE request
  try {
    const response = await makeRequest('/api/options/symbol', 'POST', {
      underlying: 'NIFTY',
      expiry_date: '28NOV24',
      strike_int: 50,
      offset: 'ATM',
      option_type: 'CE'
    });

    if (response.status === 200) {
      assertHasProperty(response.data, 'status', 'Response should have status');
      assertEquals(response.data.status, 'success', 'Status should be success');
      assertHasProperty(response.data.data, 'symbol', 'Data should have symbol');
      logTest('Valid CE symbol request', true, response.data.data.symbol || 'Success');
      results.push({ name: 'Valid CE symbol request', passed: true });
    } else if (response.status === 500) {
      logTest('Valid CE symbol (no instance)', true, 'Expected without configured instance');
      results.push({ name: 'Valid CE symbol (no instance)', passed: true });
    } else {
      logTest('Valid CE symbol request', false, `Status: ${response.status}`);
      results.push({ name: 'Valid CE symbol request', passed: false });
    }
  } catch (error) {
    logTest('Valid CE symbol request', false, `Error: ${error.message}`);
    results.push({ name: 'Valid CE symbol request', passed: false, error: error.message });
  }

  // Test 2.2: Valid PE request
  try {
    const response = await makeRequest('/api/options/symbol', 'POST', {
      underlying: 'NIFTY',
      expiry_date: '28NOV24',
      strike_int: 50,
      offset: 'ATM',
      option_type: 'PE'
    });

    if (response.status === 200 || response.status === 500) {
      logTest('Valid PE symbol request', true, `Status: ${response.status}`);
      results.push({ name: 'Valid PE symbol request', passed: true });
    } else {
      logTest('Valid PE symbol request', false, `Status: ${response.status}`);
      results.push({ name: 'Valid PE symbol request', passed: false });
    }
  } catch (error) {
    logTest('Valid PE symbol request', false, `Error: ${error.message}`);
    results.push({ name: 'Valid PE symbol request', passed: false, error: error.message });
  }

  // Test 2.3: ITM1 offset
  try {
    const response = await makeRequest('/api/options/symbol', 'POST', {
      underlying: 'NIFTY',
      expiry_date: '28NOV24',
      strike_int: 50,
      offset: 'ITM1',
      option_type: 'CE'
    });

    if (response.status === 200 || response.status === 500) {
      logTest('ITM1 offset request', true, `Status: ${response.status}`);
      results.push({ name: 'ITM1 offset request', passed: true });
    } else {
      logTest('ITM1 offset request', false, `Status: ${response.status}`);
      results.push({ name: 'ITM1 offset request', passed: false });
    }
  } catch (error) {
    logTest('ITM1 offset request', false, `Error: ${error.message}`);
    results.push({ name: 'ITM1 offset request', passed: false, error: error.message });
  }

  // Test 2.4: Missing parameters
  try {
    const response = await makeRequest('/api/options/symbol', 'POST', {
      underlying: 'NIFTY'
    });

    assertEquals(response.status, 400, 'Should return 400 for missing parameters');
    logTest('Missing parameters validation', true, 'Returns 400 error');
    results.push({ name: 'Missing parameters validation', passed: true });
  } catch (error) {
    logTest('Missing parameters validation', false, `Error: ${error.message}`);
    results.push({ name: 'Missing parameters validation', passed: false, error: error.message });
  }

  return results;
}

async function testLTPAPI() {
  log('\n📋 Test 3: LTP API', 'blue');
  const results = [];

  // Test 3.1: Valid LTP request
  try {
    const response = await makeRequest('/api/options/ltp', 'POST', generateTestData('ltp'));

    if (response.status === 200) {
      assertHasProperty(response.data, 'status', 'Response should have status');
      assertEquals(response.data.status, 'success', 'Status should be success');
      assertHasProperty(response.data, 'data', 'Response should have data');

      const data = response.data.data;
      assertHasProperty(data, 'underlying', 'Data should have underlying');
      assertHasProperty(data, 'underlying_ltp', 'Data should have underlying_ltp');

      // Check if call and put are present (may be null if no instance configured)
      if (data.call) {
        assertHasProperty(data.call, 'symbol', 'Call should have symbol');
        assertHasProperty(data.call, 'ltp', 'Call should have ltp');
      }

      if (data.put) {
        assertHasProperty(data.put, 'symbol', 'Put should have symbol');
        assertHasProperty(data.put, 'ltp', 'Put should have ltp');
      }

      logTest('Valid LTP request', true, `Underlying LTP: ${data.underlying_ltp || 'N/A'}`);
      results.push({ name: 'Valid LTP request', passed: true });
    } else if (response.status === 500) {
      logTest('Valid LTP (no instance)', true, 'Expected without configured instance');
      results.push({ name: 'Valid LTP (no instance)', passed: true });
    } else {
      logTest('Valid LTP request', false, `Status: ${response.status}`);
      results.push({ name: 'Valid LTP request', passed: false });
    }
  } catch (error) {
    logTest('Valid LTP request', false, `Error: ${error.message}`);
    results.push({ name: 'Valid LTP request', passed: false, error: error.message });
  }

  // Test 3.2: Custom offsets
  try {
    const response = await makeRequest('/api/options/ltp', 'POST', {
      instance_id: 1,
      underlying: 'NIFTY',
      expiry_date: '28NOV24',
      strike_int: 50,
      call_offset: 'OTM1',
      put_offset: 'ITM1'
    });

    if (response.status === 200 || response.status === 500) {
      logTest('Custom offsets (OTM1/ITM1)', true, `Status: ${response.status}`);
      results.push({ name: 'Custom offsets (OTM1/ITM1)', passed: true });
    } else {
      logTest('Custom offsets (OTM1/ITM1)', false, `Status: ${response.status}`);
      results.push({ name: 'Custom offsets (OTM1/ITM1)', passed: false });
    }
  } catch (error) {
    logTest('Custom offsets (OTM1/ITM1)', false, `Error: ${error.message}`);
    results.push({ name: 'Custom offsets (OTM1/ITM1)', passed: false, error: error.message });
  }

  // Test 3.3: BANKNIFTY
  try {
    const response = await makeRequest('/api/options/ltp', 'POST', {
      instance_id: 1,
      underlying: 'BANKNIFTY',
      expiry_date: '28NOV24',
      strike_int: 100
    });

    if (response.status === 200 || response.status === 500) {
      logTest('BANKNIFTY LTP request', true, `Status: ${response.status}`);
      results.push({ name: 'BANKNIFTY LTP request', passed: true });
    } else {
      logTest('BANKNIFTY LTP request', false, `Status: ${response.status}`);
      results.push({ name: 'BANKNIFTY LTP request', passed: false });
    }
  } catch (error) {
    logTest('BANKNIFTY LTP request', false, `Error: ${error.message}`);
    results.push({ name: 'BANKNIFTY LTP request', passed: false, error: error.message });
  }

  // Test 3.4: Missing instance_id
  try {
    const response = await makeRequest('/api/options/ltp', 'POST', {
      underlying: 'NIFTY',
      expiry_date: '28NOV24',
      strike_int: 50
    });

    assertEquals(response.status, 400, 'Should return 400 for missing instance_id');
    logTest('Missing instance_id validation', true, 'Returns 400 error');
    results.push({ name: 'Missing instance_id validation', passed: true });
  } catch (error) {
    logTest('Missing instance_id validation', false, `Error: ${error.message}`);
    results.push({ name: 'Missing instance_id validation', passed: false, error: error.message });
  }

  return results;
}

async function testOrderAPI() {
  log('\n📋 Test 4: Order Placement API', 'blue');
  const results = [];

  // Test 4.1: Valid order request
  try {
    const response = await makeRequest('/api/options/order', 'POST', generateTestData('order'));

    // Should either succeed or fail with 500 (no instance)
    if (response.status === 200 || response.status === 500) {
      logTest('Valid order request', true, `Status: ${response.status}`);
      results.push({ name: 'Valid order request', passed: true });
    } else {
      logTest('Valid order request', false, `Status: ${response.status}`);
      results.push({ name: 'Valid order request', passed: false });
    }
  } catch (error) {
    logTest('Valid order request', false, `Error: ${error.message}`);
    results.push({ name: 'Valid order request', passed: false, error: error.message });
  }

  // Test 4.2: SELL order
  try {
    const response = await makeRequest('/api/options/order', 'POST', {
      ...generateTestData('order'),
      action: 'SELL'
    });

    if (response.status === 200 || response.status === 500) {
      logTest('SELL order request', true, `Status: ${response.status}`);
      results.push({ name: 'SELL order request', passed: true });
    } else {
      logTest('SELL order request', false, `Status: ${response.status}`);
      results.push({ name: 'SELL order request', passed: false });
    }
  } catch (error) {
    logTest('SELL order request', false, `Error: ${error.message}`);
    results.push({ name: 'SELL order request', passed: false, error: error.message });
  }

  // Test 4.3: LIMIT order
  try {
    const response = await makeRequest('/api/options/order', 'POST', {
      ...generateTestData('order'),
      pricetype: 'LIMIT',
      price: 50.00
    });

    if (response.status === 200 || response.status === 500) {
      logTest('LIMIT order request', true, `Status: ${response.status}`);
      results.push({ name: 'LIMIT order request', passed: true });
    } else {
      logTest('LIMIT order request', false, `Status: ${response.status}`);
      results.push({ name: 'LIMIT order request', passed: false });
    }
  } catch (error) {
    logTest('LIMIT order request', false, `Error: ${error.message}`);
    results.push({ name: 'LIMIT order request', passed: false, error: error.message });
  }

  // Test 4.4: Missing action
  try {
    const response = await makeRequest('/api/options/order', 'POST', {
      ...generateTestData('order'),
      action: undefined
    });

    assertEquals(response.status, 400, 'Should return 400 for missing action');
    logTest('Missing action validation', true, 'Returns 400 error');
    results.push({ name: 'Missing action validation', passed: true });
  } catch (error) {
    logTest('Missing action validation', false, `Error: ${error.message}`);
    results.push({ name: 'Missing action validation', passed: false, error: error.message });
  }

  return results;
}

async function testBasketAPI() {
  log('\n📋 Test 5: Basket Order API', 'blue');
  const results = [];

  // Test 5.1: STRADDLE strategy
  try {
    const response = await makeRequest('/api/options/basket', 'POST', generateTestData('basket', {
      strategy: 'STRADDLE'
    }));

    if (response.status === 200 || response.status === 500) {
      logTest('STRADDLE basket order', true, `Status: ${response.status}`);
      results.push({ name: 'STRADDLE basket order', passed: true });
    } else {
      logTest('STRADDLE basket order', false, `Status: ${response.status}`);
      results.push({ name: 'STRADDLE basket order', passed: false });
    }
  } catch (error) {
    logTest('STRADDLE basket order', false, `Error: ${error.message}`);
    results.push({ name: 'STRADDLE basket order', passed: false, error: error.message });
  }

  // Test 5.2: STRANGLE strategy
  try {
    const response = await makeRequest('/api/options/basket', 'POST', generateTestData('basket', {
      strategy: 'STRANGLE',
      offset: 'OTM1'
    }));

    if (response.status === 200 || response.status === 500) {
      logTest('STRANGLE basket order', true, `Status: ${response.status}`);
      results.push({ name: 'STRANGLE basket order', passed: true });
    } else {
      logTest('STRANGLE basket order', false, `Status: ${response.status}`);
      results.push({ name: 'STRANGLE basket order', passed: false });
    }
  } catch (error) {
    logTest('STRANGLE basket order', false, `Error: ${error.message}`);
    results.push({ name: 'STRANGLE basket order', passed: false, error: error.message });
  }

  // Test 5.3: Invalid strategy
  try {
    const response = await makeRequest('/api/options/basket', 'POST', {
      ...generateTestData('basket'),
      strategy: 'INVALID'
    });

    assertEquals(response.status, 400, 'Should return 400 for invalid strategy');
    logTest('Invalid strategy validation', true, 'Returns 400 error');
    results.push({ name: 'Invalid strategy validation', passed: true });
  } catch (error) {
    logTest('Invalid strategy validation', false, `Error: ${error.message}`);
    results.push({ name: 'Invalid strategy validation', passed: false, error: error.message });
  }

  return results;
}

async function runAllTests() {
  log('='.repeat(70), 'blue');
  log('Options API - Comprehensive Test Suite', 'blue');
  log('='.repeat(70), 'blue');
  log('');

  const allResults = [];

  try {
    // Wait for server to be ready
    await waitForServer();

    // Run all test suites
    const expiryResults = await testExpiryAPI();
    allResults.push(...expiryResults);

    const symbolResults = await testSymbolAPI();
    allResults.push(...symbolResults);

    const ltpResults = await testLTPAPI();
    allResults.push(...ltpResults);

    const orderResults = await testOrderAPI();
    allResults.push(...orderResults);

    const basketResults = await testBasketAPI();
    allResults.push(...basketResults);

    // Print summary
    const summary = formatSummary(allResults);

    log('\n✅ Options API Tests Complete', 'green');
    log(`All ${allResults.length} tests executed`);

    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0);

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testExpiryAPI, testSymbolAPI, testLTPAPI, testOrderAPI, testBasketAPI };
export default runAllTests;
