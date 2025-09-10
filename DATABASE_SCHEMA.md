# Simplifyed Admin Database Schema Documentation

## Overview

The Simplifyed Admin Dashboard uses SQLite database for storing instance configurations, user authentication data, comprehensive P&L tracking, and operational logs. The database is designed for high performance with regular polling operations and efficient data retrieval.

## Database File Location

- **Development**: `./database/trading.db`
- **Production**: `./database/trading.db`
- **Sessions**: `./database/sessions.db`

## Schema Version

**Current Version**: 2.0 (includes comprehensive P&L tracking)  
**Last Updated**: September 2025

---

## Table Schemas

### 1. `instances` Table

Primary table for storing OpenAlgo instance configurations and real-time P&L data.

```sql
CREATE TABLE instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  api_key TEXT NOT NULL,
  broker TEXT,
  strategy_tag TEXT DEFAULT 'ALL',
  
  -- Mode and Status
  is_analyzer_mode BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  
  -- Financial Data
  current_balance REAL DEFAULT 0,
  current_pnl REAL DEFAULT 0,           -- Legacy field (kept for backward compatibility)
  
  -- 🆕 NEW: Comprehensive P&L Tracking
  realized_pnl REAL DEFAULT 0,          -- P&L from completed trades (tradebook)
  unrealized_pnl REAL DEFAULT 0,        -- P&L from open positions (positionbook) 
  total_pnl REAL DEFAULT 0,             -- realized_pnl + unrealized_pnl
  
  -- Target Configuration
  target_profit REAL DEFAULT 5000,
  target_loss REAL DEFAULT 2000,
  
  -- System Health
  health_status TEXT DEFAULT 'unknown',
  last_health_check DATETIME,
  last_updated DATETIME,
  
  -- Audit Trail
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER | Primary key, auto-incrementing |
| `name` | TEXT | Human-readable instance name |
| `host` | TEXT | OpenAlgo instance URL (e.g., https://upstox.simplifyed.in) |
| `api_key` | TEXT | Encrypted API key for authentication |
| `broker` | TEXT | Broker name (upstox, flattrade, etc.) |
| `strategy_tag` | TEXT | Strategy identifier for trading operations |
| `is_analyzer_mode` | BOOLEAN | 0 = Live mode, 1 = Analyzer mode |
| `is_active` | BOOLEAN | Instance active status |
| `current_balance` | REAL | Account balance in INR |
| `current_pnl` | REAL | Legacy P&L field (backward compatibility) |
| **`realized_pnl`** | **REAL** | **Profit/Loss from completed trades** |
| **`unrealized_pnl`** | **REAL** | **Profit/Loss from open positions** |
| **`total_pnl`** | **REAL** | **Combined P&L (realized + unrealized)** |
| `target_profit` | REAL | Auto-switch profit threshold |
| `target_loss` | REAL | Auto-switch loss threshold |
| `health_status` | TEXT | Health check status (healthy, degraded, unhealthy) |
| `last_health_check` | DATETIME | Last health check timestamp |
| `last_updated` | DATETIME | Last data update timestamp |
| `created_at` | DATETIME | Instance creation timestamp |

#### Indexes

```sql
CREATE INDEX idx_instances_active ON instances(is_active);
CREATE INDEX idx_instances_broker ON instances(broker);
CREATE INDEX idx_instances_health ON instances(health_status);
CREATE INDEX idx_instances_updated ON instances(last_updated);
```

---

### 2. `users` Table

User authentication and authorization management.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER | Primary key, auto-incrementing |
| `email` | TEXT | User email address (unique) |
| `is_admin` | BOOLEAN | Admin privileges (0 = operator, 1 = admin) |
| `created_at` | DATETIME | User registration timestamp |

#### Indexes

```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_admin ON users(is_admin);
```

---

## Database Migration History

### Migration 1.0 → 2.0 (Comprehensive P&L Enhancement)

**Date**: September 2025  
**Description**: Added comprehensive P&L tracking with separate columns for realized and unrealized P&L.

```sql
-- Migration Script
ALTER TABLE instances ADD COLUMN realized_pnl REAL DEFAULT 0;
ALTER TABLE instances ADD COLUMN unrealized_pnl REAL DEFAULT 0;
ALTER TABLE instances ADD COLUMN total_pnl REAL DEFAULT 0;

-- Update existing data
UPDATE instances SET 
  unrealized_pnl = COALESCE(current_pnl, 0),
  total_pnl = COALESCE(current_pnl, 0),
  realized_pnl = 0;
```

**Migration Notes**:
- Existing `current_pnl` values migrated to `unrealized_pnl`
- `realized_pnl` initialized to 0 (will be calculated from tradebook data)
- `total_pnl` initially set to existing P&L values
- Legacy `current_pnl` field preserved for backward compatibility

---

## P&L Data Flow

### Data Update Process

1. **Polling Frequency**: Every 30 seconds
2. **Data Sources**: 
   - **Tradebook API** → `realized_pnl`
   - **Positionbook API** → `unrealized_pnl`
   - **Calculation** → `total_pnl` = `realized_pnl` + `unrealized_pnl`

### Update Query Pattern

```sql
UPDATE instances 
SET 
  current_balance = ?,
  realized_pnl = ?,
  unrealized_pnl = ?,
  total_pnl = ?,
  current_pnl = ?,           -- Legacy field (for backward compatibility)
  last_updated = CURRENT_TIMESTAMP,
  health_status = 'healthy'
WHERE id = ?;
```

### Query Examples

#### Get All Instances with Comprehensive P&L
```sql
SELECT 
  id,
  name,
  broker,
  is_analyzer_mode,
  current_balance,
  realized_pnl,
  unrealized_pnl,
  total_pnl,
  target_profit,
  target_loss,
  health_status,
  last_updated
FROM instances 
WHERE is_active = 1
ORDER BY last_updated DESC;
```

#### Get Cumulative P&L Across All Active Instances
```sql
SELECT 
  COUNT(*) as total_instances,
  SUM(current_balance) as total_balance,
  SUM(realized_pnl) as total_realized_pnl,
  SUM(unrealized_pnl) as total_unrealized_pnl,
  SUM(total_pnl) as combined_pnl
FROM instances 
WHERE is_active = 1;
```

#### Get Instances Exceeding Profit Targets
```sql
SELECT 
  id, 
  name, 
  total_pnl, 
  target_profit,
  (total_pnl - target_profit) as excess_profit
FROM instances 
WHERE is_active = 1 
  AND total_pnl >= target_profit
  AND is_analyzer_mode = 0;
```

#### Get Top Performers by Realized P&L
```sql
SELECT 
  name,
  broker,
  realized_pnl,
  unrealized_pnl,
  total_pnl,
  ROUND((realized_pnl * 100.0 / NULLIF(current_balance, 0)), 2) as realized_return_pct
FROM instances 
WHERE is_active = 1 
ORDER BY realized_pnl DESC
LIMIT 10;
```

---

## Performance Optimization

### Current Optimizations

1. **Indexes**: Strategic indexes on frequently queried columns
2. **Batch Updates**: Efficient bulk update operations
3. **Connection Pooling**: Reuse database connections
4. **Async Operations**: Non-blocking database operations

### Recommended Optimizations

1. **Write-Ahead Logging (WAL)**:
   ```sql
   PRAGMA journal_mode = WAL;
   PRAGMA synchronous = NORMAL;
   ```

2. **Memory Optimization**:
   ```sql
   PRAGMA cache_size = 10000;
   PRAGMA temp_store = MEMORY;
   ```

3. **Regular Maintenance**:
   ```sql
   PRAGMA optimize;
   VACUUM;
   ANALYZE;
   ```

---

## Backup and Recovery

### Backup Strategy

1. **Automated Backups**: Daily full database backups
2. **Point-in-Time Recovery**: WAL mode enables incremental backups
3. **Export Format**: SQL dumps and binary copies

### Backup Commands

```bash
# Full database backup
sqlite3 database/trading.db ".backup backup_$(date +%Y%m%d_%H%M%S).db"

# SQL dump backup  
sqlite3 database/trading.db ".dump" > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup integrity
sqlite3 backup_20250910_143000.db "PRAGMA integrity_check;"
```

### Recovery Process

```bash
# Restore from backup
cp backup_20250910_143000.db database/trading.db

# Restore from SQL dump
sqlite3 database/trading.db < backup_20250910_143000.sql
```

---

## Security Considerations

### Data Encryption

1. **API Keys**: Encrypted at rest using AES-256
2. **Database File**: Can be encrypted using SQLCipher
3. **Connection Security**: TLS for all database connections

### Access Control

1. **Application Level**: Role-based access via `users.is_admin`
2. **File System**: Restrict database file permissions
3. **Network**: No direct database access from external networks

### Audit Trail

All critical operations are logged with:
- User identification
- Timestamp
- Action performed
- Data changes

---

## Monitoring and Alerting

### Health Checks

1. **Database Connectivity**: Regular connection tests
2. **Table Integrity**: Automated integrity checks
3. **Performance Metrics**: Query execution times
4. **Disk Space**: Database file size monitoring

### Critical Alerts

1. **Database Corruption**: Immediate alert if integrity check fails
2. **Connection Failures**: Alert if database becomes unreachable
3. **Performance Degradation**: Alert if queries exceed thresholds
4. **Disk Space**: Alert when approaching storage limits

---

## Troubleshooting

### Common Issues

#### 1. Database Lock
```bash
# Check for active connections
lsof database/trading.db

# Kill blocking processes if necessary
kill -9 <pid>
```

#### 2. Performance Issues
```sql
-- Check query plans
EXPLAIN QUERY PLAN SELECT * FROM instances WHERE is_active = 1;

-- Analyze table statistics
ANALYZE instances;
```

#### 3. Data Integrity
```sql
-- Check database integrity
PRAGMA integrity_check;

-- Check foreign key constraints
PRAGMA foreign_key_check;
```

### Recovery Procedures

1. **Corruption Recovery**: Restore from latest backup
2. **Performance Issues**: Reindex tables and optimize
3. **Data Loss**: Point-in-time recovery using WAL files

---

**Document Maintained By**: Simplifyed Team  
**Last Updated**: September 2025  
**Version**: 2.0  
**Contact**: support@simplifyed.in