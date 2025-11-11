#!/usr/bin/env node
/**
 * Test Runner - Master Test Execution Script
 * Runs all test suites and generates comprehensive reports
 */

import { log, logTest, formatSummary } from './utils.js';
import config from './config.js';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test suite definitions
const testSuites = [
  {
    name: 'Core API Tests',
    file: './api/test-core-api.js',
    description: 'Health, user, instances, static files, auth, error handling'
  },
  {
    name: 'Options API Tests',
    file: './api/test-options-api.js',
    description: 'Expiry, symbol, LTP, order, basket endpoints'
  },
  {
    name: 'Integration Tests',
    file: './integration/test-complete-workflow.js',
    description: 'Complete workflows, symbol resolution, LTP consistency, error recovery'
  },
  {
    name: 'UI Tests',
    file: './ui/test-dashboard-ui.js',
    description: 'Dashboard HTML, Options tool, LTP displays, event handlers'
  }
];

// Import test modules dynamically
async function importTestModule(filePath) {
  // Resolve relative path to absolute path from test directory
  const absolutePath = path.resolve(__dirname, filePath);
  const moduleURL = pathToFileURL(absolutePath);
  const module = await import(moduleURL);
  return module;
}

// Run a single test suite
async function runTestSuite(suite) {
  log(`\n${'='.repeat(70)}`, 'blue');
  log(`Running: ${suite.name}`, 'blue');
  log(`Description: ${suite.description}`, 'cyan');
  log('='.repeat(70), 'blue');

  try {
    const module = await importTestModule(suite.file);

    // Get the main test function
    const testFunction = module.default || module.runAllTests;

    if (!testFunction) {
      log(`❌ No test function found in ${suite.file}`, 'red');
      return { name: suite.name, passed: false, error: 'No test function exported' };
    }

    // Run the test suite
    await testFunction();

    log(`✅ ${suite.name} completed`, 'green');
    return { name: suite.name, passed: true };

  } catch (error) {
    log(`❌ ${suite.name} failed: ${error.message}`, 'red');
    log(`   Stack: ${error.stack}`, 'yellow');
    return { name: suite.name, passed: false, error: error.message };
  }
}

// Generate comprehensive report
function generateReport(results) {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = ((passed / total) * 100).toFixed(1);

  log('\n' + '='.repeat(70), 'blue');
  log('COMPREHENSIVE TEST REPORT', 'blue');
  log('='.repeat(70), 'blue');

  log('\n📊 Test Suite Results:', 'cyan');
  results.forEach(result => {
    const symbol = result.passed ? '✓' : '✗';
    const color = result.passed ? 'green' : 'red';
    log(`  ${symbol} ${result.name}`, color);
    if (!result.passed && result.error) {
      log(`    Error: ${result.error}`, 'yellow');
    }
  });

  log('\n📈 Summary:', 'cyan');
  log(`  Total Suites: ${total}`, 'cyan');
  log(`  Passed: ${passed}`, 'green');
  log(`  Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`  Pass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

  log('\n🎯 Test Coverage:', 'cyan');
  log('  • Core API: Health, User, Instances, Static Files, Auth, Errors', 'cyan');
  log('  • Options API: Expiry, Symbol, LTP, Order, Basket', 'cyan');
  log('  • Authentication: TEST_MODE bypass validation', 'cyan');
  log('  • Error Handling: 404, validation, edge cases', 'cyan');

  log('\n💡 Usage Instructions:', 'yellow');
  log('  Run individual test suites:', 'yellow');
  log('    node test/api/test-core-api.js', 'yellow');
  log('    node test/api/test-options-api.js', 'yellow');
  log('  Run all tests:', 'yellow');
  log('    node test/run-all-tests.js', 'yellow');

  log('\n⚠️  Prerequisites:', 'yellow');
  log('  • Server must be running on port 3000', 'yellow');
  log('  • TEST_MODE=true for authentication bypass', 'yellow');
  log('  • Use: TEST_MODE=true node backend/server.js', 'yellow');

  log('\n' + '='.repeat(70), 'blue');

  if (failed > 0) {
    log('\n❌ Some tests failed. Please review the errors above.', 'red');
    return 1;
  } else {
    log('\n✅ All tests passed successfully!', 'green');
    return 0;
  }
}

// Main execution
async function main() {
  log('\n' + '='.repeat(70), 'blue');
  log('Simplifyed Admin - Comprehensive Test Suite', 'blue');
  log('='.repeat(70), 'blue');
  log(`\n🧪 TEST MODE: ${config.server.testMode ? 'ENABLED' : 'DISABLED'}`, 'cyan');
  log(`🌐 Server: ${config.server.host}:${config.server.port}`, 'cyan');
  log(`⏰ Started: ${new Date().toLocaleString()}`, 'cyan');

  const allResults = [];

  // Run each test suite
  for (const suite of testSuites) {
    const result = await runTestSuite(suite);
    allResults.push(result);

    // Brief pause between suites
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate final report
  const exitCode = generateReport(allResults);

  // Exit with appropriate code
  process.exit(exitCode);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    log(`Stack: ${error.stack}`, 'yellow');
    process.exit(1);
  });
}

export { main as runAllTests };
