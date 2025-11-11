/**
 * Migration: Add Database Indexes
 *
 * Adds indexes for frequently queried columns to improve performance:
 * - Instance queries by active status
 * - Watchlist symbol lookups
 * - Position and limit queries
 * - Alert queries by read status
 */

export const version = '002';
export const name = 'add_database_indexes';

export async function up(db) {
  // Instances indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_instances_active ON instances(is_active)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_instances_analyzer_mode ON instances(is_analyzer_mode)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_instances_last_updated ON instances(last_updated)');

  // Watchlist indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlists_active ON watchlists(is_active)');

  // Watchlist symbols indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_watchlist_id ON watchlist_symbols(watchlist_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_symbol ON watchlist_symbols(exchange, symbol)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_enabled ON watchlist_symbols(is_enabled)');

  // Watchlist instances junction table indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_instances_watchlist ON watchlist_instances(watchlist_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_instances_instance ON watchlist_instances(instance_id)');

  // Symbol search cache indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_search_query ON symbol_search_cache(search_query)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_search_symbol ON symbol_search_cache(symbol, exchange)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_symbol_search_asset_class ON symbol_search_cache(asset_class)');

  // Rate limit log indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_rate_limit_instance ON rate_limit_log(instance_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_rate_limit_created ON rate_limit_log(created_at)');

  // System alerts indexes (from migration 001)
  await db.run('CREATE INDEX IF NOT EXISTS idx_system_alerts_instance ON system_alerts(instance_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_system_alerts_read ON system_alerts(is_read)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(alert_type)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON system_alerts(created_at)');

  // Position limits indexes (from migration 001)
  await db.run('CREATE INDEX IF NOT EXISTS idx_position_limits_instance ON position_limits(instance_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_position_limits_symbol ON position_limits(exchange, symbol)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_position_limits_active ON position_limits(is_active)');

  // Watchlist positions indexes (from migration 001)
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_positions_watchlist ON watchlist_positions(watchlist_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_positions_instance ON watchlist_positions(instance_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_positions_symbol ON watchlist_positions(exchange, symbol)');

  // Users index
  await db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_users_admin ON users(is_admin)');

  console.log('  ✅ Created 25 performance indexes');
}

export async function down(db) {
  // Drop all indexes in reverse order
  const indexes = [
    'idx_users_admin',
    'idx_users_email',
    'idx_watchlist_positions_symbol',
    'idx_watchlist_positions_instance',
    'idx_watchlist_positions_watchlist',
    'idx_position_limits_active',
    'idx_position_limits_symbol',
    'idx_position_limits_instance',
    'idx_system_alerts_created',
    'idx_system_alerts_type',
    'idx_system_alerts_read',
    'idx_system_alerts_instance',
    'idx_rate_limit_created',
    'idx_rate_limit_instance',
    'idx_symbol_search_asset_class',
    'idx_symbol_search_symbol',
    'idx_symbol_search_query',
    'idx_watchlist_instances_instance',
    'idx_watchlist_instances_watchlist',
    'idx_watchlist_symbols_enabled',
    'idx_watchlist_symbols_symbol',
    'idx_watchlist_symbols_watchlist_id',
    'idx_watchlists_active',
    'idx_instances_last_updated',
    'idx_instances_analyzer_mode',
    'idx_instances_active'
  ];

  for (const index of indexes) {
    await db.run(`DROP INDEX IF EXISTS ${index}`);
  }

  console.log('  ✅ Dropped 25 indexes');
}
