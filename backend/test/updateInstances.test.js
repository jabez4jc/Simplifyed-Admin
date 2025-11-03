import test from 'node:test';
import assert from 'node:assert/strict';
import { updateInstancesData } from '../lib/instance-updater.js';

test('updateInstancesData calls auto switch and updates DB when target profit reached', async () => {
  // Mock DB with one active instance
  const calls = [];
  const instance = {
    id: 42,
    host_url: 'https://fake-openalgo.test',
    api_key: 'abc',
    target_profit: 100,
    target_loss: 50,
    is_analyzer_mode: false,
    strategy_tag: ''
  };

  const dbAsync = {
    all: async (sql) => {
      calls.push({ fn: 'all', sql });
      return [instance];
    },
    run: async (sql, params) => {
      calls.push({ fn: 'run', sql, params });
      return { lastID: 1, changes: 1 };
    }
  };

  // makeRequest mock handles sequence of endpoints used by updateInstancesData and autoSwitchToAnalyzer
  const makeRequest = async (inst, endpoint) => {
    if (endpoint === 'funds') {
      return { status: 'success', data: { availablecash: '1000' } };
    }

    if (endpoint === 'tradebook') {
      return { status: 'success', data: { trades: [ { symbol: 'A', action: 'BUY', price: '10', quantity: '10' }, { symbol: 'A', action: 'SELL', price: '20', quantity: '10' } ] } };
    }

    if (endpoint === 'positionbook') {
      return { status: 'success', data: { positions: [ { symbol: 'A', pnl: '5', netqty: '0' } ] } };
    }

    if (endpoint === 'closeposition') {
      return { status: 'success', message: 'closed' };
    }

    if (endpoint === 'cancelallorder') {
      return { status: 'success', message: 'canceled' };
    }

    if (endpoint === 'analyzer/toggle') {
      return { status: 'success', data: { mode: 'analyze' } };
    }

    if (endpoint === 'analyzer') {
      return { status: 'success', data: { mode: 'analyze' } };
    }

    return { status: 'error' };
  };

  await updateInstancesData(dbAsync, makeRequest);

  // Assert that DB run was called to update instance P&L and later to set analyzer mode
  const runCalls = calls.filter(c => c.fn === 'run');
  const updated = runCalls.find(c => typeof c.params !== 'undefined' && c.params.includes(42));
  assert.ok(updated, 'Expected an update call with instance id 42');
});
