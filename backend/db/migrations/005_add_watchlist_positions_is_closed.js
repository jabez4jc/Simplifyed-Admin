/**
 * Migration: Add is_closed column to watchlist_positions
 *
 * Adds the is_closed column for position tracking.
 */

export const version = '005';
export const name = 'add_watchlist_positions_is_closed';

export async function up(db) {
  console.log('  📝 Adding is_closed column to watchlist_positions...');

  const columns = await db.all("PRAGMA table_info(watchlist_positions)");
  const hasIsClosedColumn = columns.some(col => col.name === 'is_closed');

  if (!hasIsClosedColumn) {
    await db.run(`ALTER TABLE watchlist_positions ADD COLUMN is_closed BOOLEAN DEFAULT 0`);
    console.log('  ✅ Added is_closed column to watchlist_positions');

    await db.run('CREATE INDEX IF NOT EXISTS idx_watchlist_positions_is_closed ON watchlist_positions(is_closed)');
    console.log('  ✅ Created index for is_closed column');
  } else {
    console.log('  ⏭️  is_closed column already exists, skipping');
  }
}

export async function down(db) {
  console.log('  📝 Rolling back is_closed column...');
  console.log('  ⚠️  Cannot drop columns in SQLite - is_closed remains in watchlist_positions table');
}
