/**
 * Database Migration System
 *
 * Manages schema changes with version tracking and rollback capability.
 * Run with: node db/migrate.js [up|down|status]
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'database', 'simplifyed.db');
const migrationsDir = join(__dirname, 'migrations');

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

async function initializeMigrationTable(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Migration tracking table initialized');
}

async function getAppliedMigrations(db) {
  const rows = await db.all('SELECT version FROM schema_migrations ORDER BY version ASC');
  return rows.map(row => row.version);
}

async function getMigrationFiles() {
  if (!existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found:', migrationsDir);
    return [];
  }

  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort();

  return files;
}

async function runMigrationUp(db, migration) {
  console.log(`⬆️  Running migration: ${migration.name}`);

  try {
    await migration.up(db);

    await db.run(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name]
    );

    console.log(`✅ Migration ${migration.version} applied successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Migration ${migration.version} failed:`, error.message);
    throw error;
  }
}

async function runMigrationDown(db, migration) {
  console.log(`⬇️  Rolling back migration: ${migration.name}`);

  try {
    await migration.down(db);

    await db.run(
      'DELETE FROM schema_migrations WHERE version = ?',
      [migration.version]
    );

    console.log(`✅ Migration ${migration.version} rolled back successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Rollback ${migration.version} failed:`, error.message);
    throw error;
  }
}

async function migrateUp(db) {
  const appliedMigrations = await getAppliedMigrations(db);
  const migrationFiles = await getMigrationFiles();

  if (migrationFiles.length === 0) {
    console.log('ℹ️  No migrations found');
    return;
  }

  let appliedCount = 0;

  for (const file of migrationFiles) {
    const migrationPath = join(migrationsDir, file);
    const migration = await import(`file://${migrationPath}`);

    if (appliedMigrations.includes(migration.version)) {
      console.log(`⏭️  Skipping already applied: ${migration.name}`);
      continue;
    }

    await runMigrationUp(db, migration);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log('✅ Database is up to date');
  } else {
    console.log(`✅ Applied ${appliedCount} migration(s)`);
  }
}

async function migrateDown(db) {
  const appliedMigrations = await getAppliedMigrations(db);

  if (appliedMigrations.length === 0) {
    console.log('ℹ️  No migrations to roll back');
    return;
  }

  const lastVersion = appliedMigrations[appliedMigrations.length - 1];
  const migrationFiles = await getMigrationFiles();

  const file = migrationFiles.find(f => f.startsWith(lastVersion));
  if (!file) {
    console.error(`❌ Migration file not found for version: ${lastVersion}`);
    return;
  }

  const migrationPath = join(migrationsDir, file);
  const migration = await import(`file://${migrationPath}`);

  await runMigrationDown(db, migration);
  console.log('✅ Rolled back 1 migration');
}

async function showStatus(db) {
  const appliedMigrations = await getAppliedMigrations(db);
  const migrationFiles = await getMigrationFiles();

  console.log('\n📊 Migration Status\n');
  console.log('Applied migrations:');

  if (appliedMigrations.length === 0) {
    console.log('  (none)');
  } else {
    for (const version of appliedMigrations) {
      const file = migrationFiles.find(f => f.startsWith(version));
      const migration = file ? await import(`file://${join(migrationsDir, file)}`) : null;
      console.log(`  ✅ ${version} - ${migration?.name || 'unknown'}`);
    }
  }

  console.log('\nPending migrations:');
  const pendingFiles = migrationFiles.filter(f => {
    const version = f.split('_')[0];
    return !appliedMigrations.includes(version);
  });

  if (pendingFiles.length === 0) {
    console.log('  (none)');
  } else {
    for (const file of pendingFiles) {
      const migration = await import(`file://${join(migrationsDir, file)}`);
      console.log(`  ⏳ ${migration.version} - ${migration.name}`);
    }
  }

  console.log('');
}

async function main() {
  const command = process.argv[2] || 'status';

  if (!['up', 'down', 'status'].includes(command)) {
    console.error('Usage: node db/migrate.js [up|down|status]');
    process.exit(1);
  }

  const db = new Database(dbPath);

  try {
    await initializeMigrationTable(db);

    switch (command) {
      case 'up':
        await migrateUp(db);
        break;
      case 'down':
        await migrateDown(db);
        break;
      case 'status':
        await showStatus(db);
        break;
    }
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
