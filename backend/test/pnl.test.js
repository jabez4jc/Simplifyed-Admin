import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRealizedPnL, calculateUnrealizedPnL } from '../lib/pnl.js';

test('calculateRealizedPnL computes P&L for simple buy/sell', () => {
  const trades = [
    { symbol: 'ABC', action: 'BUY', price: '100', quantity: '10' },
    { symbol: 'ABC', action: 'SELL', price: '110', quantity: '5' },
    { symbol: 'ABC', action: 'SELL', price: '120', quantity: '5' }
  ];

  const result = calculateRealizedPnL(trades);

  // average buy = 100, average sell = (110*5 + 120*5)/10 = 115, closedQty = min(10,10)=10
  // P&L = (115 - 100) * 10 = 150
  assert.equal(typeof result, 'object');
  assert.equal(result.ABC, 150);
});

test('calculateRealizedPnL handles partial closes and multiple symbols', () => {
  const trades = [
    { symbol: 'X', action: 'BUY', price: '50', quantity: '10' },
    { symbol: 'X', action: 'SELL', price: '60', quantity: '4' },
    { symbol: 'Y', action: 'SELL', price: '200', quantity: '2' },
    { symbol: 'Y', action: 'BUY', price: '150', quantity: '2' }
  ];

  const result = calculateRealizedPnL(trades);

  // X: avgBuy=50, avgSell=60, closedQty=4 => (60-50)*4 = 40
  // Y: (200-150)*2 = 100
  assert.equal(result.X, 40);
  assert.equal(result.Y, 100);
});

test('calculateUnrealizedPnL maps position P&L correctly', () => {
  const positions = [
    { symbol: 'ABC', pnl: '12.5' },
    { symbol: 'XYZ', pnl: '-3' }
  ];

  const result = calculateUnrealizedPnL(positions);
  assert.equal(result.ABC, 12.5);
  assert.equal(result.XYZ, -3);
});
