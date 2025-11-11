/**
 * Migration: Add symbol_configs table and instance admin fields
 *
 * Adds the symbol_configs table for V2 quantity system and admin designation fields.
 */

export const version = '004';
export const name = 'add_symbol_configs_and_admin_fields';

export async function up(db) {
  console.log('  📝 Adding symbol_configs table and admin fields...');

  // Create symbol_configs table
  await db.run(`
    CREATE TABLE IF NOT EXISTS symbol_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      symbol_id INTEGER NOT NULL,

      -- Quantity Configuration (V2)
      qty_mode TEXT DEFAULT 'fixed',
      qty_type TEXT DEFAULT 'FIXED',
      qty_value REAL DEFAULT 1,
      qty_units TEXT DEFAULT 'units',
      lot_size INTEGER DEFAULT 1,
      min_qty_per_click INTEGER DEFAULT 1,
      max_qty_per_click INTEGER,
      capital_ceiling_per_trade REAL,
      contract_multiplier REAL DEFAULT 1.0,
      rounding TEXT DEFAULT 'floor_to_lot',

      -- Trading Rules
      target_type TEXT DEFAULT 'NONE',
      target_value REAL,
      sl_type TEXT DEFAULT 'NONE',
      sl_value REAL,
      ts_type TEXT DEFAULT 'NONE',
      ts_value REAL,
      trailing_activation_type TEXT DEFAULT 'IMMEDIATE',
      trailing_activation_value REAL,

      -- Order Configuration
      product_type TEXT DEFAULT 'MIS',
      order_type TEXT DEFAULT 'MARKET',
      max_position_size REAL,
      max_instances INTEGER,
      is_enabled BOOLEAN DEFAULT 1,

      -- Options Trading (V2)
      can_trade_equity BOOLEAN DEFAULT 1,
      can_trade_futures BOOLEAN DEFAULT 0,
      can_trade_options BOOLEAN DEFAULT 0,
      options_strike_offset INTEGER,
      options_expiry_mode TEXT DEFAULT 'current',

      -- Audit Trail
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol_id) REFERENCES watchlist_symbols(id) ON DELETE CASCADE,
      UNIQUE(watchlist_id, symbol_id)
    )
  `);
  console.log('  ✅ Created symbol_configs table');

  // Add admin designation fields to instances table
  const instancesColumns = await db.all("PRAGMA table_info(instances)");
  const hasAdminFields = instancesColumns.some(col => col.name === 'is_primary_admin');

  if (!hasAdminFields) {
    await db.run(`ALTER TABLE instances ADD COLUMN is_primary_admin BOOLEAN DEFAULT 0`);
    console.log('  ✅ Added is_primary_admin column to instances');

    await db.run(`ALTER TABLE instances ADD COLUMN is_secondary_admin BOOLEAN DEFAULT 0`);
    console.log('  ✅ Added is_secondary_admin column to instances');

    await db.run(`ALTER TABLE instances ADD COLUMN order_placement_enabled BOOLEAN DEFAULT 1`);
    console.log('  ✅ Added order_placement_enabled column to instances');
  }

  // Create indexes for symbol_configs
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_configs_watchlist ON symbol_configs(watchlist_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_configs_symbol ON symbol_configs(symbol_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_configs_enabled ON symbol_configs(is_enabled)');
  console.log('  ✅ Created indexes for symbol_configs');

  // Create indexes for admin fields
  await db.run('CREATE INDEX IF NOT EXISTS idx_instances_primary_admin ON instances(is_primary_admin)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_instances_secondary_admin ON instances(is_secondary_admin)');
  console.log('  ✅ Created indexes for admin fields');
}

export async function down(db) {
  console.log('  📝 Rolling back symbol_configs and admin fields...');

  // Drop symbol_configs table
  await db.run('DROP TABLE IF EXISTS symbol_configs');
  console.log('  ✅ Dropped symbol_configs table');

  // Note: SQLite doesn't support DROP COLUMN, so we can't cleanly remove the admin fields
  // In production, you would need to recreate the instances table without these columns
  console.log('  ⚠️  Cannot drop columns in SQLite - admin fields remain in instances table');
}
