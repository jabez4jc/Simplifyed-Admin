import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import OrderPlacementService from '../lib/order-placement-service.js';

function createDbAsync(db) {
  return {
    run: (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    })
  };
}

test('placeOrder computes quantity from capital exposure', async () => {
  const sqlite = new sqlite3.Database(':memory:');
  const dbAsync = createDbAsync(sqlite);

  await dbAsync.run(`
    CREATE TABLE instances (
      id INTEGER PRIMARY KEY,
      is_active INTEGER,
      order_placement_enabled INTEGER,
      health_status TEXT
    )
  `);

  await dbAsync.run(`
    CREATE TABLE market_data (
      exchange TEXT,
      symbol TEXT,
      ltp REAL
    )
  `);

  await dbAsync.run(`
    CREATE TABLE symbol_configs (
      watchlist_id INTEGER,
      symbol_id INTEGER,
      qty_type TEXT,
      qty_value REAL
    )
  `);

  await dbAsync.run(`
    CREATE TABLE watchlist_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER,
      watchlist_id INTEGER,
      symbol_id INTEGER,
      position_id INTEGER,
      order_id TEXT,
      orderid TEXT,
      exchange TEXT,
      symbol TEXT,
      action TEXT,
      quantity INTEGER,
      order_type TEXT,
      price REAL,
      product_type TEXT,
      pricetype TEXT,
      status TEXT,
      trigger_price REAL,
      response_json TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbAsync.run('INSERT INTO instances VALUES (?, ?, ?, ?)', [1, 1, 1, 'ok']);
  await dbAsync.run('INSERT INTO market_data VALUES (?, ?, ?)', ['NSE', 'INFY', 500]);
  await dbAsync.run('INSERT INTO symbol_configs VALUES (?, ?, ?, ?)', [1, 1, 'CAPITAL_BASED', 10000]);

  const payloads = [];
  const makeOpenAlgoRequest = async (_instance, endpoint, method, payload) => {
    payloads.push({ endpoint, method, payload });
    return { status: 'success', orderid: 'ORD123' };
  };

  const rateLimiterManager = {
    acquireToken: async () => ({ waitTime: 0 })
  };

  const alertService = {
    createAlert: async () => {}
  };

  const service = new OrderPlacementService(dbAsync, rateLimiterManager, alertService, makeOpenAlgoRequest);

  await service.placeOrder(1, {
    exchange: 'NSE',
    symbol: 'INFY',
    action: 'BUY'
  }, {
    watchlist_id: 1,
    symbol_id: 1,
    order_type: 'ENTRY'
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].payload.quantity, '20');
  assert.equal(payloads[0].payload.position_size, '20');

  const record = await dbAsync.get('SELECT quantity FROM watchlist_orders WHERE order_id = ?', ['ORD123']);
  assert.equal(record.quantity, 20);

  await new Promise((resolve, reject) => sqlite.close(err => (err ? reject(err) : resolve())));
});
