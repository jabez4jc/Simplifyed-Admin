/**
 * Migration: Fix Missing Columns and Tables
 *
 * Adds missing columns to existing tables and creates watchlist_orders table.
 */

export const version = '006';
export const name = 'fix_missing_columns_and_tables';

export async function up(db) {
  console.log('  📝 Fixing missing columns and tables...');

  // Add missing columns to system_alerts
  const alertsColumns = await db.all("PRAGMA table_info(system_alerts)");
  if (!alertsColumns.some(col => col.name === 'details_json')) {
    await db.run(`ALTER TABLE system_alerts ADD COLUMN details_json TEXT DEFAULT '{}'`);
    console.log('  ✅ Added details_json column to system_alerts');
  }
  if (!alertsColumns.some(col => col.name === 'watchlist_id')) {
    await db.run(`ALTER TABLE system_alerts ADD COLUMN watchlist_id INTEGER`);
    console.log('  ✅ Added watchlist_id column to system_alerts');
  }
  if (!alertsColumns.some(col => col.name === 'is_resolved')) {
    await db.run(`ALTER TABLE system_alerts ADD COLUMN is_resolved BOOLEAN DEFAULT 0`);
    console.log('  ✅ Added is_resolved column to system_alerts');
  }

  // Add missing columns to watchlist_positions
  const positionsColumns = await db.all("PRAGMA table_info(watchlist_positions)");
  if (!positionsColumns.some(col => col.name === 'symbol_id')) {
    await db.run(`ALTER TABLE watchlist_positions ADD COLUMN symbol_id INTEGER`);
    console.log('  ✅ Added symbol_id column to watchlist_positions');
  }

  // Create watchlist_orders table
  await db.run(`
    CREATE TABLE IF NOT EXISTS watchlist_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      instance_id INTEGER NOT NULL,
      symbol_id INTEGER,
      exchange TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      product_type TEXT NOT NULL,
      price REAL,
      trigger_price REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      order_id TEXT,
      broker_order_id TEXT,
      message TEXT,
      metadata TEXT,
      placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (watchlist_id) REFERENCES watchlists (id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
    )
  `);
  console.log('  ✅ Created watchlist_orders table');

  // Create indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_orders_status ON watchlist_orders(status)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_orders_watchlist ON watchlist_orders(watchlist_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_orders_instance ON watchlist_orders(instance_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_positions_symbol_id ON watchlist_positions(symbol_id)');
  console.log('  ✅ Created indexes');
}

export async function down(db) {
  console.log('  📝 Rolling back...');
  await db.run('DROP TABLE IF EXISTS watchlist_orders');
  console.log('  ✅ Dropped watchlist_orders table');
  console.log('  ⚠️  Cannot drop columns in SQLite - added columns remain in tables');
}
