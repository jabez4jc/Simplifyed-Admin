# Simplifyed Admin Dashboard

> **A comprehensive trading management system for monitoring and controlling multiple OpenAlgo instances with advanced P&L tracking, watchlist management, and automated risk management.**

[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/simplifyed/simplifyed-admin)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ Key Features

### 🎯 **Comprehensive P&L Tracking**
- **Realized P&L**: Track profits/losses from completed trades
- **Unrealized P&L**: Monitor open position performance
- **Total P&L**: Combined view with breakdown (R: ₹2,500 | U: ₹1,250)
- **Filtered Calculations**: Cumulative P&L for displayed instances only
- **Real-time Updates**: 30-second polling for accurate data

### 🚦 **Advanced Risk Management**
- **Auto-Switch Workflow**: Automated safety switching based on P&L targets
- **Manual Override**: Quick manual switching with P&L context
- **Target-Based Controls**: Customizable profit/loss thresholds
- **Safe Closure Process**: Automated position closing and order cancellation

### 🎛️ **Multi-Instance Management**
- **Centralized Control**: Manage multiple OpenAlgo instances from one dashboard
- **Bulk Operations**: Control multiple instances simultaneously
- **Individual Controls**: Instance-specific trading actions
- **Health Monitoring**: Automated health checks every 20 minutes

### 📋 **Watchlist Management**
- **Shared Watchlists**: Create and manage symbol watchlists across instances
- **CSV Import/Export**: Bulk import/export symbols with configurations
- **Instance Assignment**: Link watchlists to specific trading instances
- **Symbol Configuration**: Per-symbol quantity rules, targets, stop-losses
- **Active/Inactive Status**: Control watchlist activation state

### 🔐 **Enterprise Security**
- **Google OAuth 2.0**: Secure authentication with role-based access
- **Admin/Operator Roles**: Granular permission control
- **Encrypted Storage**: API keys encrypted at rest
- **Session Security**: Secure session management with SQLite storage

### 🎨 **Unified Interface**
- **Single Dashboard**: All features in one application
- **Tab Navigation**: Easy switching between Instances and Watchlists
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Real-time Updates**: Live data with enhanced P&L display
- **Dark Theme**: Modern, eye-friendly interface

## 📊 Dashboard Overview

The Simplifyed Admin Dashboard provides a unified interface with three main views:

### 1. **Dashboard View**
```
┌─────────────────────────────────────────┐
│  Summary Cards                          │
│  - Total Instances                      │
│  - Active Instances                     │
│  - Total P&L (with breakdown)           │
│  - System Health                        │
└─────────────────────────────────────────┘
```

### 2. **Instances View**
```
┌─────────────────────────────────────────┐
│  Instance Management                    │
│  ├─ P&L Tracking (Realized/Unrealized)  │
│  ├─ Mode Toggle (Live/Analyzer)         │
│  ├─ Position Management                 │
│  ├─ Order Controls                      │
│  └─ Health Status                       │
└─────────────────────────────────────────┘
```

### 3. **Watchlists View**
```
┌─────────────────────────────────────────┐
│  Watchlist Management                   │
│  ├─ Create/Edit/Delete Watchlists       │
│  ├─ Symbol Management                   │
│  ├─ CSV Import/Export                   │
│  ├─ Instance Assignment                 │
│  └─ Configuration Rules                 │
└─────────────────────────────────────────┘
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Unified Admin Dashboard                     │
│         (Single HTML/JS Application - No Framework)          │
│  ┌──────────────────┐  ┌───────────────────────────────┐   │
│  │    Instances     │  │       Watchlists              │   │
│  │  - P&L Tracking  │  │  - Symbol Management          │   │
│  │  - Mode Control  │  │  - CSV Import/Export          │   │
│  │  - Health Check  │  │  - Instance Assignment        │   │
│  └──────────────────┘  └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Backend API Server                         │
│                  (Node.js + Express)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  Instance   │  │  Watchlist  │  │   Order Tracking │   │
│  │   Routes    │  │   Routes    │  │     (Phase 4)    │   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     SQLite Database                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  instances  │  │  watchlists │  │ watchlist_symbols│   │
│  │    users    │  │  sessions   │  │ watchlist_orders │   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ OpenAlgo API
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              OpenAlgo Trading Instances                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Instance #1 │  │  Instance #2 │  │  Instance #N │     │
│  │   (Upstox)   │  │ (Flattrade)  │  │  (Any Broker)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js**: Version 18+ ([Download](https://nodejs.org/))
- **Google OAuth**: Credentials from [Google Cloud Console](https://console.cloud.google.com/)
- **OpenAlgo Instances**: Running OpenAlgo trading instances

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/your-org/SimplifyedAdmin.git
cd SimplifyedAdmin

# Install backend dependencies
cd backend && npm install
```

### 2. Google OAuth Setup
1. Create project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API
3. Create OAuth 2.0 credentials with redirect URI: `http://localhost:3000/auth/google/callback`
4. Download credentials as `client_secret_SimplifyedAdmin.apps.googleusercontent.com.json`
5. Place in `backend/` directory

### 3. Configuration
Create `.env` in `backend/` directory:
```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
SESSION_SECRET=your-super-secret-session-key-here
```

### 4. Launch Application
```bash
# Start backend server (from backend directory)
npm start
```

### 5. Access Dashboard
- **Dashboard URL**: http://localhost:3000/dashboard.html
- **Login**: Click "Login with Google" button
- **First Login**: First user becomes admin automatically

## 📁 Project Structure

```
SimplifyedAdmin/
├── 📁 backend/                         # Node.js Express backend
│   ├── 🚀 server.js                   # Main server with all APIs
│   ├── 🔐 auth.js                     # Google OAuth & sessions
│   ├── 📁 routes/                     # API route handlers
│   │   ├── instances.js               # Instance management
│   │   ├── watchlists.js              # Watchlist management
│   │   ├── orders.js                  # Order tracking (Phase 4)
│   │   └── health.js                  # Health checks
│   ├── 📁 lib/                        # Business logic
│   │   ├── order-status-tracker.js    # Order polling
│   │   ├── order-placement-service.js # Order execution
│   │   └── rate-limiter.js            # API rate limiting
│   ├── 📁 database/                   # SQLite databases
│   │   ├── 🗄️ simplifyed.db          # Main application data
│   │   ├── 🔑 sessions.db             # Authentication sessions
│   │   └── 📁 migrations/             # Database migrations
│   ├── 📁 public/                     # Static frontend files
│   │   ├── 🏠 dashboard.html          # Unified dashboard UI
│   │   ├── ⚡ dashboard.js            # All frontend logic
│   │   ├── 🔧 api-explorer.html       # API testing tool
│   │   └── 🧪 test-auth.html          # Auth testing tool
│   └── 📦 package.json                # Backend dependencies
├── 📁 Requirements/                   # System documentation
├── 📄 CLAUDE.md                       # Technical documentation
├── 🗄️ DATABASE_SCHEMA.md             # Database schema docs
├── 🚀 DEPLOYMENT.md                   # Production deployment guide
├── ⚙️ install-ubuntu.sh               # Automated Ubuntu installer
└── 📖 README.md                       # This file
```

## 🎛️ Advanced Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Backend server port | `3000` |
| `BASE_URL` | Backend base URL | `http://localhost:3000` |
| `SESSION_SECRET` | Session encryption key | Required |

### Instance Configuration
Each OpenAlgo instance requires:
- **Name**: Descriptive instance name
- **Host URL**: OpenAlgo instance URL (e.g., https://upstox.simplifyed.in)
- **API Key**: OpenAlgo API authentication key
- **Broker**: Broker type (upstox, flattrade, zerodha, etc.)
- **Strategy Tag**: Trading strategy identifier
- **Profit Target**: Auto-switch profit threshold (default: ₹5,000)
- **Loss Target**: Auto-switch loss threshold (default: ₹2,000)

### Watchlist Configuration
Each watchlist supports:
- **Name & Description**: Identification metadata
- **Active Status**: Enable/disable watchlist
- **Symbol List**: Multiple symbols with configurations
- **Instance Assignment**: Link to specific instances
- **CSV Import/Export**: Bulk symbol management

## 📊 Database Schema (v2.1)

### Core Tables

#### **instances**
Stores OpenAlgo instance configurations and real-time P&L data.
```sql
CREATE TABLE instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  api_key TEXT NOT NULL,
  broker TEXT,
  strategy_tag TEXT DEFAULT 'ALL',

  -- Financial Tracking
  current_balance REAL DEFAULT 0,
  realized_pnl REAL DEFAULT 0,        -- From completed trades
  unrealized_pnl REAL DEFAULT 0,      -- From open positions
  total_pnl REAL DEFAULT 0,           -- Combined P&L

  -- Risk Management
  target_profit REAL DEFAULT 5000,
  target_loss REAL DEFAULT 2000,
  is_analyzer_mode BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,

  -- Health & Audit
  health_status TEXT DEFAULT 'unknown',
  last_health_check DATETIME,
  last_updated DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **watchlists**
Stores watchlist metadata and configuration.
```sql
CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **watchlist_symbols**
Stores symbols and their trading configurations.
```sql
CREATE TABLE watchlist_symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  token TEXT,
  -- Trading Configuration
  qty_type TEXT DEFAULT 'FIXED',
  qty_value REAL DEFAULT 1,
  target_type TEXT DEFAULT 'PERCENTAGE',
  target_value REAL DEFAULT 0,
  sl_type TEXT DEFAULT 'PERCENTAGE',
  sl_value REAL DEFAULT 0,
  product_type TEXT DEFAULT 'MIS',
  order_type TEXT DEFAULT 'MARKET',
  is_enabled BOOLEAN DEFAULT 1,
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
);
```

#### **watchlist_instance_assignments**
Links watchlists to instances.
```sql
CREATE TABLE watchlist_instance_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL,
  instance_id INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE,
  UNIQUE(watchlist_id, instance_id)
);
```

#### **users**
Stores user authentication and roles.
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for complete schema documentation including Phase 3 & 4 tables.

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user` | Get current user profile |
| `GET` | `/auth/google` | Initiate Google OAuth login |
| `GET` | `/auth/google/callback` | OAuth callback handler |
| `GET` | `/auth/logout` | Logout and clear session |

### Instance Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/instances` | List all instances with P&L |
| `POST` | `/api/instances` | Create new trading instance |
| `PUT` | `/api/instances/:id` | Update instance configuration |
| `DELETE` | `/api/instances/:id` | Remove instance |
| `POST` | `/api/instances/:id/analyzer-toggle` | Toggle live/analyzer mode |
| `POST` | `/api/instances/:id/close-positions` | Close all positions |
| `POST` | `/api/instances/:id/cancel-orders` | Cancel pending orders |
| `POST` | `/api/instances/:id/safe-switch` | Execute safe-switch workflow |

### Watchlist Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/watchlists` | List all watchlists |
| `GET` | `/api/watchlists/:id` | Get watchlist with details |
| `POST` | `/api/watchlists` | Create new watchlist |
| `PUT` | `/api/watchlists/:id` | Update watchlist metadata |
| `DELETE` | `/api/watchlists/:id` | Delete watchlist |
| `POST` | `/api/watchlists/:id/clone` | Clone watchlist |
| `GET` | `/api/watchlists/:id/export` | Export CSV |
| `POST` | `/api/watchlists/:id/import` | Import CSV (append/replace) |
| `POST` | `/api/watchlists/:id/instances` | Assign instances |
| `DELETE` | `/api/watchlists/:id/instances/:iid` | Remove instance |

### Order Tracking (Phase 4)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orders` | List orders with filters |
| `GET` | `/api/orders/:id` | Get order details |
| `POST` | `/api/orders/:id/cancel` | Cancel order |
| `GET` | `/api/orders/stats/summary` | Order statistics |

See [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md) for complete API documentation.

## ⚡ P&L Calculation Engine

### Comprehensive P&L Tracking
The system calculates three types of P&L:

1. **Realized P&L** (from tradebook API)
   - Groups completed trades by symbol
   - Calculates average buy/sell prices
   - Computes profit/loss for closed positions

2. **Unrealized P&L** (from positionbook API)
   - Extracts P&L from open positions
   - Current market value vs average cost

3. **Total P&L** (combined)
   - Sum of realized and unrealized P&L
   - Displayed with breakdown: `+₹3,750 (R: +₹2,500 | U: +₹1,250)`

### Auto-Switch Logic
```javascript
if (totalPnL >= targetProfit && !isAnalyzerMode) {
  // 1. Close all positions
  // 2. Cancel pending orders
  // 3. Switch to analyzer mode
  // 4. Log the action
}
```

## 🚀 Production Deployment

### 🖥️ Automated Ubuntu Server Installation (Recommended)

Deploy on Ubuntu Server with custom domain and SSL:

```bash
# Download and run the installation script
wget https://raw.githubusercontent.com/jabez4jc/Simplifyed-Admin/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh your-domain.com admin@yourdomain.com
```

**What the script configures:**
- ✅ Node.js 18 + PM2 process manager
- ✅ Nginx reverse proxy with security headers
- ✅ SSL certificate via Let's Encrypt
- ✅ UFW firewall configuration
- ✅ Dedicated `simplifyed` user account
- ✅ Auto-startup on system reboot

**Post-Installation:**
1. Configure Google OAuth credentials
2. Access dashboard at `https://your-domain.com/dashboard.html`
3. First login becomes admin

### Manual PM2 Deployment
```bash
# Install PM2 globally
npm install -g pm2

# Start application
cd backend && pm2 start server.js --name simplifyed-backend

# Monitor
pm2 status
pm2 logs simplifyed-backend

# Auto-start on reboot
pm2 startup
pm2 save
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment documentation.

## 🔧 Management Commands

### Development
```bash
npm start              # Start backend server
npm run dev           # Start with nodemon auto-restart
```

### Production (PM2)
```bash
npm run pm2:start     # Start with PM2
npm run pm2:stop      # Stop application
npm run pm2:restart   # Restart application
npm run pm2:logs      # View logs
```

### Database
```bash
node database/migrate.js up      # Run migrations
node database/migrate.js down    # Rollback migrations
```

## 🛡️ Security Features

### Authentication & Authorization
- **Google OAuth 2.0**: Enterprise-grade authentication
- **Role-based Access**: Admin and operator permissions
- **Session Security**: Secure SQLite session storage
- **First-User Admin**: First login automatically becomes admin

### Data Protection
- **API Key Encryption**: Secure storage of sensitive credentials
- **TLS/HTTPS**: Encrypted communication in production
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries

## 📈 Monitoring & Health Checks

- **Instance Health**: 20-minute health check intervals
- **API Connectivity**: Continuous endpoint monitoring
- **Database Health**: Connection integrity checks
- **Order Status Tracking**: 5-second polling for order updates

## 🔍 Troubleshooting

### Common Issues

#### Authentication Problems
```bash
# Check Google OAuth credentials
ls backend/client_secret_*.json

# Verify environment variables
cat backend/.env
```

#### Database Issues
```bash
# Check database
sqlite3 backend/database/simplifyed.db ".tables"

# Run migrations
cd backend && node database/migrate.js up
```

#### Port Conflicts
```bash
# Check port usage
lsof -i :3000

# Kill process
kill -9 <process-id>
```

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)**: Complete technical documentation
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)**: Database schema and migrations
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Production deployment guide
- **[API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)**: API endpoint reference
- **[Requirements/](Requirements/)**: System architecture and requirements

## 🏷️ Version History

- **v2.1.0** (November 2025) - Unified dashboard with watchlist management integrated
- **v2.0.0** (September 2025) - Comprehensive P&L tracking, enhanced UI
- **v1.5.0** - Multi-instance management, health monitoring
- **v1.0.0** - Initial release with basic OpenAlgo integration

## 📞 Support

- **Documentation**: [Complete Technical Docs](CLAUDE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/SimplifyedAdmin/issues)
- **Email**: support@simplifyed.in

---

<div align="center">

**Made with ❤️ by the Simplifyed Team**

[Website](https://simplifyed.in) • [Documentation](CLAUDE.md) • [Support](mailto:support@simplifyed.in)

</div>
