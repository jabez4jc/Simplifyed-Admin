/**
 * Diagnostic script to test OpenAlgo API connectivity
 * with detailed error reporting
 */

const TEST_INSTANCE = {
  name: 'Flattrade Test Instance',
  host_url: 'https://flattrade.simplifyed.in',
  api_key: '9f96b8911d7f4536d2185510e9105f229db01b578082f4c7eefa03395f72c3ab'
};

async function testEndpoint(endpoint, payload = {}) {
  const url = `${TEST_INSTANCE.host_url}/api/v1/${endpoint}`;
  const body = { ...payload, apikey: TEST_INSTANCE.api_key };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${endpoint}`);
  console.log(`URL: ${url}`);
  console.log(`Payload keys: ${Object.keys(body).filter(k => k !== 'apikey').join(', ')}`);
  console.log('='.repeat(70));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log(`✅ HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

    const data = await response.json();
    console.log(`   Response status: ${data.status}`);

    if (data.status === 'success') {
      console.log(`   ✅ SUCCESS`);
      if (data.data) {
        const dataType = Array.isArray(data.data) ? `array[${data.data.length}]` : typeof data.data;
        console.log(`   Data type: ${dataType}`);
        if (Array.isArray(data.data) && data.data.length > 0) {
          console.log(`   First item keys: ${Object.keys(data.data[0]).join(', ')}`);
        } else if (typeof data.data === 'object' && data.data !== null) {
          console.log(`   Data keys: ${Object.keys(data.data).join(', ')}`);
        }
      }
    } else {
      console.log(`   ⚠️  Status: ${data.status}`);
      console.log(`   Message: ${data.message || 'N/A'}`);
    }

    return { success: true, response, data };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    console.log(`   Error name: ${error.name}`);
    console.log(`   Error code: ${error.code || 'N/A'}`);
    if (error.cause) {
      console.log(`   Cause: ${error.cause.message || error.cause}`);
    }
    return { success: false, error };
  }
}

async function runDiagnostics() {
  console.log('\n' + '='.repeat(70));
  console.log('OpenAlgo API Diagnostic Report');
  console.log('='.repeat(70));
  console.log(`Instance: ${TEST_INSTANCE.name}`);
  console.log(`Host: ${TEST_INSTANCE.host_url}`);
  console.log(`API Key: ${TEST_INSTANCE.api_key.substring(0, 20)}...`);
  console.log('='.repeat(70));

  const results = {
    passed: [],
    failed: [],
    errors: []
  };

  // Test 1: Ping (Health Check)
  const pingResult = await testEndpoint('ping');
  if (pingResult.success && pingResult.data?.status === 'success') {
    results.passed.push('ping');
  } else {
    results.failed.push('ping');
    if (!pingResult.success) results.errors.push({ endpoint: 'ping', error: pingResult.error });
  }

  // Test 2: Funds
  const fundsResult = await testEndpoint('funds');
  if (fundsResult.success && fundsResult.data?.status === 'success') {
    results.passed.push('funds');
  } else {
    results.failed.push('funds');
    if (!fundsResult.success) results.errors.push({ endpoint: 'funds', error: fundsResult.error });
  }

  // Test 3: Search
  const searchResult = await testEndpoint('search', { query: 'RELIANCE', exchange: 'NSE' });
  if (searchResult.success && searchResult.data?.status === 'success') {
    results.passed.push('search');
  } else {
    results.failed.push('search');
    if (!searchResult.success) results.errors.push({ endpoint: 'search', error: searchResult.error });
  }

  // Test 4: Quotes
  const quotesResult = await testEndpoint('quotes', { exchange: 'NSE', symbol: 'RELIANCE-EQ' });
  if (quotesResult.success) {
    results.passed.push('quotes');
  } else {
    results.failed.push('quotes');
    results.errors.push({ endpoint: 'quotes', error: quotesResult.error });
  }

  // Test 5: Positionbook
  const positionResult = await testEndpoint('positionbook');
  if (positionResult.success && positionResult.data?.status === 'success') {
    results.passed.push('positionbook');
  } else {
    results.failed.push('positionbook');
    if (!positionResult.success) results.errors.push({ endpoint: 'positionbook', error: positionResult.error });
  }

  // Test 6: Tradebook
  const tradebookResult = await testEndpoint('tradebook');
  if (tradebookResult.success && tradebookResult.data?.status === 'success') {
    results.passed.push('tradebook');
  } else {
    results.failed.push('tradebook');
    if (!tradebookResult.success) results.errors.push({ endpoint: 'tradebook', error: tradebookResult.error });
  }

  // Test 7: Orderbook
  const orderbookResult = await testEndpoint('orderbook');
  if (orderbookResult.success && orderbookResult.data?.status === 'success') {
    results.passed.push('orderbook');
  } else {
    results.failed.push('orderbook');
    if (!orderbookResult.success) results.errors.push({ endpoint: 'orderbook', error: orderbookResult.error });
  }

  // Test 8: Expiry (Options)
  const expiryResult = await testEndpoint('expiry', { symbol: 'NIFTY', instrumenttype: 'options', exchange: 'NFO' });
  if (expiryResult.success) {
    results.passed.push('expiry');
  } else {
    results.failed.push('expiry');
    if (!expiryResult.success) results.errors.push({ endpoint: 'expiry', error: expiryResult.error });
  }

  // Test 9: Analyzer
  const analyzerResult = await testEndpoint('analyzer');
  if (analyzerResult.success) {
    results.passed.push('analyzer');
  } else {
    results.failed.push('analyzer');
    if (!analyzerResult.success) results.errors.push({ endpoint: 'analyzer', error: analyzerResult.error });
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSTIC SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${results.passed.length} endpoints`);
  if (results.passed.length > 0) {
    results.passed.forEach(ep => console.log(`   - ${ep}`));
  }
  console.log(`\n❌ Failed: ${results.failed.length} endpoints`);
  if (results.failed.length > 0) {
    results.failed.forEach(ep => console.log(`   - ${ep}`));
  }
  console.log(`\n🔍 Errors: ${results.errors.length}`);
  if (results.errors.length > 0) {
    results.errors.forEach(({ endpoint, error }) => {
      console.log(`   - ${endpoint}: ${error.message} (${error.code || error.name})`);
    });
  }
  console.log('='.repeat(70));

  if (results.passed.length > 0) {
    console.log('\n✅ API connectivity is working!');
    console.log(`   ${results.passed.length} out of ${results.passed.length + results.failed.length} endpoints tested successfully.`);
  } else {
    console.log('\n❌ All endpoints failed - possible network/SSL issue or incorrect credentials.');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

runDiagnostics().catch(console.error);
