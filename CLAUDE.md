# Simplifyed Admin Dashboard - Technical Documentation

## Overview

The Simplifyed Admin Dashboard is a comprehensive trading management system designed to monitor and control multiple OpenAlgo trading instances from a centralized interface. It provides real-time monitoring, automated safety controls, and comprehensive P&L tracking with role-based access control.

## System Architecture

```
┌─────────────────────┐    ┌──────────────────┐
│  Admin Dashboard    │────│   Backend API    │
│  (Frontend - Vue)   │    │  (Node.js/Express) │
└─────────────────────┘    └──────────────────┘
                                      │
                           ┌──────────────────┐
                           │   SQLite DB      │
                           │ - Instances      │
                           │ - Users/Auth     │
                           │ - P&L Data       │
                           └──────────────────┘
                                      │
                           ┌──────────────────┐
                           │ Scheduler/Workers│
                           │ - 30s P&L polls  │
                           │ - 20min health   │
                           │ - Auto-switching │
                           └──────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│  OpenAlgo #1    │          │  OpenAlgo #2    │          │  OpenAlgo #N    │
│  (Upstox/Zerodha) │        │ (Flattrade/etc) │          │   (Any Broker)  │
└─────────────────┘          └─────────────────┘          └─────────────────┘
```

## Key Features

### 1. **Comprehensive P&L Tracking**
- **Realized P&L**: Calculated from completed trades (tradebook API)
- **Unrealized P&L**: Calculated from open positions (positionbook API)
- **Total P&L**: Combined realized + unrealized for complete view
- **Real-time Updates**: 30-second polling for accurate data

### 2. **Enhanced Dashboard Display**
- **P&L Breakdown**: Shows R: ₹X | U: ₹Y format in Total P&L card
- **Filtered Calculations**: Cumulative P&L for displayed instances only
- **Instance Context**: Shows "X of Y instances" when filtering active
- **Quick Decision Making**: Easy manual Safe-Switch decisions based on filtered P&L

### 3. **Safe-Switch Workflow**
- **Automated Switching**: Target-based profit/loss triggers
- **Manual Override**: Quick manual switching with P&L context
- **Safe Closure Process**: 
  1. Close all positions
  2. Cancel pending orders
  3. Verify no open trades
  4. Switch to analyzer mode

### 4. **Multi-Instance Management**
- **Bulk Operations**: Control multiple instances simultaneously
- **Individual Controls**: Instance-specific actions
- **Search & Filter**: Find instances by broker, status, or name
- **Health Monitoring**: Automatic health checks every 20 minutes

### 5. **Security & Authentication**
- **Google OAuth**: Secure authentication system
- **Role-Based Access**: Admin and operator roles
- **Session Management**: SQLite-based session storage
- **API Key Encryption**: Encrypted storage of sensitive credentials

## Technology Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: SQLite with async/await support
- **Authentication**: Passport.js with Google OAuth
- **Session Storage**: connect-sqlite3
- **Environment**: dotenv for configuration

### Frontend
- **Framework**: Vanilla JavaScript (no frameworks)
- **Styling**: Tailwind CSS
- **HTTP Client**: Fetch API
- **Real-time Updates**: Polling-based updates
- **UI Components**: Custom components with responsive design

### External APIs
- **OpenAlgo API**: RESTful API for trading operations
- **Supported Endpoints**:
  - `/api/v1/funds` - Account balance
  - `/api/v1/tradebook` - Completed trades (for realized P&L)
  - `/api/v1/positionbook` - Open positions (for unrealized P&L)
  - `/api/v1/ping` - Health check
  - `/api/v1/analyzer/toggle` - Mode switching
  - `/api/v1/closeposition` - Close positions
  - `/api/v1/cancelallorder` - Cancel orders

## Database Schema

### `instances` Table
```sql
CREATE TABLE instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  api_key TEXT NOT NULL,
  broker TEXT,
  strategy_tag TEXT DEFAULT 'ALL',
  is_analyzer_mode BOOLEAN DEFAULT 0,
  current_balance REAL DEFAULT 0,
  current_pnl REAL DEFAULT 0,
  realized_pnl REAL DEFAULT 0,        -- NEW: From completed trades
  unrealized_pnl REAL DEFAULT 0,      -- NEW: From open positions  
  total_pnl REAL DEFAULT 0,           -- NEW: realized + unrealized
  target_profit REAL DEFAULT 5000,
  target_loss REAL DEFAULT 2000,
  is_active BOOLEAN DEFAULT 1,
  last_updated DATETIME,
  health_status TEXT DEFAULT 'unknown',
  last_health_check DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `users` Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Instance Management
- `GET /api/instances` - List all instances with comprehensive P&L data
- `POST /api/instances` - Add new instance
- `PUT /api/instances/:id` - Update instance configuration
- `DELETE /api/instances/:id` - Remove instance

### Trading Operations
- `POST /api/instances/:id/analyzer-toggle` - Toggle analyzer/live mode
- `POST /api/instances/:id/close-positions` - Close all positions
- `POST /api/instances/:id/cancel-orders` - Cancel all pending orders
- `POST /api/instances/:id/safe-switch` - Execute complete safe-switch workflow

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/logout` - Logout user
- `GET /auth/unauthorized` - Unauthorized access page

## P&L Calculation Logic

### Realized P&L Calculation
```javascript
// Groups trades by symbol and calculates profit/loss from completed trades
function calculateRealizedPnL(trades) {
  const grouped = {};
  
  // Group by symbol and aggregate buy/sell quantities and amounts
  for (let trade of trades) {
    const { symbol, action, price, quantity } = trade;
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantity);
    
    if (!grouped[symbol]) {
      grouped[symbol] = { buyQty: 0, buySum: 0, sellQty: 0, sellSum: 0 };
    }

    if (action === "BUY") {
      grouped[symbol].buyQty += parsedQuantity;
      grouped[symbol].buySum += parsedPrice * parsedQuantity;
    } else if (action === "SELL") {
      grouped[symbol].sellQty += parsedQuantity;
      grouped[symbol].sellSum += parsedPrice * parsedQuantity;
    }
  }

  // Calculate realized P&L for each symbol
  const realizedPnL = {};
  for (let symbol in grouped) {
    const g = grouped[symbol];
    const avgBuy = g.buyQty ? g.buySum / g.buyQty : 0;
    const avgSell = g.sellQty ? g.sellSum / g.sellQty : 0;
    const closedQty = Math.min(g.buyQty, g.sellQty);
    
    realizedPnL[symbol] = (avgSell - avgBuy) * closedQty;
  }

  return realizedPnL;
}
```

### Total P&L Integration
```javascript
// Complete P&L calculation combining realized and unrealized
async function getAccountPnL(instance) {
  // Get completed trades for realized P&L
  const tradebookData = await makeOpenAlgoRequest(instance.host, '/api/v1/tradebook', {
    apikey: instance.api_key
  });
  
  // Get open positions for unrealized P&L
  const positionsData = await makeOpenAlgoRequest(instance.host, '/api/v1/positionbook', {
    apikey: instance.api_key
  });
  
  // Calculate comprehensive P&L
  const realizedPnL = calculateRealizedPnL(tradebookData.data || []);
  const unrealizedPnL = calculateUnrealizedPnL(positionsData.data || []);
  
  const accountTotals = {
    realized_pnl: Object.values(realizedPnL).reduce((sum, pnl) => sum + pnl, 0),
    unrealized_pnl: Object.values(unrealizedPnL).reduce((sum, pnl) => sum + pnl, 0)
  };
  
  accountTotals.total_pnl = accountTotals.realized_pnl + accountTotals.unrealized_pnl;
  
  return { accountTotals, symbolBreakdown: { realizedPnL, unrealizedPnL } };
}
```

## Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:8080

# Authentication
SESSION_SECRET=your-session-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database
NODE_ENV=development
```

### Google OAuth Setup
1. Create project in Google Cloud Console
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (development)
   - `https://yourdomain.com/auth/google/callback` (production)
5. Download credentials JSON and place as `client_secret_SimplifyedAdmin.apps.googleusercontent.com.json`

## Installation & Setup

### Prerequisites
- Node.js 18+
- NPM or Yarn
- Google OAuth credentials

### Backend Setup
```bash
cd backend
npm install
# Configure environment variables
cp .env.example .env
# Add Google OAuth credentials file
# Start server
npm start
```

### Frontend Setup
```bash
cd frontend
# Serve static files (development)
python3 -m http.server 8080
# Or use any static file server
```

### Production Deployment

#### Automated Ubuntu Server Installation (Recommended)

The fastest way to deploy on Ubuntu Server with custom domain and SSL:

```bash
# Download and run the installation script
wget https://raw.githubusercontent.com/jabez4jc/Simplifyed-Admin/main/install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh your-domain.com admin@yourdomain.com
```

**What the script configures:**
- Node.js 18 + PM2 process manager
- Nginx reverse proxy with security headers
- SSL certificate via Let's Encrypt
- UFW firewall configuration
- Dedicated `simplifyed` user account
- Auto-startup on system reboot

**File Locations:**
- Application: `/opt/simplifyed-admin`
- Nginx config: `/etc/nginx/sites-available/simplifyed-admin`
- Environment: `/opt/simplifyed-admin/backend/.env`
- OAuth setup: `/opt/simplifyed-admin/GOOGLE_OAUTH_SETUP.md`

#### Manual PM2 Deployment

```bash
# Backend (PM2 recommended)
pm2 start server.js --name "simplifyed-backend"

# Frontend (Nginx recommended)
# Configure Nginx to serve static files and proxy API calls
```

#### Docker Deployment

```dockerfile
# Example Dockerfile structure
FROM node:18-alpine
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/
RUN cd backend && npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring & Maintenance

### Health Checks
- **Instance Health**: 20-minute intervals via `/ping` endpoint
- **System Health**: Monitor logs for API errors and connection issues
- **Database Health**: SQLite integrity checks recommended

### Logging
- **Request Logging**: All API requests logged with timestamps
- **Error Logging**: Detailed error logs for debugging
- **Authentication Events**: Login/logout events tracked

### Performance Considerations
- **API Rate Limits**: OpenAlgo instances may have rate limiting
- **Database Optimization**: Consider indexing for large datasets
- **Memory Management**: Monitor memory usage for long-running processes

## Security Considerations

### Data Protection
- **API Keys**: Encrypted at rest in database
- **Session Data**: Secure session management with SQLite storage
- **HTTPS**: Required for production deployment
- **CORS**: Configured for frontend domain only

### Access Control
- **Authentication Required**: All API endpoints require authentication
- **Role-Based Access**: Admin vs operator permissions
- **Session Expiry**: 7-day session timeout
- **Unauthorized Access**: Proper error handling and redirects

## Troubleshooting

### Common Issues
1. **Port Already in Use**: Kill existing processes on ports 3000/8080
2. **Google OAuth Errors**: Verify credentials and redirect URIs
3. **API Connection Failures**: Check OpenAlgo instance URLs and API keys
4. **Database Lock Issues**: Ensure proper async/await usage

### Debug Commands
```bash
# Check running processes
lsof -i :3000
lsof -i :8080

# View logs
tail -f logs/app.log

# Database inspection
sqlite3 database/trading.db
.tables
.schema instances
```

## Future Enhancements

### Planned Features
- **WebSocket Integration**: Real-time updates without polling
- **Advanced Analytics**: Historical P&L charts and performance metrics
- **Alert System**: Email/SMS notifications for critical events
- **Backup & Recovery**: Automated database backups
- **Multi-tenant Support**: Support multiple trading accounts per user

### Scalability Improvements
- **Database Migration**: PostgreSQL for production scale
- **Caching Layer**: Redis for improved performance
- **Load Balancing**: Multiple backend instances
- **Microservices**: Split functionality into dedicated services

## Development Guidelines

### Code Standards
- **ES6+ JavaScript**: Use modern JavaScript features
- **Async/Await**: Prefer over callbacks and promises
- **Error Handling**: Comprehensive try/catch blocks
- **Logging**: Detailed logging for debugging and monitoring
- **Comments**: Document complex business logic

### Testing Strategy
- **Unit Tests**: Core P&L calculation functions
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Complete workflow testing
- **Performance Tests**: Load testing for multiple instances

### Version Control
- **Git Flow**: Feature branches with pull request reviews
- **Semantic Versioning**: Major.Minor.Patch versioning
- **Release Notes**: Detailed changelog for each release
- **Environment Branches**: Separate dev/staging/prod branches

---

**Last Updated**: September 2025  
**Version**: 2.0.0  
**Maintainer**: Simplifyed Team  
**Support**: support@simplifyed.in