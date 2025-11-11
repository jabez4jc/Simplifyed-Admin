import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOpenAlgoSymbol } from '../lib/openalgo-search.js';

test('validateOpenAlgoSymbol returns valid when symbol found', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        data: [
          { symbol: 'INFY', exchange: 'NSE' },
          { symbol: 'RELIANCE', exchange: 'NSE' }
        ]
      })
    });

    const result = await validateOpenAlgoSymbol({ symbol: 'INFY', exchange: 'NSE' });
    assert.equal(result.valid, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('validateOpenAlgoSymbol returns invalid when symbol missing', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [] })
    });

    const result = await validateOpenAlgoSymbol({ symbol: 'UNKNOWN', exchange: 'NSE' });
    assert.equal(result.valid, false);
    assert.match(result.reason, /not found/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('validateOpenAlgoSymbol handles fetch failure', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error('network down'); };

    const result = await validateOpenAlgoSymbol({ symbol: 'INFY', exchange: 'NSE' });
    assert.equal(result.valid, false);
    assert.match(result.reason, /network down/i);
  } finally {
    global.fetch = originalFetch;
  }
});
