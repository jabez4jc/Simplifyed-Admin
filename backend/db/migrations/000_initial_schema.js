/**
 * Migration: Initial Schema
 *
 * Creates all base tables for the Simplifyed Trading Dashboard.
 * Extracted from the original server.js initialization code.
 */

export const version = '000';
export const name = 'initial_schema';

export async function up(db) {
  // Create instances table
  await db.run(`
    CREATE TABLE IF NOT EXISTS instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host_url TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL,
      strategy_tag TEXT,
      target_profit REAL DEFAULT 5000,
      target_loss REAL DEFAULT 2000,
      current_pnl REAL DEFAULT 0,
      realized_pnl REAL DEFAULT 0,
      unrealized_pnl REAL DEFAULT 0,
      total_pnl REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      is_analyzer_mode BOOLEAN DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✅ Created instances table');

  // Create users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      is_admin BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✅ Created users table');

  // Create rate_limit_log table
  await db.run(`
    CREATE TABLE IF NOT EXISTS rate_limit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      tokens_available INTEGER NOT NULL,
      wait_time_ms INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances (id)
    )
  `);
  console.log('  ✅ Created rate_limit_log table');

  // Create watchlists table
  await db.run(`
    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✅ Created watchlists table');

  // Create watchlist_symbols table
  await db.run(`
    CREATE TABLE IF NOT EXISTS watchlist_symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      token TEXT,
      lot_size INTEGER DEFAULT 1,
      qty_type TEXT DEFAULT 'FIXED',
      qty_value INTEGER DEFAULT 1,
      qty_mode TEXT DEFAULT 'fixed',
      qty_units TEXT DEFAULT 'units',
      min_qty_per_click INTEGER DEFAULT 1,
      max_qty_per_click INTEGER,
      capital_ceiling_per_trade REAL,
      contract_multiplier REAL DEFAULT 1.0,
      rounding TEXT DEFAULT 'floor_to_lot',
      product_type TEXT DEFAULT 'MIS',
      order_type TEXT DEFAULT 'MARKET',
      target_type TEXT DEFAULT 'NONE',
      target_value REAL,
      sl_type TEXT DEFAULT 'NONE',
      sl_value REAL,
      ts_type TEXT DEFAULT 'NONE',
      ts_value REAL,
      trailing_activation_type TEXT DEFAULT 'IMMEDIATE',
      trailing_activation_value REAL,
      max_position_size INTEGER,
      max_instances INTEGER,
      is_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists (id) ON DELETE CASCADE
    )
  `);
  console.log('  ✅ Created watchlist_symbols table');

  // Create watchlist_instances junction table
  await db.run(`
    CREATE TABLE IF NOT EXISTS watchlist_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      instance_id INTEGER NOT NULL,
      assigned_by TEXT,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists (id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
      UNIQUE(watchlist_id, instance_id)
    )
  `);
  console.log('  ✅ Created watchlist_instances table');

  // Create symbol_search_cache table
  await db.run(`
    CREATE TABLE IF NOT EXISTS symbol_search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_query TEXT NOT NULL,
      symbol TEXT NOT NULL,
      tradingsymbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      exchange_segment TEXT,
      instrument_type TEXT,
      lot_size INTEGER,
      tick_size REAL,
      name TEXT,
      isin TEXT,
      asset_class TEXT DEFAULT 'EQUITY',
      can_trade_equity INTEGER DEFAULT 0,
      can_trade_futures INTEGER DEFAULT 0,
      can_trade_options INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(search_query, symbol, exchange)
    )
  `);
  console.log('  ✅ Created symbol_search_cache table');

  console.log('  ✅ Initial schema created successfully');
}

export async function down(db) {
  // Drop tables in reverse order to respect foreign key constraints
  await db.run('DROP TABLE IF EXISTS symbol_search_cache');
  await db.run('DROP TABLE IF EXISTS watchlist_instances');
  await db.run('DROP TABLE IF EXISTS watchlist_symbols');
  await db.run('DROP TABLE IF EXISTS watchlists');
  await db.run('DROP TABLE IF EXISTS rate_limit_log');
  await db.run('DROP TABLE IF EXISTS users');
  await db.run('DROP TABLE IF EXISTS instances');

  console.log('  ✅ Dropped all initial schema tables');
}
