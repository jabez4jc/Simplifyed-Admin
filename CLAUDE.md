# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simplifyed Admin Dashboard is a comprehensive trading management system for monitoring and controlling multiple OpenAlgo trading instances. It provides real-time P&L tracking, watchlist management, automated risk controls, and a unified dashboard interface.

**Tech Stack:**
- Backend: Node.js 18+ with Express, ES6 modules
- Database: SQLite
- Frontend: Vanilla JavaScript (no frameworks)
- Authentication: Google OAuth 2.0
- UI: Tailwind CSS + Lucide Icons

## Design Principles (S-Tier Trading Dashboard)

### Core Design Philosophy
- **Users First:** Prioritize trader needs, workflows, and ease of use. Trading decisions require clarity and speed.
- **Meticulous Craft:** Precision and polish in every UI element. Financial data requires absolute accuracy.
- **Speed & Performance:** Fast load times and snappy interactions. Every millisecond counts in trading.
- **Simplicity & Clarity:** Clean, uncluttered interface. Market data must be unambiguous and immediately actionable.
- **Focus & Efficiency:** Help traders achieve goals quickly with minimal friction. Reduce decision fatigue.
- **Consistency:** Uniform design language across the entire dashboard. Financial interfaces require predictability.
- **Accessibility (WCAG AA+):** Ensure sufficient contrast, keyboard navigation, and screen reader compatibility.
- **Opinionated Design:** Clear, efficient default workflows for common trading tasks.

### Design System Foundation

**Color Palette:**
- **Primary Brand Color:** Strategic use in CTAs and key highlights
- **Neutrals:** Gray scale for text, backgrounds, borders (5-7 steps)
- **Semantic Colors:**
  - Success: Green (#10B981) - profits, successful orders, positive P&L
  - Error/Destructive: Red (#EF4444) - losses, failed orders, negative P&L
  - Warning: Amber (#F59E0B) - alerts, margin warnings, risk thresholds
  - Informational: Blue (#3B82F6) - info, pending orders, neutral data
- **Dark Mode:** Corresponding accessible palette for low-light trading environments

**Typography:**
- **Primary Font:** Inter or system-ui (clean, legible at small sizes)
- **Scale:** H1 (32px), H2 (24px), H3 (20px), Body (16px), Small (14px), Caption (12px)
- **Weights:** Regular (400), Medium (500), SemiBold (600), Bold (700)
- **Line Height:** 1.5-1.7 for body text readability

**Spacing:**
- **Base Unit:** 8px
- **Scale:** 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px

**Border Radii:**
- Small: 4-6px (inputs, buttons)
- Medium: 8-12px (cards, modals)

**Core UI Components:**
- Buttons (primary, secondary, ghost, destructive, icon-only)
- Input fields with clear labels, placeholders, validation states
- Data tables with sorting, filtering, pagination
- Cards for P&L widgets, positions, orders
- Modals for trade confirmations and settings
- Navigation (sidebar, tabs, breadcrumbs)
- Status badges (profit, loss, pending, completed)
- Tooltips for complex trading terms
- Progress indicators for order execution

### Layout & Visual Hierarchy

**Dashboard Layout:**
- **Persistent Left Sidebar:** Primary navigation (Dashboard, Watchlists, Orders, Positions, Instances)
- **Content Area:** Module-specific interfaces with flexible grid
- **Top Bar:** User profile, notifications, global search, connection status
- **Responsive:** Mobile-friendly, but optimized for desktop trading

**Visual Hierarchy for Trading Data:**
- **P&L Prominence:** Total P&L highly visible, color-coded (green/red)
- **Critical Alerts:** Warning states for margin calls, risk thresholds
- **Data Density:** Efficient use of space for tables and lists
- **Zebra Striping:** For order/position tables to improve scanability

### Trading-Specific UI Guidelines

**P&L Display:**
- Real-time updates with smooth transitions
- Large, prominent display of total P&L
- Individual symbol P&L with clear positive/negative indicators
- Percentage changes alongside absolute values

**Order Management:**
- Clear status indicators (pending, filled, cancelled)
- Color-coded by status (blue/green/red/amber)
- Quick action buttons (view, cancel) per row
- Bulk actions for managing multiple orders

**Watchlist Features:**
- Visual symbol indicators (up/down arrows, percentage change)
- Quick-add functionality with autocomplete
- Color coding for price movements
- Sortable columns (symbol, LTP, change, P&L)

**Risk Indicators:**
- Prominent display of risk metrics
- Threshold warnings with clear visual cues
- Margin status and available capital
- Auto-switch mode status per instance

### Interaction Design

**Micro-interactions:**
- Hover states on interactive elements (150-200ms)
- Loading spinners for API calls
- Smooth transitions for modal appearances
- Immediate visual feedback for button clicks
- Keyboard shortcuts for power users (e.g., Ctrl+K for search)

**Real-time Updates:**
- Subtle animations for live P&L changes
- Blink/flash for significant price movements (optional, user-controlled)
- Non-intrusive notifications for order updates
- Progress indicators for order execution

**Form Design:**
- Clear validation messages
- Auto-focus on first field
- Smart defaults based on context
- Inline help text for complex fields

### CSS & Styling Architecture

**Utility-First (Tailwind CSS):**
```css
/* Use utility classes for consistent spacing */
.p-4 { padding: 1rem; }
.mt-6 { margin-top: 1.5rem; }

/* Semantic color classes */
.text-profit { color: #10B981; }
.text-loss { color: #EF4444; }
.bg-profit-bg { background-color: rgba(16, 185, 129, 0.1); }
```

**Design Tokens in Tailwind Config:**
```javascript
colors: {
  primary: { /* brand color */ },
  neutral: { /* gray scale */ },
  profit: '#10B981',
  loss: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6'
}
```

**Component Patterns:**
- Consistent card styling for widgets
- Reusable button variants
- Standardized form layouts
- Modular table components

### Best Practices

**Data Display:**
- Right-align numeric data for easy comparison
- Use thousand separators for large numbers
- Consistent decimal places for prices
- Clear date/time formatting with timezone awareness

**Performance:**
- Virtual scrolling for large data sets
- Debounced search inputs
- Lazy loading for non-critical sections
- Efficient re-renders (minimize DOM updates)

**Accessibility:**
- ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader announcements for critical updates
- High contrast mode support
- Focus indicators for all focusable elements

**Error Handling:**
- Clear error messages in plain language
- Graceful degradation when APIs fail
- Retry mechanisms for failed requests
- Offline state indicators

**Responsive Design:**
- Mobile-first approach
- Touch-friendly button sizes (44px minimum)
- Collapsible sidebar on mobile
- Horizontal scrolling for wide tables (with column prioritization)

### Design Review Process

Before merging UI changes:
1. **Visual Polish:** Check spacing, alignment, typography
2. **Responsive Design:** Test desktop (1440px), tablet (768px), mobile (375px)
3. **Accessibility:** Verify keyboard navigation and contrast ratios
4. **Trading Workflows:** Ensure common tasks remain fast and intuitive
5. **Performance:** Check for janky animations or slow loading
6. **Error States:** Test error handling and edge cases

## Essential Development Commands

### Backend (cd backend)
```bash
# Development
npm start              # Start server
npm run dev            # Start with nodemon auto-restart

# Testing
npm test               # Run all tests
npm test -- test/pnl.test.js  # Run specific test file

# Linting
npm run lint           # Lint all JavaScript files

# Database
npm run db:check       # List database tables
npm run db:schema      # Show database schema

# Production (PM2)
npm run pm2:start      # Start with PM2
npm run pm2:stop       # Stop application
npm run pm2:restart    # Restart
npm run pm2:logs       # View logs
npm run pm2:status     # Show PM2 status
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  frontend/ (Vanilla JS)                                    │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Dashboard UI │  │  API Tester  │  │   Auth Tester   │ │
│  │  (3,829 lines)│  │              │  │                 │ │
│  └───────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  backend/server.js (1,070 lines)                           │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │ Auth (OAuth) │ │  WebSocket   │ │   Cron Jobs       │ │
│  └──────────────┘ └──────────────┘ └────────────────────┘ │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │   Routes (7) │ │   Lib (14)   │ │  Configuration     │ │
│  │  - watchlist │ │  - pnl.js    │ │  - auth.js         │ │
│  │  - orders    │ │  - account   │ │  - .env            │ │
│  │  - positions │ │  - alert     │ │  - OAuth creds     │ │
│  │  - symbols   │ │  - websocket │ │                    │ │
│  │  - options   │ │  - order-*   │ │                    │ │
│  │  - instance  │ │  - rate-limit│ │                    │ │
│  │  - websocket │ │  - position  │ │                    │ │
│  └──────────────┘ └──────────────┘ └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  SQLite Database                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐ │
│  │ instances   │ │ watchlists  │ │ watchlist_symbols     │ │
│  │ - P&L data  │ │ - metadata  │ │ - symbol config       │ │
│  │ - config    │ │ - status    │ │ - trading rules       │ │
│  │ - health    │ │             │ │                       │ │
│  └─────────────┘ └─────────────┘ └───────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐ │
│  │ users       │ │ orders      │ │ rate_limits           │ │
│  │ - auth      │ │ - tracking  │ │ - per-instance caps   │ │
│  │ - roles     │ │ - history   │ │                       │ │
│  └─────────────┘ └─────────────┘ └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  External APIs                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐ │
│  │  OpenAlgo    │ │  Market Data │ │    WebSocket        │ │
│  │  /tradebook  │ │  Providers   │ │    Feeds            │ │
│  │  /position   │ │              │ │                     │ │
│  │  /orders     │ │              │ │                     │ │
│  │  /ping       │ │              │ │                     │ │
│  └──────────────┘ └──────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**Backend Server (server.js:1-1070)**
- Express app with security middleware (helmet, cors, compression)
- Google OAuth authentication with SQLite sessions
- WebSocket support via Socket.IO
- Cron jobs for health checks and P&L updates
- Rate limiting per instance

**Route Modules (routes/ directory)**
- `watchlist.js` - CRUD for watchlists and symbol management
- `orders.js` - Order tracking and management
- `positions.js` - Position book and P&L
- `symbols.js` - Symbol validation and search
- `options.js` - Options trading features
- `instance-config.js` - Instance management
- `websocket-status.js` - WebSocket connectivity

**Business Logic (lib/ directory)**
- `pnl.js` - Realized/unrealized P&L calculations
- `account-pnl.js` - P&L aggregation from multiple sources
- `order-placement-service.js` - Order execution logic
- `order-status-tracker.js` - Real-time order monitoring
- `websocket-manager.js` - WebSocket connection management
- `rate-limiter.js` - Token bucket rate limiting
- `alert-service.js` - Notification system
- `position-manager.js` - Position tracking
- `rule-evaluator.js` - Trading rule engine
- `market-data-processor.js` - Data normalization
- `options-trading-service.js` - Options-specific logic
- `quantity-resolver-v2.js` - Position sizing
- `openalgo-search.js` - Symbol search

**Frontend (public/)**
- `dashboard.html` (1,547 lines) - Complete UI in single file
- `dashboard.js` (3,829 lines) - All frontend logic
- `api-explorer.html` - API testing tool
- `test-auth.html` - Authentication testing

## File Structure

```
SimplifyedAdmin/
├── backend/                      # Node.js backend
│   ├── server.js                # Main server (1,070 lines)
│   ├── auth.js                  # OAuth configuration
│   ├── routes/                  # API endpoints (7 files)
│   ├── lib/                     # Business logic (14 files)
│   ├── public/                  # Frontend assets
│   │   ├── dashboard.html       # UI (1,547 lines)
│   │   ├── dashboard.js         # Frontend logic (3,829 lines)
│   │   ├── api-explorer.html    # API testing tool
│   │   └── test-auth.html       # Auth testing
│   ├── test/                    # Test files (6 files)
│   ├── database/                # SQLite DB files
│   ├── package.json             # Dependencies & scripts
│   └── .env                     # Environment config
├── docs/                        # Comprehensive documentation
│   ├── CLAUDE.md                # Full technical docs (643 lines)
│   ├── API_QUICK_REFERENCE.md   # API endpoints
│   ├── DATABASE_SCHEMA.md       # Database schema
│   └── DEPLOYMENT.md            # Production deployment
├── Requirements/                # System requirements docs
└── README.md                    # Project overview
```

## Database Schema (SQLite)

**Core Tables:**

`instances` - Trading instance configurations and P&L
- Stores: name, host, api_key, broker, strategy_tag
- Financial: current_balance, realized_pnl, unrealized_pnl, total_pnl
- Controls: target_profit, target_loss, is_analyzer_mode, is_active
- Health: health_status, last_health_check

`watchlists` - Watchlist metadata
- id, name, description, is_active, timestamps

`watchlist_symbols` - Symbol configurations per watchlist
- watchlist_id (FK), exchange, symbol, token
- Trading config: qty_type/value, target_type/value, sl_type/value
- Rules: product_type, order_type, max_position_size

`orders` - Order tracking and history
- instance_id, order_id, symbol, side, quantity, price, status
- metadata, timestamps

`users` - Authentication and roles
- email, is_admin, created_at

## P&L Calculation

**Realized P&L** (`lib/pnl.js:1-200`):
```javascript
// Groups trades by symbol, calculates avg buy/sell, computes closed P&L
calculateRealizedPnL(trades) → { symbol: pnlAmount, ... }
```

**Unrealized P&L** (`lib/pnl.js:200-300`):
```javascript
// Maps position P&L directly from positionbook
calculateUnrealizedPnL(positions) → { symbol: pnlAmount, ... }
```

**Total P&L** (`lib/account-pnl.js:1-100`):
```javascript
// Combines realized + unrealized for complete picture
getAccountPnL(instance) → {
  accountTotals: { realized_pnl, unrealized_pnl, total_pnl },
  symbolBreakdown: { realizedPnL, unrealizedPnL }
}
```

## API Endpoints

**Authentication:**
- `GET /auth/google` - OAuth login
- `GET /auth/google/callback` - OAuth callback
- `GET /api/user` - Current user

**Instances:**
- `GET /api/instances` - List with P&L
- `POST /api/instances` - Create
- `PUT /api/instances/:id` - Update
- `DELETE /api/instances/:id` - Remove
- `POST /api/instances/:id/analyzer-toggle` - Toggle mode
- `POST /api/instances/:id/safe-switch` - Safe switch workflow

**Watchlists:**
- `GET /api/watchlists` - List all
- `POST /api/watchlists` - Create
- `PUT /api/watchlists/:id` - Update
- `DELETE /api/watchlists/:id` - Delete
- `POST /api/watchlists/:id/clone` - Clone
- `GET /api/watchlists/:id/export` - CSV export
- `POST /api/watchlists/:id/import` - CSV import
- `POST /api/watchlists/:id/instances` - Assign instances

**Orders:**
- `GET /api/orders` - List with filters
- `GET /api/orders/:id` - Details
- `POST /api/orders/:id/cancel` - Cancel

**Positions:**
- `GET /api/positions` - Get positions
- `GET /api/positions/summary` - P&L summary

## Testing

**Test Framework:** Node.js built-in test runner (`node:test`)

**Test Files:**
- `test/pnl.test.js` - P&L calculation logic
- `test/accountPnl.test.js` - P&L aggregation
- `test/orderPlacementCapital.test.js` - Order placement
- `test/symbolValidation.test.js` - Symbol validation
- `test/marketDataProcessor.test.js` - Data processing
- `test/updateInstances.test.js` - Instance updates

**Run Tests:**
```bash
cd backend && npm test           # All tests
npm test -- pnl.test.js          # Specific test
```

## Configuration

**Environment (backend/.env):**
```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
SESSION_SECRET=<required>
GOOGLE_CLIENT_ID=<required>
GOOGLE_CLIENT_SECRET=<required>
```

**Google OAuth:**
- Place credentials as: `backend/client_secret_SimplifyedAdmin.apps.googleusercontent.com.json`
- Redirect URIs:
  - Development: `http://localhost:3000/auth/google/callback`
  - Production: `https://yourdomain.com/auth/google/callback`

## Key Implementation Details

**Real-time Updates:**
- Dashboard polling: 30-second intervals
- Order tracking: 5-second intervals
- Health checks: 20-minute intervals (cron)

**Rate Limiting:**
- Token bucket algorithm per instance
- Configurable limits via `lib/rate-limiter.js:1-100`
- Prevents API abuse

**Auto-Switch Logic:**
- Monitors total_pnl against target_profit/target_loss
- Safe closure process: close positions → cancel orders → toggle analyzer mode
- Configurable per instance

**WebSocket Features:**
- Real-time order updates
- Instance health monitoring
- Live P&L streaming (future enhancement)

## Important Files for Development

- **Server Entry:** `backend/server.js:1-100` - Express setup, middleware, routes
- **Database Init:** `backend/server.js:96-150` - SQLite initialization
- **Auth Setup:** `backend/auth.js:1-50` - Google OAuth configuration
- **P&L Core:** `backend/lib/pnl.js:1-100` - Calculation functions
- **Dashboard UI:** `backend/public/dashboard.html:1-200` - UI structure
- **Frontend Logic:** `backend/public/dashboard.js:1-100` - State management
- **Test Examples:** `backend/test/pnl.test.js:1-20` - Test patterns

## Documentation References

For detailed information, see:
- **Full Technical Docs:** `/docs/CLAUDE.md` (comprehensive 643-line guide)
- **API Reference:** `/docs/API_QUICK_REFERENCE.md`
- **Database Schema:** `/docs/DATABASE_SCHEMA.md`
- **Deployment Guide:** `/docs/DEPLOYMENT.md`
- **Project Overview:** `README.md`

## Access Points

- **Dashboard:** http://localhost:3000/dashboard.html
- **API Explorer:** http://localhost:3000/api-explorer.html
- **Auth Tester:** http://localhost:3000/test-auth.html

First login becomes admin automatically via `/backend/auth.js:200-250`.

---

**Version:** 2.1.0
**Last Updated:** November 2025
