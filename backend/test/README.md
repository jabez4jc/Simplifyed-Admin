# Simplifyed Admin Test Suite

This directory contains comprehensive tests for the Simplifyed Admin trading management system.

## Test Files

### OpenAlgo API Tests

1. **`openalgo-api-endpoints.test.js`**
   - Comprehensive test suite for all 16 OpenAlgo API endpoints
   - Covers: health, search, market data, positions, orders, options, analyzer mode
   - Uses Node.js built-in test runner
   - Safe mode: No actual orders placed

2. **`openalgo-api-diagnostic.js`**
   - Diagnostic tool for troubleshooting API connectivity
   - Provides detailed error reporting
   - Tests basic connectivity to OpenAlgo instance

3. **`OPENALGO_API_TEST_REPORT.md`**
   - Complete documentation of all OpenAlgo endpoints
   - Request/response formats
   - Implementation details
   - Best practices and troubleshooting

### Business Logic Tests

4. **`pnl.test.js`**
   - Tests P&L calculation logic (realized/unrealized)
   - Validates trade grouping and position tracking

5. **`accountPnl.test.js`**
   - Tests account-level P&L aggregation
   - Validates integration with OpenAlgo APIs

6. **`orderPlacementCapital.test.js`**
   - Tests capital-based order quantity calculation
   - Validates position sizing logic

7. **`symbolValidation.test.js`**
   - Tests symbol search and validation
   - Validates symbol classification (equity/futures/options)

8. **`marketDataProcessor.test.js`**
   - Tests market data normalization
   - Validates WebSocket data processing

9. **`updateInstances.test.js`**
   - Tests instance health checks
   - Validates auto-switch logic

## Running Tests

### Prerequisites

```bash
cd backend
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
# P&L tests
npm test -- test/pnl.test.js

# OpenAlgo API tests
node test/openalgo-api-endpoints.test.js

# Diagnostic tool
node test/openalgo-api-diagnostic.js
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## OpenAlgo API Testing

### Quick Start

1. **Edit test credentials** in `openalgo-api-endpoints.test.js`:
   ```javascript
   const TEST_INSTANCE = {
     host_url: 'https://your-openalgo-instance.com',
     api_key: 'your-api-key-here'
   };
   ```

2. **Run tests:**
   ```bash
   node test/openalgo-api-endpoints.test.js
   ```

3. **Check results:**
   - ✅ Green: Endpoint working
   - ❌ Red: Endpoint failed (check error message)
   - ⚠️  Yellow: Optional endpoint not available

### Diagnostic Mode

If tests are failing, use the diagnostic tool:

```bash
node test/openalgo-api-diagnostic.js
```

This provides:
- Detailed error messages
- HTTP status codes
- Response content previews
- Network connectivity info

## Test Configuration

### Environment Variables

```bash
# OpenAlgo settings
OPENALGO_SEARCH_TIMEOUT_MS=5000
OPENALGO_SKIP_CAPITAL_SIZING=false

# Order settings
ORDER_RETRY_MAX_ATTEMPTS=3
ORDER_RETRY_BASE_DELAY_MS=1000
ORDER_STATUS_POLLING_INTERVAL_MS=5000
```

### Safety Settings

Tests are designed to be **safe for production**:

- ✅ No real orders placed
- ✅ Read-only API calls
- ✅ Destructive operations skipped
- ✅ Invalid data for validation tests

## Test Categories

### 1. Core Health & Account
- Ping health check
- Funds retrieval

### 2. Symbol Search & Validation
- Symbol search
- Symbol classification

### 3. Market Data
- Quote/LTP data
- Market depth (optional)

### 4. Position & Trade Data
- Position book
- Trade book
- Open positions

### 5. Order Management
- Order book
- Place order (validation only)
- Cancel order (validation only)

### 6. Options Trading
- Expiry dates
- Option symbol generation

### 7. Analyzer Mode
- Status check
- Toggle mode (dry run)
- Close positions (dry run)

## Troubleshooting

### "fetch failed" Error

**Cause:** Network connectivity or DNS resolution issue

**Solutions:**
1. Check internet connection
2. Verify OpenAlgo instance URL is accessible
3. Check firewall settings
4. Try diagnostic tool for detailed error

### "Invalid API key" Error

**Cause:** Incorrect or expired API key

**Solutions:**
1. Verify API key is correct
2. Check API key permissions
3. Regenerate API key if needed

### "Symbol not found" Error

**Cause:** Invalid symbol format

**Solutions:**
1. Use correct symbol format for broker (e.g., "RELIANCE-EQ" vs "RELIANCE")
2. Use `/search` endpoint to find correct symbol
3. Check exchange parameter

### "Order rejected" Error

**Cause:** Order parameters invalid or market closed

**Solutions:**
1. Check market hours
2. Verify sufficient funds
3. Validate order parameters (price, quantity, product type)

### DNS Resolution Errors (Sandbox)

**Cause:** Containerized/sandbox environments may block DNS

**Solutions:**
1. Run tests in production environment
2. Use VPN or different network
3. Check container DNS settings

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Run Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd backend && npm install
      - run: cd backend && npm test
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

cd backend
npm test

if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

## Writing New Tests

### Test Template

```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('My Feature', () => {
  test('should do something', async () => {
    const result = await myFunction();
    assert.strictEqual(result, expectedValue);
  });

  test('should handle errors', async () => {
    await assert.rejects(
      async () => await myFunction(invalidInput),
      /Expected error message/
    );
  });
});
```

### Best Practices

1. **Use descriptive names:** Test names should explain what's being tested
2. **Test one thing:** Each test should verify a single behavior
3. **Use arrange-act-assert:** Set up, execute, verify
4. **Handle async:** Use `async/await` for promises
5. **Clean up:** Close connections, clear timers
6. **Mock external APIs:** Use dependency injection for testability

## Contributing

When adding new features:

1. ✅ Write tests first (TDD)
2. ✅ Ensure all tests pass
3. ✅ Update documentation
4. ✅ Add test cases for edge cases
5. ✅ Check code coverage

## Resources

- [Node.js Test Runner Docs](https://nodejs.org/api/test.html)
- [OpenAlgo API Documentation](https://docs.openalgo.in/)
- [Simplifyed Admin Docs](/docs/CLAUDE.md)

## Support

For issues or questions:
- Check the test report: `OPENALGO_API_TEST_REPORT.md`
- Review logs in `/backend/logs/`
- Open an issue on GitHub

---

**Last Updated:** November 12, 2025
