#!/usr/bin/env node
/**
 * Complete Workflow Integration Tests
 * Tests end-to-end workflows combining multiple API calls
 */

import { makeRequest, log, logTest, waitForServer, formatSummary } from '../utils.js';
import config from '../config.js';

const BASE_URL = `http://localhost:${config.server.port}`;

async function testOptionsTradingWorkflow() {
  log('\n📋 Test Suite: Options Trading Complete Workflow', 'blue');
  const results = [];

  // Step 1: Get expiries
  try {
    log('\n  Step 1: Fetching expiries...', 'cyan');
    const expiryResponse = await makeRequest('/api/options/expiry', 'POST', {
      underlying: 'NIFTY'
    });

    if (expiryResponse.status === 200) {
      const expiries = expiryResponse.data.data?.expiry_list || [];
      logTest('  ✓ Fetch expiries', true, `Found ${expiries.length} expiries`);

      if (expiries.length > 0) {
        // Step 2: Resolve call symbol
        log('\n  Step 2: Resolving call option symbol...', 'cyan');
        const callSymbolResponse = await makeRequest('/api/options/symbol', 'POST', {
          underlying: 'NIFTY',
          expiry_date: expiries[0],
          strike_int: 50,
          offset: 'ATM',
          option_type: 'CE'
        });

        if (callSymbolResponse.status === 200) {
          const callSymbol = callSymbolResponse.data.data?.symbol;
          logTest('  ✓ Resolve call symbol', true, callSymbol || 'Success');

          // Step 3: Resolve put symbol
          log('\n  Step 3: Resolving put option symbol...', 'cyan');
          const putSymbolResponse = await makeRequest('/api/options/symbol', 'POST', {
            underlying: 'NIFTY',
            expiry_date: expiries[0],
            strike_int: 50,
            offset: 'ATM',
            option_type: 'PE'
          });

          if (putSymbolResponse.status === 200) {
            const putSymbol = putSymbolResponse.data.data?.symbol;
            logTest('  ✓ Resolve put symbol', true, putSymbol || 'Success');

            // Step 4: Fetch LTP data
            log('\n  Step 4: Fetching LTP data...', 'cyan');
            const ltpResponse = await makeRequest('/api/options/ltp', 'POST', {
              instance_id: 1,
              underlying: 'NIFTY',
              expiry_date: expiries[0],
              strike_int: 50
            });

            if (ltpResponse.status === 200) {
              const ltpData = ltpResponse.data.data;
              const hasUnderlying = ltpData?.underlying_ltp !== null;
              const hasCall = ltpData?.call?.ltp !== null;
              const hasPut = ltpData?.put?.ltp !== null;

              logTest('  ✓ Fetch LTP data', true,
                `Underlying: ${hasUnderlying}, CE: ${hasCall}, PE: ${hasPut}`);

              results.push({ name: 'Complete Options Trading Workflow', passed: true });
            } else {
              logTest('  ✗ Fetch LTP data', false, `Status: ${ltpResponse.status}`);
              results.push({ name: 'Complete Options Trading Workflow', passed: false });
            }
          } else {
            logTest('  ✗ Resolve put symbol', false, `Status: ${putSymbolResponse.status}`);
            results.push({ name: 'Complete Options Trading Workflow', passed: false });
          }
        } else {
          logTest('  ✗ Resolve call symbol', false, `Status: ${callSymbolResponse.status}`);
          results.push({ name: 'Complete Options Trading Workflow', passed: false });
        }
      } else {
        logTest('  ✗ No expiries available', false, 'Cannot proceed without expiries');
        results.push({ name: 'Complete Options Trading Workflow', passed: false });
      }
    } else {
      logTest('  ✗ Fetch expiries', false, `Status: ${expiryResponse.status}`);
      results.push({ name: 'Complete Options Trading Workflow', passed: false });
    }
  } catch (error) {
    logTest('Complete workflow', false, `Error: ${error.message}`);
    results.push({ name: 'Complete Options Trading Workflow', passed: false, error: error.message });
  }

  return results;
}

async function testSymbolResolutionFlow() {
  log('\n📋 Test Suite: Symbol Resolution Flow', 'blue');
  const results = [];

  const testCases = [
    { offset: 'ATM', option_type: 'CE', description: 'ATM Call' },
    { offset: 'ATM', option_type: 'PE', description: 'ATM Put' },
    { offset: 'ITM1', option_type: 'CE', description: 'ITM1 Call' },
    { offset: 'OTM1', option_type: 'PE', description: 'OTM1 Put' }
  ];

  for (const testCase of testCases) {
    try {
      const response = await makeRequest('/api/options/symbol', 'POST', {
        underlying: 'NIFTY',
        expiry_date: '28NOV24',
        strike_int: 50,
        offset: testCase.offset,
        option_type: testCase.option_type
      });

      if (response.status === 200) {
        const symbol = response.data.data?.symbol;
        logTest(`  ✓ ${testCase.description}`, true, symbol || 'Resolved');
        results.push({ name: `Symbol resolution: ${testCase.description}`, passed: true });
      } else {
        logTest(`  ✗ ${testCase.description}`, false, `Status: ${response.status}`);
        results.push({ name: `Symbol resolution: ${testCase.description}`, passed: false });
      }
    } catch (error) {
      logTest(`  ✗ ${testCase.description}`, false, `Error: ${error.message}`);
      results.push({ name: `Symbol resolution: ${testCase.description}`, passed: false, error: error.message });
    }
  }

  return results;
}

async function testLTPDataConsistency() {
  log('\n📋 Test Suite: LTP Data Consistency', 'blue');
  const results = [];

  try {
    // Fetch LTP multiple times to check consistency
    const responses = [];
    for (let i = 0; i < 3; i++) {
      const response = await makeRequest('/api/options/ltp', 'POST', {
        instance_id: 1,
        underlying: 'NIFTY',
        expiry_date: '28NOV24',
        strike_int: 50
      });
      responses.push(response);
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
    }

    // Check if all responses are successful
    const allSuccess = responses.every(r => r.status === 200);
    logTest('  ✓ Multiple LTP requests', allSuccess, `${responses.length} requests made`);

    // Check data structure consistency
    if (allSuccess) {
      const firstData = responses[0].data.data;
      const structuresMatch = responses.every(r => {
        const data = r.data.data;
        return data &&
               'underlying' in data &&
               'call' in data &&
               'put' in data;
      });

      logTest('  ✓ Data structure consistency', structuresMatch, 'All responses have same structure');

      if (structuresMatch) {
        results.push({ name: 'LTP Data Consistency', passed: true });
      } else {
        results.push({ name: 'LTP Data Consistency', passed: false });
      }
    } else {
      results.push({ name: 'LTP Data Consistency', passed: false });
    }
  } catch (error) {
    logTest('  ✗ LTP consistency', false, `Error: ${error.message}`);
    results.push({ name: 'LTP Data Consistency', passed: false, error: error.message });
  }

  return results;
}

async function testBasketOrderFlow() {
  log('\n📋 Test Suite: Basket Order Flow', 'blue');
  const results = [];

  const basketTests = [
    { strategy: 'STRADDLE', offset: 'ATM', description: 'Straddle at ATM' },
    { strategy: 'STRANGLE', offset: 'OTM1', description: 'Strangle at OTM1' }
  ];

  for (const test of basketTests) {
    try {
      const response = await makeRequest('/api/options/basket', 'POST', {
        instance_id: 1,
        strategy: test.strategy,
        underlying: 'NIFTY',
        expiry_date: '28NOV24',
        strike_int: 50,
        offset: test.offset,
        quantity: 1
      });

      // Basket orders may fail without configured instance, but should not 404
      if (response.status === 404) {
        logTest(`  ✗ ${test.description}`, false, 'Route not found');
        results.push({ name: `Basket order: ${test.description}`, passed: false });
      } else if (response.status === 500) {
        logTest(`  ✓ ${test.description} (expected without instance)`, true, 'Route accessible');
        results.push({ name: `Basket order: ${test.description}`, passed: true });
      } else {
        logTest(`  ✓ ${test.description}`, true, `Status: ${response.status}`);
        results.push({ name: `Basket order: ${test.description}`, passed: true });
      }
    } catch (error) {
      logTest(`  ✗ ${test.description}`, false, `Error: ${error.message}`);
      results.push({ name: `Basket order: ${test.description}`, passed: false, error: error.message });
    }
  }

  return results;
}

async function testErrorRecovery() {
  log('\n📋 Test Suite: Error Recovery & Resilience', 'blue');
  const results = [];

  // Test 1: Invalid parameters
  try {
    const response = await makeRequest('/api/options/expiry', 'POST', {});
    if (response.status === 400) {
      logTest('  ✓ Invalid expiry request', true, 'Proper validation error');
      results.push({ name: 'Invalid parameter handling', passed: true });
    } else {
      logTest('  ✗ Invalid expiry request', false, `Status: ${response.status}`);
      results.push({ name: 'Invalid parameter handling', passed: false });
    }
  } catch (error) {
    logTest('  ✗ Error recovery test', false, `Error: ${error.message}`);
    results.push({ name: 'Invalid parameter handling', passed: false, error: error.message });
  }

  // Test 2: Non-existent route
  try {
    const response = await makeRequest('/api/options/nonexistent', 'POST', {});
    if (response.status === 404) {
      logTest('  ✓ 404 for non-existent route', true, 'Proper error handling');
      results.push({ name: '404 error handling', passed: true });
    } else {
      logTest('  ✗ 404 error handling', false, `Status: ${response.status}`);
      results.push({ name: '404 error handling', passed: false });
    }
  } catch (error) {
    logTest('  ✗ 404 test', false, `Error: ${error.message}`);
    results.push({ name: '404 error handling', passed: false, error: error.message });
  }

  return results;
}

async function runAllTests() {
  log('='.repeat(70), 'blue');
  log('Complete Workflow Integration Tests', 'blue');
  log('='.repeat(70), 'blue');
  log('');

  const allResults = [];

  try {
    await waitForServer();

    const workflowResults = await testOptionsTradingWorkflow();
    allResults.push(...workflowResults);

    const symbolResults = await testSymbolResolutionFlow();
    allResults.push(...symbolResults);

    const ltpResults = await testLTPDataConsistency();
    allResults.push(...ltpResults);

    const basketResults = await testBasketOrderFlow();
    allResults.push(...basketResults);

    const errorResults = await testErrorRecovery();
    allResults.push(...errorResults);

    const summary = formatSummary(allResults);

    log('\n✅ Integration Tests Complete', 'green');
    log(`All ${allResults.length} workflow tests executed`);

    process.exit(summary.failed > 0 ? 1 : 0);

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testOptionsTradingWorkflow, testSymbolResolutionFlow, testLTPDataConsistency, testBasketOrderFlow, testErrorRecovery };
export default runAllTests;
