# Simplifyed Trading Dashboard

A modern web application for managing and monitoring OpenAlgo trading instances with real-time data updates and Google OAuth authentication.

## 🚀 Features

- **Google OAuth Authentication** - Secure login with Google accounts
- **Instance Management** - Add, edit, delete, and monitor trading instances
- **Real-time Data Updates** - Automatic updates every 2 minutes via cron jobs
- **OpenAlgo Integration** - Direct API integration with OpenAlgo trading platforms
- **Dashboard Analytics** - Visual representation of P&L, balances, and performance
- **Modern UI** - Clean, responsive interface built with Tailwind CSS

## 📁 Project Structure

```
SimplifyedAdmin/
├── backend/                    # Node.js Express backend
│   ├── server.js              # Main server file
│   ├── auth.js                # Google OAuth configuration
│   ├── package.json           # Backend dependencies
│   ├── ecosystem.config.js    # PM2 configuration
│   └── database/              # SQLite databases
│       ├── simplifyed.db      # Main application data
│       └── sessions.db        # Session storage
├── frontend/                  # Static HTML frontend
│   ├── index.html            # Main dashboard interface
│   └── app.js                # Frontend JavaScript logic
└── README.md                 # This file
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js (v16 or higher)
- Python 3 (for frontend static server)
- Google OAuth credentials

### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Download the credentials file as `client_secret_SimplifyedAdmin.apps.googleusercontent.com.json`
6. Place the file in the `backend/` directory

### 2. Backend Setup

```bash
cd backend
npm install
```

### 3. Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:8080
SESSION_SECRET=your-session-secret-here
```

## 🚀 Running the Application

### Development Mode

1. **Start Backend Server**
```bash
cd backend
npm start
# or for development with auto-restart
npm run dev
```

2. **Start Frontend Server**
```bash
cd frontend
python3 -m http.server 8080
```

3. **Access the Application**
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/api
- Google Auth: http://localhost:3000/auth/google

### Production Mode with PM2

```bash
cd backend
npm run pm2:start
```

## 📊 Database Schema

The application uses SQLite with the following main table:

### Instances Table
```sql
CREATE TABLE instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host_url TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL,
    strategy_tag TEXT,
    target_profit REAL DEFAULT 5000,
    target_loss REAL DEFAULT 2000,
    current_pnl REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    is_analyzer_mode BOOLEAN DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔌 API Endpoints

### Authentication
- `GET /api/user` - Get current user info
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/logout` - Logout user

### Instances Management
- `GET /api/instances` - List all instances (auth required)
- `POST /api/instances` - Create new instance (auth required)
- `PUT /api/instances/:id` - Update instance (auth required)
- `DELETE /api/instances/:id` - Delete instance (auth required)

### Health Check
- `GET /api/health` - Server health status

## 🔄 Automated Data Updates

The application automatically updates instance data every 2 minutes using node-cron:
- Fetches account balances via OpenAlgo API
- Calculates P&L from positions
- Updates database with latest information

## 🎨 Frontend Features

- **Responsive Dashboard** - Works on desktop and mobile
- **Real-time Updates** - Automatic data refresh
- **Instance Cards** - Visual representation of each trading instance
- **User Profile** - Google account integration
- **Loading States** - Smooth user experience with loading indicators

## 🔧 PM2 Management Commands

```bash
# Start application
npm run pm2:start

# Stop application
npm run pm2:stop

# Restart application
npm run pm2:restart

# View logs
npm run pm2:logs

# Delete from PM2
npm run pm2:delete
```

## 🛡️ Security Features

- Google OAuth 2.0 authentication
- Session-based authentication with secure cookies
- CORS protection
- Helmet.js security headers
- Input validation on all endpoints
- SQL injection protection with parameterized queries

## 📝 Development Notes

- Frontend uses vanilla JavaScript with Tailwind CSS for styling
- Backend uses Express.js with SQLite for data persistence
- Authentication sessions stored in SQLite
- Real-time updates via scheduled cron jobs
- Production-ready with PM2 process management

## 🔍 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3001 and 8082 are available
2. **Google OAuth errors**: Check credentials file path and permissions
3. **Database issues**: Ensure database directory has write permissions
4. **CORS errors**: Verify FRONTEND_URL matches your frontend server

### Logs

- Backend logs: Available via PM2 logs or console output
- Frontend logs: Check browser console
- Database: SQLite files in `backend/database/`

## 📄 License

This project is for educational and development purposes.