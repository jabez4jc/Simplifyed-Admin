/**
 * Test Database Setup
 *
 * Creates and seeds a separate test database to prevent
 * tests from interfering with production data.
 *
 * Usage: node test-db-setup.js
 */

import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testDbPath = join(__dirname, 'database', 'simplifyed.test.db');
const testDbDir = join(__dirname, 'database');

// Ensure test database directory exists
if (!existsSync(testDbDir)) {
  mkdirSync(testDbDir, { recursive: true });
}

// Promise wrapper for database operations
class Database {
  constructor(path) {
    this.db = new sqlite3.Database(path);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function setupTestDatabase() {
  console.log('🧪 Setting up test database...');

  const db = new Database(testDbPath);

  try {
    // Run migrations by importing the migration runner
    console.log('   Running migrations...');

    // Import and run each migration
    const migrations = [
      await import('./db/migrations/000_initial_schema.js'),
      await import('./db/migrations/001_add_missing_tables.js'),
      await import('./db/migrations/002_add_database_indexes.js'),
      await import('./db/migrations/003_enable_sqlite_optimizations.js')
    ];

    for (const migration of migrations) {
      console.log(`   ⬆️  Running: ${migration.name}`);
      await migration.up(db);
    }

    // Seed test data
    console.log('   Seeding test data...');

    // Create test user
    await db.run(
      'INSERT INTO users (email, is_admin) VALUES (?, ?)',
      ['test@simplifyed.in', 1]
    );
    console.log('   ✅ Created test admin user');

    // Create test instance
    const instanceResult = await db.run(`
      INSERT INTO instances (
        name, host_url, api_key, strategy_tag,
        target_profit, target_loss,
        is_active, is_analyzer_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'Test Instance',
      'http://localhost:5000',
      'test_api_key_12345',
      'test_strategy',
      10000,
      5000,
      1,
      0
    ]);
    console.log('   ✅ Created test instance');

    // Create test watchlist
    const watchlistResult = await db.run(`
      INSERT INTO watchlists (name, description, is_active)
      VALUES (?, ?, ?)
    `, ['Test Watchlist', 'Test watchlist for automated tests', 1]);
    console.log('   ✅ Created test watchlist');

    // Create test watchlist symbol
    await db.run(`
      INSERT INTO watchlist_symbols (
        watchlist_id, exchange, symbol, token,
        qty_type, qty_value, product_type, order_type,
        is_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      watchlistResult.lastID,
      'NSE',
      'SBIN-EQ',
      '3045',
      'FIXED',
      1,
      'MIS',
      'MARKET',
      1
    ]);
    console.log('   ✅ Created test watchlist symbol');

    // Link watchlist to instance
    await db.run(`
      INSERT INTO watchlist_instances (watchlist_id, instance_id, assigned_by)
      VALUES (?, ?, ?)
    `, [watchlistResult.lastID, instanceResult.lastID, 'test@simplifyed.in']);
    console.log('   ✅ Linked watchlist to instance');

    // Verify setup
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log(`   ✅ Created ${tables.length} tables`);

    console.log('✅ Test database setup complete');
    console.log(`   Location: ${testDbPath}`);
    console.log('');
    console.log('To use test database in tests, set:');
    console.log('   process.env.DB_PATH = "database/simplifyed.test.db"');

  } catch (error) {
    console.error('❌ Test database setup failed:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run setup
setupTestDatabase().catch(err => {
  console.error(err);
  process.exit(1);
});
