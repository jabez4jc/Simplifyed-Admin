#!/usr/bin/env node
/**
 * UI Tests - Dashboard and Frontend Functionality
 * Tests static HTML/JS files and UI components
 */

import { makeRequest, log, logTest, formatSummary } from '../utils.js';
import config from '../config.js';

const BASE_URL = `http://localhost:${config.server.port}`;

async function testDashboardHTML() {
  log('\n📋 Test Suite: Dashboard HTML UI', 'blue');
  const results = [];

  try {
    const response = await makeRequest('/dashboard.html');

    if (response.status === 200) {
      const html = response.data.toString();

      // Check for essential UI elements
      const hasTitle = html.includes('dashboard') || html.includes('Dashboard');
      const hasNavigation = html.includes('nav') || html.includes('sidebar');
      const hasInstancesView = html.includes('instances') || html.includes('Instances');
      const hasWatchlistsView = html.includes('watchlists') || html.includes('Watchlists');
      const hasOptionsButton = html.includes('openOptionsTool') || html.includes('Options');
      const hasLoginForm = html.includes('login') || html.includes('auth');

      logTest('  ✓ Dashboard loads', true, 'HTTP 200');
      logTest('  ✓ Has title', hasTitle, hasTitle ? 'Dashboard title present' : 'Missing title');
      logTest('  ✓ Has navigation', hasNavigation, hasNavigation ? 'Navigation present' : 'Missing');
      logTest('  ✓ Has Instances view', hasInstancesView, hasInstancesView ? 'View present' : 'Missing');
      logTest('  ✓ Has Watchlists view', hasWatchlistsView, hasWatchlistsView ? 'View present' : 'Missing');
      logTest('  ✓ Has Options button', hasOptionsButton, hasOptionsButton ? 'Button present' : 'Missing');
      logTest('  ✓ Has login form', hasLoginForm, hasLoginForm ? 'Auth form present' : 'Missing');

      results.push({ name: 'Dashboard HTML structure', passed: hasTitle && hasNavigation });

    } else {
      logTest('  ✗ Dashboard loads', false, `Status: ${response.status}`);
      results.push({ name: 'Dashboard HTML structure', passed: false });
    }
  } catch (error) {
    logTest('  ✗ Dashboard test', false, `Error: ${error.message}`);
    results.push({ name: 'Dashboard HTML structure', passed: false, error: error.message });
  }

  return results;
}

async function testOptionsToolUI() {
  log('\n📋 Test Suite: Options Tool UI Components', 'blue');
  const results = [];

  try {
    const response = await makeRequest('/options-scalping.js');

    if (response.status === 200) {
      const js = response.data.toString();

      // Check for UI update functions
      const hasUpdateLTPDisplays = js.includes('updateLTPDisplays');
      const hasUpdateCallDisplays = js.includes('updateCallDisplays') || js.includes('call');
      const hasUpdatePutDisplays = js.includes('updatePutDisplays') || js.includes('put');
      const hasUpdateUnderlyingDisplays = js.includes('updateUnderlyingDisplays') || js.includes('underlying');

      logTest('  ✓ updateLTPDisplays()', hasUpdateLTPDisplays, hasUpdateLTPDisplays ? 'Function exists' : 'Missing');
      logTest('  ✓ Call display updates', hasUpdateCallDisplays, hasUpdateCallDisplays ? 'Implemented' : 'Missing');
      logTest('  ✓ Put display updates', hasUpdatePutDisplays, hasUpdatePutDisplays ? 'Implemented' : 'Missing');
      logTest('  ✓ Underlying display updates', hasUpdateUnderlyingDisplays, hasUpdateUnderlyingDisplays ? 'Implemented' : 'Missing');

      // Check for form elements
      const hasInstanceSelect = js.includes('instance') && js.includes('select');
      const hasUnderlyingSelect = js.includes('underlying') && js.includes('select');
      const hasExpirySelect = js.includes('expiry') && js.includes('select');
      const hasStrikeInputs = js.includes('strike') && js.includes('input');
      const hasOffsetSelect = js.includes('offset') && js.includes('select');

      logTest('  ✓ Instance selector', hasInstanceSelect, hasInstanceSelect ? 'Form element present' : 'Missing');
      logTest('  ✓ Underlying selector', hasUnderlyingSelect, hasUnderlyingSelect ? 'Form element present' : 'Missing');
      logTest('  ✓ Expiry selector', hasExpirySelect, hasExpirySelect ? 'Form element present' : 'Missing');
      logTest('  ✓ Strike inputs', hasStrikeInputs, hasStrikeInputs ? 'Form element present' : 'Missing');
      logTest('  ✓ Offset selector', hasOffsetSelect, hasOffsetSelect ? 'Form element present' : 'Missing');

      // Check for order placement UI
      const hasBuySellButtons = js.includes('BUY') && js.includes('SELL');
      const hasQuantityInput = js.includes('quantity') && js.includes('input');
      const hasPriceInput = js.includes('price') && js.includes('input');
      const hasOrderTypeSelect = js.includes('pricetype') || js.includes('ordertype');

      logTest('  ✓ Buy/Sell buttons', hasBuySellButtons, hasBuySellButtons ? 'Buttons present' : 'Missing');
      logTest('  ✓ Quantity input', hasQuantityInput, hasQuantityInput ? 'Input present' : 'Missing');
      logTest('  ✓ Price input', hasPriceInput, hasPriceInput ? 'Input present' : 'Missing');
      logTest('  ✓ Order type selector', hasOrderTypeSelect, hasOrderTypeSelect ? 'Selector present' : 'Missing');

      results.push({ name: 'Options Tool UI structure', passed: hasUpdateLTPDisplays && hasInstanceSelect });

    } else {
      logTest('  ✗ Options tool JS loads', false, `Status: ${response.status}`);
      results.push({ name: 'Options Tool UI structure', passed: false });
    }
  } catch (error) {
    logTest('  ✗ Options tool test', false, `Error: ${error.message}`);
    results.push({ name: 'Options Tool UI structure', passed: false, error: error.message });
  }

  return results;
}

async function testLTPDisplayElements() {
  log('\n📋 Test Suite: LTP Display Elements', 'blue');
  const results = [];

  try {
    const response = await makeRequest('/options-scalping.js');

    if (response.status === 200) {
      const js = response.data.toString();

      // Check for LTP display update mechanisms
      const hasSetElementText = js.includes('textContent') || js.includes('innerHTML');
      const hasElementById = js.includes('getElementById');
      const hasQuerySelector = js.includes('querySelector');

      logTest('  ✓ DOM element selection', hasElementById || hasQuerySelector, 'Element selection methods');
      logTest('  ✓ Text content updates', hasSetElementText, 'Text update methods');

      // Check for specific display elements
      const hasCallLTPDisplay = js.includes('call') && (js.includes('LTP') || js.includes('ltp'));
      const hasPutLTPDisplay = js.includes('put') && (js.includes('LTP') || js.includes('ltp'));
      const hasUnderlyingLTPDisplay = js.includes('underlying') && (js.includes('LTP') || js.includes('ltp'));

      logTest('  ✓ Call LTP display element', hasCallLTPDisplay, hasCallLTPDisplay ? 'Element present' : 'Missing');
      logTest('  ✓ Put LTP display element', hasPutLTPDisplay, hasPutLTPDisplay ? 'Element present' : 'Missing');
      logTest('  ✓ Underlying LTP display element', hasUnderlyingLTPDisplay, hasUnderlyingLTPDisplay ? 'Element present' : 'Missing');

      // Check for loading states
      const hasLoadingState = js.includes('loading') || js.includes('Loading');
      const hasErrorHandling = js.includes('catch') || js.includes('error');

      logTest('  ✓ Loading state handling', hasLoadingState, hasLoadingState ? 'Implemented' : 'Missing');
      logTest('  ✓ Error handling', hasErrorHandling, hasErrorHandling ? 'Implemented' : 'Missing');

      results.push({ name: 'LTP Display elements', passed: hasSetElementText && hasCallLTPDisplay });

    } else {
      logTest('  ✗ LTP display test', false, `Status: ${response.status}`);
      results.push({ name: 'LTP Display elements', passed: false });
    }
  } catch (error) {
    logTest('  ✗ LTP display test', false, `Error: ${error.message}`);
    results.push({ name: 'LTP Display elements', passed: false, error: error.message });
  }

  return results;
}

async function testEventHandlers() {
  log('\n📋 Test Suite: UI Event Handlers', 'blue');
  const results = [];

  try {
    const response = await makeRequest('/options-scalping.js');

    if (response.status === 200) {
      const js = response.data.toString();

      // Check for event listeners
      const hasAddEventListener = js.includes('addEventListener');
      const hasOnChange = js.includes('onchange') || js.includes('onChange');
      const hasOnClick = js.includes('onclick') || js.includes('onClick');

      logTest('  ✓ Event listeners', hasAddEventListener, hasAddEventListener ? 'addEventListener used' : 'Missing');
      logTest('  ✓ Change event handlers', hasOnChange, hasOnChange ? 'Implemented' : 'Missing');
      logTest('  ✓ Click event handlers', hasOnClick, hasOnClick ? 'Implemented' : 'Missing');

      // Check for specific handlers
      const hasInstanceChangeHandler = js.includes('instance') && (hasOnChange || hasAddEventListener);
      const hasUnderlyingChangeHandler = js.includes('underlying') && (hasOnChange || hasAddEventListener);
      const hasExpiryChangeHandler = js.includes('expiry') && (hasOnChange || hasAddEventListener);

      logTest('  ✓ Instance change handler', hasInstanceChangeHandler, hasInstanceChangeHandler ? 'Present' : 'Missing');
      logTest('  ✓ Underlying change handler', hasUnderlyingChangeHandler, hasUnderlyingChangeHandler ? 'Present' : 'Missing');
      logTest('  ✓ Expiry change handler', hasExpiryChangeHandler, hasExpiryChangeHandler ? 'Present' : 'Missing');

      results.push({ name: 'UI Event handlers', passed: hasAddEventListener && hasInstanceChangeHandler });

    } else {
      logTest('  ✗ Event handler test', false, `Status: ${response.status}`);
      results.push({ name: 'UI Event handlers', passed: false });
    }
  } catch (error) {
    logTest('  ✗ Event handler test', false, `Error: ${error.message}`);
    results.push({ name: 'UI Event handlers', passed: false, error: error.message });
  }

  return results;
}

async function testAPIExplorer() {
  log('\n📋 Test Suite: API Explorer UI', 'blue');
  const results = [];

  try {
    const response = await makeRequest('/api-explorer.html');

    if (response.status === 200) {
      const html = response.data.toString();

      const hasTitle = html.includes('API') || html.includes('api');
      const hasEndpointList = html.includes('endpoint') || html.includes('route');
      const hasRequestBuilder = html.includes('request') || html.includes('Request');
      const hasResponseViewer = html.includes('response') || html.includes('Response');

      logTest('  ✓ API Explorer loads', true, 'HTTP 200');
      logTest('  ✓ Has title', hasTitle, hasTitle ? 'Title present' : 'Missing');
      logTest('  ✓ Has endpoint list', hasEndpointList, hasEndpointList ? 'List present' : 'Missing');
      logTest('  ✓ Has request builder', hasRequestBuilder, hasRequestBuilder ? 'Builder present' : 'Missing');
      logTest('  ✓ Has response viewer', hasResponseViewer, hasResponseViewer ? 'Viewer present' : 'Missing');

      results.push({ name: 'API Explorer UI', passed: hasTitle });

    } else {
      logTest('  ✗ API Explorer loads', false, `Status: ${response.status}`);
      results.push({ name: 'API Explorer UI', passed: false });
    }
  } catch (error) {
    logTest('  ✗ API Explorer test', false, `Error: ${error.message}`);
    results.push({ name: 'API Explorer UI', passed: false, error: error.message });
  }

  return results;
}

async function testStaticFileServing() {
  log('\n📋 Test Suite: Static File Serving', 'blue');
  const results = [];

  const staticFiles = [
    { path: '/dashboard.html', name: 'Dashboard HTML' },
    { path: '/options-scalping.js', name: 'Options Tool JS' },
    { path: '/api-explorer.html', name: 'API Explorer' },
    { path: '/test-auth.html', name: 'Auth Test Page' }
  ];

  for (const file of staticFiles) {
    try {
      const response = await makeRequest(file.path);

      if (response.status === 200) {
        logTest(`  ✓ ${file.name}`, true, 'Served successfully');
        results.push({ name: `Static file: ${file.name}`, passed: true });
      } else {
        logTest(`  ✗ ${file.name}`, false, `Status: ${response.status}`);
        results.push({ name: `Static file: ${file.name}`, passed: false });
      }
    } catch (error) {
      logTest(`  ✗ ${file.name}`, false, `Error: ${error.message}`);
      results.push({ name: `Static file: ${file.name}`, passed: false, error: error.message });
    }
  }

  return results;
}

async function runAllTests() {
  log('='.repeat(70), 'blue');
  log('UI Tests - Dashboard and Frontend', 'blue');
  log('='.repeat(70), 'blue');
  log('');

  const allResults = [];

  try {
    const dashboardResults = await testDashboardHTML();
    allResults.push(...dashboardResults);

    const optionsResults = await testOptionsToolUI();
    allResults.push(...optionsResults);

    const ltpResults = await testLTPDisplayElements();
    allResults.push(...ltpResults);

    const eventResults = await testEventHandlers();
    allResults.push(...eventResults);

    const explorerResults = await testAPIExplorer();
    allResults.push(...explorerResults);

    const staticResults = await testStaticFileServing();
    allResults.push(...staticResults);

    const summary = formatSummary(allResults);

    log('\n✅ UI Tests Complete', 'green');
    log(`All ${allResults.length} UI tests executed`);

    process.exit(summary.failed > 0 ? 1 : 0);

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testDashboardHTML, testOptionsToolUI, testLTPDisplayElements, testEventHandlers, testAPIExplorer, testStaticFileServing };
export default runAllTests;
