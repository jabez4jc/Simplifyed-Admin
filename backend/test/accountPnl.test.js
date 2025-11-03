import test from 'node:test';
import assert from 'node:assert/strict';
import getAccountPnL from '../lib/account-pnl.js';

test('getAccountPnL combines realized and unrealized using mocked requests', async () => {
  const instance = { id: 1, host_url: 'https://example.com', api_key: 'key' };

  // Mock makeRequest function that returns deterministic data
  const makeRequest = async (inst, endpoint) => {
    if (endpoint === 'tradebook') {
      return {
        status: 'success',
        data: {
          trades: [
            { symbol: 'A', action: 'BUY', price: '100', quantity: '10' },
            { symbol: 'A', action: 'SELL', price: '110', quantity: '10' }
          ]
        }
      };
    }

    if (endpoint === 'positionbook') {
      return {
        status: 'success',
        data: {
          positions: [ { symbol: 'A', pnl: '5' }, { symbol: 'B', pnl: '7' } ]
        }
      };
    }

    return { status: 'error' };
  };

  const result = await getAccountPnL(instance, makeRequest);
  assert.equal(result.accountTotals.realized_pnl, 100); // (110-100)*10
  assert.equal(result.accountTotals.unrealized_pnl, 12); // 5 + 7
  assert.equal(result.accountTotals.total_pnl, 112);
});
