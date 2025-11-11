# Watchlist API Quick Reference

## Authentication Required
All endpoints require Google OAuth authentication. Login at: `http://localhost:3000/auth/google`

## Base URL
```
http://localhost:3000/api
```

---

## 📋 Watchlist Management

### List All Watchlists
```bash
GET /watchlists

# Example
curl http://localhost:3000/api/watchlists

# Response
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "Nifty 50 Breakout",
      "description": "Nifty 50 stocks with breakout strategy",
      "is_active": 1,
      "created_by": "admin@example.com",
      "created_at": "2025-01-01T00:00:00Z",
      "symbol_count": 15,
      "instance_count": 3
    }
  ]
}
```

### Get Single Watchlist
```bash
GET /watchlists/:id

# Example
curl http://localhost:3000/api/watchlists/1

# Response includes symbols and assigned instances
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "Nifty 50 Breakout",
    "symbols": [...],
    "instances": [...]
  }
}
```

### Create Watchlist (Admin Only)
```bash
POST /watchlists
Content-Type: application/json

# Example
curl -X POST http://localhost:3000/api/watchlists \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Watchlist",
    "description": "Description here",
    "is_active": true
  }'

# Response
{
  "status": "success",
  "message": "Watchlist created successfully",
  "data": { ... }
}
```

### Update Watchlist (Admin Only)
```bash
PUT /watchlists/:id
Content-Type: application/json

# Example
curl -X PUT http://localhost:3000/api/watchlists/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "is_active": false
  }'
```

### Delete Watchlist (Admin Only)
```bash
DELETE /watchlists/:id

# Example
curl -X DELETE http://localhost:3000/api/watchlists/1
```

### Clone Watchlist (Admin Only)
```bash
POST /watchlists/:id/clone
Content-Type: application/json

# Example
curl -X POST http://localhost:3000/api/watchlists/1/clone \
  -H "Content-Type: application/json" \
  -d '{"name": "Cloned Watchlist"}'
```

---

## 📊 Symbol Management

### List Symbols in Watchlist
```bash
GET /watchlists/:watchlistId/symbols

# Example
curl http://localhost:3000/api/watchlists/1/symbols

# Response
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "token": "2885",
      "qty_type": "FIXED",
      "qty_value": 10,
      "target_type": "PERCENTAGE",
      "target_value": 2.0,
      "sl_type": "PERCENTAGE",
      "sl_value": 1.0,
      "ltp": 2450.50,
      "open": 2440.00,
      "high": 2455.00
    }
  ]
}
```

### Add Symbol to Watchlist (Admin Only)
```bash
POST /watchlists/:watchlistId/symbols
Content-Type: application/json

# Example
curl -X POST http://localhost:3000/api/watchlists/1/symbols \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "NSE",
    "symbol": "RELIANCE",
    "token": "2885"
  }'
```

### Remove Symbol from Watchlist (Admin Only)
```bash
DELETE /watchlists/:watchlistId/symbols/:symbolId

# Example
curl -X DELETE http://localhost:3000/api/watchlists/1/symbols/5
```

### Update Symbol Configuration (Admin Only)
```bash
PUT /watchlists/:watchlistId/symbols/:symbolId/config
Content-Type: application/json

# Example - Set quantity and exit rules
curl -X PUT http://localhost:3000/api/watchlists/1/symbols/5/config \
  -H "Content-Type: application/json" \
  -d '{
    "qty_type": "FIXED",
    "qty_value": 10,
    "target_type": "PERCENTAGE",
    "target_value": 2.0,
    "sl_type": "PERCENTAGE",
    "sl_value": 1.0,
    "ts_type": "PERCENTAGE",
    "ts_value": 0.5,
    "product_type": "MIS",
    "order_type": "MARKET",
    "max_position_size": 50,
    "max_instances": 5,
    "is_enabled": true
  }'

# Field Options:
# qty_type: "FIXED" or "CAPITAL_BASED"
# target_type: "POINTS", "PERCENTAGE", or null
# sl_type: "POINTS", "PERCENTAGE", or null
# ts_type: "POINTS", "PERCENTAGE", or null
# product_type: "MIS", "CNC", "NRML"
# order_type: "MARKET", "LIMIT"
```

### Reorder Symbols (Admin Only)
```bash
PUT /watchlists/:watchlistId/symbols/reorder
Content-Type: application/json

# Example
curl -X PUT http://localhost:3000/api/watchlists/1/symbols/reorder \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_ids": [3, 1, 5, 2, 4]
  }'
```

---

## ⚙️ Instance Configuration

### Set Instance as Primary/Secondary Admin (Admin Only)
```bash
PUT /instances/:id/admin-role
Content-Type: application/json

# Example - Set as Primary Admin
curl -X PUT http://localhost:3000/api/instances/1/admin-role \
  -H "Content-Type: application/json" \
  -d '{
    "is_primary_admin": true,
    "is_secondary_admin": false
  }'

# Example - Set as Secondary Admin
curl -X PUT http://localhost:3000/api/instances/2/admin-role \
  -H "Content-Type: application/json" \
  -d '{
    "is_primary_admin": false,
    "is_secondary_admin": true
  }'

# Example - Remove admin role
curl -X PUT http://localhost:3000/api/instances/1/admin-role \
  -H "Content-Type: application/json" \
  -d '{
    "is_primary_admin": false,
    "is_secondary_admin": false
  }'
```

### Get Admin Instance Status
```bash
GET /admin-instances/status

# Example
curl http://localhost:3000/api/admin-instances/status

# Response
{
  "status": "success",
  "data": {
    "primary": {
      "id": 1,
      "name": "Primary Admin",
      "websocket_status": "connected",
      "ws_status": "CONNECTED",
      "last_message_at": "2025-01-01T10:30:00Z"
    },
    "secondary": {
      "id": 2,
      "name": "Secondary Admin",
      "websocket_status": "disconnected",
      "ws_status": null
    }
  }
}
```

### Assign Instances to Watchlist (Admin Only)
```bash
POST /watchlists/:watchlistId/instances
Content-Type: application/json

# Example
curl -X POST http://localhost:3000/api/watchlists/1/instances \
  -H "Content-Type: application/json" \
  -d '{
    "instance_ids": [1, 2, 3, 4, 5]
  }'

# Response
{
  "status": "success",
  "message": "5 instance(s) assigned to watchlist",
  "data": [...]
}
```

### Remove Instance from Watchlist (Admin Only)
```bash
DELETE /watchlists/:watchlistId/instances/:instanceId

# Example
curl -X DELETE http://localhost:3000/api/watchlists/1/instances/3
```

### Enable/Disable Order Placement for Instance (Admin Only)
```bash
PUT /instances/:id/order-placement
Content-Type: application/json

# Example - Enable
curl -X PUT http://localhost:3000/api/instances/1/order-placement \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Example - Disable
curl -X PUT http://localhost:3000/api/instances/1/order-placement \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

---

## 📝 Common Workflows

### Workflow 1: Create a New Watchlist with Symbols

```bash
# 1. Create watchlist
curl -X POST http://localhost:3000/api/watchlists \
  -H "Content-Type: application/json" \
  -d '{"name": "Intraday Momentum", "description": "High momentum stocks"}'

# Response: {"status": "success", "data": {"id": 1, ...}}

# 2. Add symbols
curl -X POST http://localhost:3000/api/watchlists/1/symbols \
  -H "Content-Type: application/json" \
  -d '{"exchange": "NSE", "symbol": "RELIANCE", "token": "2885"}'

curl -X POST http://localhost:3000/api/watchlists/1/symbols \
  -H "Content-Type: application/json" \
  -d '{"exchange": "NSE", "symbol": "TCS", "token": "11536"}'

# 3. Configure first symbol
curl -X PUT http://localhost:3000/api/watchlists/1/symbols/1/config \
  -H "Content-Type: application/json" \
  -d '{
    "qty_type": "FIXED",
    "qty_value": 10,
    "target_type": "PERCENTAGE",
    "target_value": 2.0,
    "sl_type": "PERCENTAGE",
    "sl_value": 1.0
  }'

# 4. Assign instances
curl -X POST http://localhost:3000/api/watchlists/1/instances \
  -H "Content-Type: application/json" \
  -d '{"instance_ids": [1, 2, 3]}'
```

### Workflow 2: Set Up Admin Instances for WebSocket

```bash
# 1. Set Primary Admin (for WebSocket streaming)
curl -X PUT http://localhost:3000/api/instances/1/admin-role \
  -H "Content-Type: application/json" \
  -d '{"is_primary_admin": true, "is_secondary_admin": false}'

# 2. Set Secondary Admin (for failover)
curl -X PUT http://localhost:3000/api/instances/2/admin-role \
  -H "Content-Type: application/json" \
  -d '{"is_primary_admin": false, "is_secondary_admin": true}'

# 3. Check status
curl http://localhost:3000/api/admin-instances/status
```

### Workflow 3: Clone and Modify Existing Watchlist

```bash
# 1. Clone watchlist
curl -X POST http://localhost:3000/api/watchlists/1/clone \
  -H "Content-Type: application/json" \
  -d '{"name": "Intraday Momentum - Swing"}'

# Response: {"status": "success", "data": {"id": 2, ...}}

# 2. Modify configurations for swing trading
curl -X PUT http://localhost:3000/api/watchlists/2/symbols/5/config \
  -H "Content-Type: application/json" \
  -d '{
    "product_type": "CNC",
    "target_type": "PERCENTAGE",
    "target_value": 5.0,
    "sl_type": "PERCENTAGE",
    "sl_value": 2.0
  }'
```

---

## 🔐 Authentication Notes

1. **Session-Based**: Uses Google OAuth with session cookies
2. **Admin Required**: Most write operations require `is_admin = 1` flag
3. **CORS Enabled**: Dashboard must be on allowed origin (default: `http://localhost:3000`)

## ⚠️ Error Responses

```json
// 401 Unauthorized
{
  "error": "Authentication required"
}

// 403 Forbidden
{
  "error": "Admin privileges required"
}

// 404 Not Found
{
  "status": "error",
  "message": "Watchlist not found"
}

// 409 Conflict
{
  "status": "error",
  "message": "A watchlist with this name already exists"
}

// 400 Bad Request
{
  "status": "error",
  "message": "Watchlist name is required"
}
```

---

## 🧪 Testing with cURL

### Complete Test Sequence

```bash
# 1. Check authentication status
curl http://localhost:3000/api/user

# 2. List existing watchlists
curl http://localhost:3000/api/watchlists

# 3. Get admin instance status
curl http://localhost:3000/api/admin-instances/status

# 4. Create test watchlist
curl -X POST http://localhost:3000/api/watchlists \
  -H "Content-Type: application/json" \
  -d '{"name": "Test API", "description": "Testing API endpoints"}'

# 5. Add test symbol
curl -X POST http://localhost:3000/api/watchlists/1/symbols \
  -H "Content-Type: application/json" \
  -d '{"exchange": "NSE", "symbol": "SBIN", "token": "3045"}'

# 6. Configure symbol
curl -X PUT http://localhost:3000/api/watchlists/1/symbols/1/config \
  -H "Content-Type: application/json" \
  -d '{"qty_type": "FIXED", "qty_value": 5}'

# 7. List symbols
curl http://localhost:3000/api/watchlists/1/symbols

# 8. Delete watchlist
curl -X DELETE http://localhost:3000/api/watchlists/1
```

---

## 📚 Database Tables

Direct database queries (for debugging):

```bash
# Connect to database
sqlite3 backend/database/simplifyed.db

# List all tables
.tables

# View watchlists
SELECT * FROM watchlists;

# View symbols with configs
SELECT
  ws.id, ws.exchange, ws.symbol,
  sc.qty_type, sc.qty_value,
  sc.target_type, sc.target_value
FROM watchlist_symbols ws
LEFT JOIN symbol_configs sc ON sc.symbol_id = ws.id
WHERE ws.watchlist_id = 1;

# View instance assignments
SELECT
  w.name as watchlist,
  i.name as instance
FROM watchlist_instances wi
JOIN watchlists w ON w.id = wi.watchlist_id
JOIN instances i ON i.id = wi.instance_id;

# Check admin instances
SELECT id, name, is_primary_admin, is_secondary_admin, websocket_status
FROM instances
WHERE is_primary_admin = 1 OR is_secondary_admin = 1;
```

---

**Last Updated:** 2025-11-05
**Version:** 1.0.0
**Phase:** Phase 1 Complete
