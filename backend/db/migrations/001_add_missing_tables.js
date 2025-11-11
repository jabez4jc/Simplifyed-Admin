/**
 * Migration: Add Missing Tables
 *
 * Adds tables that are referenced in the codebase but were never created:
 * - system_alerts: For alert notification tracking
 * - position_limits: For position size limits per symbol
 * - watchlist_positions: For tracking positions related to watchlist symbols
 */

export const version = '001';
export const name = 'add_missing_tables';

export async function up(db) {
  // Create system_alerts table (referenced in alert-service.js)
  await db.run(`
    CREATE TABLE IF NOT EXISTS system_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      is_read BOOLEAN DEFAULT 0,
      is_acknowledged BOOLEAN DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
    )
  `);

  // Create position_limits table (referenced in position-manager.js)
  await db.run(`
    CREATE TABLE IF NOT EXISTS position_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id INTEGER NOT NULL,
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      max_position_size INTEGER NOT NULL,
      max_order_value REAL,
      max_daily_trades INTEGER,
      daily_trade_count INTEGER DEFAULT 0,
      current_position_size INTEGER DEFAULT 0,
      last_reset_date DATE DEFAULT CURRENT_DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
      UNIQUE(instance_id, exchange, symbol)
    )
  `);

  // Create watchlist_positions table (referenced in position-manager.js)
  await db.run(`
    CREATE TABLE IF NOT EXISTS watchlist_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      instance_id INTEGER NOT NULL,
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      product_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      average_price REAL NOT NULL,
      current_price REAL,
      pnl REAL DEFAULT 0,
      pnl_percentage REAL DEFAULT 0,
      side TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists (id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
      UNIQUE(watchlist_id, instance_id, exchange, symbol, product_type)
    )
  `);

  console.log('  ✅ Created system_alerts table');
  console.log('  ✅ Created position_limits table');
  console.log('  ✅ Created watchlist_positions table');
}

export async function down(db) {
  await db.run('DROP TABLE IF EXISTS watchlist_positions');
  await db.run('DROP TABLE IF EXISTS position_limits');
  await db.run('DROP TABLE IF EXISTS system_alerts');

  console.log('  ✅ Dropped watchlist_positions table');
  console.log('  ✅ Dropped position_limits table');
  console.log('  ✅ Dropped system_alerts table');
}
