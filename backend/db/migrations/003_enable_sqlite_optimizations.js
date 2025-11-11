/**
 * Migration: Enable SQLite Optimizations
 *
 * Enables SQLite performance and reliability features:
 * - Write-Ahead Logging (WAL) for better concurrency
 * - Foreign key enforcement
 * - Optimized synchronous mode
 * - Increased cache size
 */

export const version = '003';
export const name = 'enable_sqlite_optimizations';

export async function up(db) {
  // Enable Write-Ahead Logging for better concurrency
  await db.run('PRAGMA journal_mode = WAL');
  console.log('  ✅ Enabled WAL mode for better concurrent access');

  // Enable foreign key constraints
  await db.run('PRAGMA foreign_keys = ON');
  console.log('  ✅ Enabled foreign key enforcement');

  // Optimize synchronous mode (still safe but faster)
  await db.run('PRAGMA synchronous = NORMAL');
  console.log('  ✅ Set synchronous mode to NORMAL');

  // Increase cache size to 10MB (default is ~2MB)
  await db.run('PRAGMA cache_size = -10000');
  console.log('  ✅ Increased cache size to 10MB');

  // Set busy timeout to 5 seconds (wait instead of immediate failure)
  await db.run('PRAGMA busy_timeout = 5000');
  console.log('  ✅ Set busy timeout to 5 seconds');

  // Enable auto vacuum to reclaim space
  await db.run('PRAGMA auto_vacuum = INCREMENTAL');
  console.log('  ✅ Enabled incremental auto vacuum');

  // Verify settings
  const journalMode = await db.get('PRAGMA journal_mode');
  const foreignKeys = await db.get('PRAGMA foreign_keys');

  console.log(`  📊 Journal mode: ${journalMode.journal_mode}`);
  console.log(`  📊 Foreign keys: ${foreignKeys.foreign_keys === 1 ? 'ON' : 'OFF'}`);
}

export async function down(db) {
  // Revert to default settings
  await db.run('PRAGMA journal_mode = DELETE');
  await db.run('PRAGMA synchronous = FULL');
  await db.run('PRAGMA cache_size = -2000');

  console.log('  ✅ Reverted to default SQLite settings');
  console.log('  ⚠️  Note: Foreign key enforcement remains ON (cannot be disabled safely)');
}
