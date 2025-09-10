# Simplifyed Admin Dashboard

> **A comprehensive trading management system for monitoring and controlling multiple OpenAlgo instances with advanced P&L tracking and automated risk management.**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/simplifyed/simplifyed-admin)
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

### 🔐 **Enterprise Security**
- **Google OAuth 2.0**: Secure authentication with role-based access
- **Admin/Operator Roles**: Granular permission control
- **Encrypted Storage**: API keys encrypted at rest
- **Session Security**: Secure session management with SQLite storage

### 🎨 **Modern Interface**
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Real-time Dashboard**: Live updates with enhanced P&L display
- **Search & Filters**: Quickly find and filter instances
- **Table/Card Views**: Toggle between detailed table and card layouts

## 📊 Dashboard Overview

### Enhanced Total P&L Card
```
┌─────────────────────┐
│    Total P&L        │
│                     │
│     +₹3,750         │
│  R: +₹2,500 | U: +₹1,250  │
│                     │
│ (2 of 4 instances)  │ ← Shown when filtering
└─────────────────────┘
```

### Instance Management
- **Live Mode**: Active trading with real-time P&L tracking
- **Analyzer Mode**: Safe analysis mode with trade simulation
- **Auto-Switching**: Intelligent switching based on P&L targets
- **Manual Controls**: Override automation when needed

## 🏗️ Architecture

```
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  Frontend Dashboard │────│   Backend API    │────│  OpenAlgo Instances │
│  (Vue.js + Tailwind)│    │ (Node.js/Express)│    │  (Multiple Brokers) │
└─────────────────────┘    └──────────────────┘    └─────────────────────┘
                                      │
                           ┌──────────────────┐
                           │   SQLite DB      │
                           │ • Instances      │
                           │ • Users/Roles    │
                           │ • P&L Data       │
                           │ • Health Logs    │
                           └──────────────────┘
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
FRONTEND_URL=http://localhost:8080
SESSION_SECRET=your-super-secret-session-key-here
```

### 4. Launch Application
```bash
# Start backend server
cd backend && npm start

# Start frontend server (in new terminal)
cd frontend && python3 -m http.server 8080
```

### 5. Access Dashboard
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000/api
- **Login**: Click "Login with Google" button

## 📁 Project Structure

```
SimplifyedAdmin/
├── 📁 backend/                     # Node.js Express backend
│   ├── 🚀 server.js               # Main server with P&L engine
│   ├── 🔐 auth.js                 # Google OAuth & role management
│   ├── 📦 package.json            # Backend dependencies
│   ├── ⚙️ ecosystem.config.js     # PM2 production config
│   └── 📁 database/               # SQLite databases
│       ├── 🗄️ trading.db          # Main application data
│       └── 🔑 sessions.db         # Authentication sessions
├── 📁 frontend/                   # Modern dashboard interface
│   ├── 🏠 index.html             # Main dashboard UI
│   ├── ⚡ app.js                 # Enhanced frontend logic
│   └── 🎨 styles/                # Custom styling
├── 📁 Requirements/               # System documentation
│   ├── 📋 Simplifyed System Architecture — Diagram.txt
│   └── 📚 openalgo-api-docs.md
├── 📄 CLAUDE.md                  # Complete technical documentation
├── 🗄️ DATABASE_SCHEMA.md         # Database schema documentation
├── 🚀 DEPLOYMENT.md              # Production deployment guide
├── ⚙️ install-ubuntu.sh          # Automated Ubuntu installation script
├── 🙈 .gitignore                 # Security-focused git ignore
└── 📖 README.md                  # This file
```

## 🎛️ Advanced Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Backend server port | `3000` |
| `BASE_URL` | Backend base URL | `http://localhost:3000` |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:8080` |
| `SESSION_SECRET` | Session encryption key | Required |

### Instance Configuration
Each OpenAlgo instance requires:
- **Name**: Descriptive instance name
- **Host URL**: OpenAlgo instance URL (e.g., https://upstox.simplifyed.in)
- **API Key**: OpenAlgo API authentication key
- **Broker**: Broker type (upstox, flattrade, etc.)
- **Strategy Tag**: Trading strategy identifier
- **Profit Target**: Auto-switch profit threshold (default: ₹5,000)
- **Loss Target**: Auto-switch loss threshold (default: ₹2,000)

## 📊 Database Schema (v2.0)

### Enhanced Instances Table
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
  realized_pnl REAL DEFAULT 0,        -- 🆕 From completed trades
  unrealized_pnl REAL DEFAULT 0,      -- 🆕 From open positions
  total_pnl REAL DEFAULT 0,           -- 🆕 Combined P&L
  
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

### Users & Roles
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT 0,         -- Role-based access
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/user` | Get current user profile |
| `GET` | `/auth/google` | Initiate Google OAuth login |
| `GET` | `/auth/google/callback` | OAuth callback handler |
| `GET` | `/auth/logout` | Logout and clear session |
| `GET` | `/auth/unauthorized` | Unauthorized access page |

### Instance Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/instances` | List all instances with comprehensive P&L |
| `POST` | `/api/instances` | Create new trading instance |
| `PUT` | `/api/instances/:id` | Update instance configuration |
| `DELETE` | `/api/instances/:id` | Remove instance |

### Trading Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/instances/:id/analyzer-toggle` | Switch between live/analyzer mode |
| `POST` | `/api/instances/:id/close-positions` | Close all open positions |
| `POST` | `/api/instances/:id/cancel-orders` | Cancel all pending orders |
| `POST` | `/api/instances/:id/safe-switch` | Execute complete safe-switch workflow |

## ⚡ P&L Calculation Engine

### Comprehensive P&L Tracking
The system calculates three types of P&L for complete visibility:

1. **Realized P&L** (from tradebook)
   ```javascript
   // Groups completed trades by symbol
   // Calculates average buy/sell prices
   // Computes profit/loss for closed positions
   realizedPnL = (avgSellPrice - avgBuyPrice) * closedQuantity
   ```

2. **Unrealized P&L** (from positionbook)
   ```javascript
   // Extracts P&L from open positions
   // Current market value vs average cost
   unrealizedPnL = (currentPrice - avgPrice) * quantity
   ```

3. **Total P&L** (combined)
   ```javascript
   totalPnL = realizedPnL + unrealizedPnL
   ```

### Auto-Switch Logic
```javascript
if (totalPnL >= targetProfit && !isAnalyzerMode) {
  // 1. Close all positions
  // 2. Cancel pending orders
  // 3. Switch to analyzer mode
  // 4. Log the action
}

if (totalPnL <= -targetLoss && !isAnalyzerMode) {
  // Same safe-switch process for loss protection
}
```

## 🚀 Production Deployment

### 🖥️ Automated Ubuntu Server Installation (Recommended)

The easiest way to deploy Simplifyed Admin Dashboard on Ubuntu Server with custom domain and SSL certificate:

```bash
# Download and run the installation script
wget https://raw.githubusercontent.com/jabez4jc/Simplifyed-Admin/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh your-domain.com admin@yourdomain.com
```

**What the script does:**
- ✅ Installs Node.js 18, PM2, Nginx, and all dependencies
- ✅ Creates dedicated user account (`simplifyed`)
- ✅ Configures Nginx reverse proxy with security headers
- ✅ Sets up SSL certificate with Let's Encrypt
- ✅ Configures UFW firewall with proper rules
- ✅ Starts services and enables auto-startup
- ✅ Creates Google OAuth setup instructions

**Requirements:**
- Ubuntu Server 20.04+ with root access
- Domain name pointing to your server IP
- Ports 80 and 443 open

**Post-Installation:**
1. Set up Google OAuth credentials (instructions provided)
2. Access dashboard at `https://your-domain.com`
3. First login becomes admin automatically

### Using PM2 (Manual Setup)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
cd backend && npm run pm2:start

# Monitor processes
pm2 status
pm2 logs simplifyed-backend

# Auto-start on system reboot
pm2 startup
pm2 save
```

### Production Environment
```env
NODE_ENV=production
PORT=3000
BASE_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com
SESSION_SECRET=your-super-secure-production-secret
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Frontend static files
    location / {
        root /path/to/SimplifyedAdmin/frontend;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Authentication routes
    location /auth/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔧 Management Commands

### Development
```bash
npm start              # Start backend server
npm run dev           # Start with nodemon auto-restart
npm run test          # Run test suite
npm run lint          # Check code quality
```

### Production (PM2)
```bash
npm run pm2:start     # Start with PM2
npm run pm2:stop      # Stop application
npm run pm2:restart   # Restart application
npm run pm2:logs      # View logs
npm run pm2:delete    # Remove from PM2
npm run pm2:monitor   # Open PM2 web dashboard
```

### Database
```bash
npm run db:backup     # Create database backup
npm run db:migrate    # Run database migrations
npm run db:seed       # Seed sample data
```

## 🛡️ Security Features

### Authentication & Authorization
- **Google OAuth 2.0**: Enterprise-grade authentication
- **Role-based Access**: Admin and operator permissions
- **Session Security**: Secure session storage with expiration
- **CSRF Protection**: Request validation and CSRF tokens

### Data Protection
- **API Key Encryption**: AES-256 encryption for stored API keys
- **TLS/HTTPS**: Encrypted communication in production
- **Input Validation**: Comprehensive input sanitization
- **SQL Injection Protection**: Parameterized queries

### Security Headers
```javascript
// Implemented security headers
helmet({
  contentSecurityPolicy: true,
  hsts: true,
  noSniff: true,
  frameguard: true,
  xssFilter: true
})
```

## 📈 Monitoring & Health Checks

### System Health
- **Instance Health**: 20-minute health check intervals
- **API Connectivity**: Continuous endpoint monitoring
- **Database Health**: Connection and integrity checks
- **Performance Metrics**: Response time tracking

### Logging & Alerts
- **Request Logging**: All API requests with timestamps
- **Error Tracking**: Comprehensive error logging
- **P&L Events**: Automated switching events logged
- **Health Alerts**: Automated notifications for failures

## 🔍 Troubleshooting

### Common Issues

#### 1. Authentication Problems
```bash
# Check Google OAuth credentials
ls backend/client_secret_*.json

# Verify redirect URIs in Google Cloud Console
# Ensure URLs match exactly (including http/https)
```

#### 2. Database Issues
```bash
# Check database permissions
ls -la backend/database/

# Test database connectivity
sqlite3 backend/database/trading.db ".tables"

# Backup before troubleshooting
npm run db:backup
```

#### 3. OpenAlgo Connection
```bash
# Test API connectivity
curl -X POST https://your-openalgo-instance.com/api/v1/ping \
  -H "Content-Type: application/json" \
  -d '{"apikey": "your-api-key"}'
```

#### 4. Port Conflicts
```bash
# Check port usage
lsof -i :3000
lsof -i :8080

# Kill conflicting processes
kill -9 <process-id>
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Backend only debug
DEBUG=simplifyed:* npm start
```

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)**: Complete technical documentation
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)**: Database schema and migrations
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Production deployment guide with Ubuntu installer
- **[Requirements/](Requirements/)**: System architecture and API documentation
- **[OpenAlgo API Docs](Requirements/openalgo-api-docs.md)**: OpenAlgo integration guide

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Setup
```bash
# Clone your fork
git clone https://github.com/your-username/SimplifyedAdmin.git

# Add upstream remote
git remote add upstream https://github.com/original-org/SimplifyedAdmin.git

# Create development branch
git checkout -b develop
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏷️ Version History

- **v2.0.0** (September 2025) - Comprehensive P&L tracking, enhanced UI, advanced risk management
- **v1.5.0** - Multi-instance management, health monitoring
- **v1.0.0** - Initial release with basic OpenAlgo integration

## 📞 Support

- **Documentation**: [Complete Technical Docs](CLAUDE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/SimplifyedAdmin/issues)
- **Email**: support@simplifyed.in
- **Discord**: [Trading Community](https://discord.gg/simplifyed)

---

<div align="center">

**Made with ❤️ by the Simplifyed Team**

[Website](https://simplifyed.in) • [Documentation](CLAUDE.md) • [Support](mailto:support@simplifyed.in)

</div>