import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import MarketDataProcessor from '../lib/market-data-processor.js';

function createDbAsync(db) {
  return {
    run: (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    })
  };
}

test('MarketDataProcessor upserts using schema-compliant columns', async (t) => {
  const sqlite = new sqlite3.Database(':memory:');
  const dbAsync = createDbAsync(sqlite);

  await dbAsync.run(`
    CREATE TABLE market_data (
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      token TEXT,
      ltp REAL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      bid_price REAL,
      bid_qty INTEGER,
      ask_price REAL,
      ask_qty INTEGER,
      last_updated TEXT,
      data_source TEXT,
      UNIQUE(exchange, symbol)
    )
  `);

  const cache = new Map();
  cache.set('NSE:INFY', {
    exchange: 'NSE',
    symbol: 'INFY',
    token: '12345',
    ltp: '1560.5',
    open: '1550',
    high: '1570.25',
    low: '1548.1',
    volume: '1000',
    bid: { price: '1559.9', quantity: '25' },
    ask: { price: '1560.6', quantity: '40' }
  });

  const processor = new MarketDataProcessor(dbAsync, { marketDataCache: cache });
  await processor.processBatch();

  const row = await dbAsync.get('SELECT * FROM market_data WHERE exchange = ? AND symbol = ?', ['NSE', 'INFY']);
  assert.equal(row.ltp, 1560.5);
  assert.equal(row.bid_price, 1559.9);
  assert.equal(row.bid_qty, 25);
  assert.equal(row.ask_price, 1560.6);
  assert.equal(row.ask_qty, 40);
  assert.equal(row.data_source, 'WEBSOCKET');
  assert.ok(row.last_updated, 'last_updated should be populated');

  const firstUpdated = row.last_updated;

  cache.set('NSE:INFY', {
    exchange: 'NSE',
    symbol: 'INFY',
    token: '54321',
    ltp: 1575.2,
    open: 1555,
    high: 1580,
    low: 1550,
    volume: 1500,
    bid_price: 1574.8,
    bid_qty: 30,
    ask_price: 1575.6,
    ask_qty: 35
  });

  await processor.processBatch();

  const updatedRow = await dbAsync.get('SELECT * FROM market_data WHERE exchange = ? AND symbol = ?', ['NSE', 'INFY']);
  assert.equal(updatedRow.token, '54321');
  assert.equal(updatedRow.bid_price, 1574.8);
  assert.equal(updatedRow.bid_qty, 30);
  assert.notStrictEqual(updatedRow.last_updated, firstUpdated);

  await new Promise((resolve, reject) => {
    sqlite.close((err) => (err ? reject(err) : resolve()));
  });
});
