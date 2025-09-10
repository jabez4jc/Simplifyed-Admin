import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cron from 'node-cron';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';
import { configureAuth, setupAuthRoutes, requireAuth } from './auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Ensure database directory exists
const dbDir = join(__dirname, 'database');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(join(dbDir, 'simplifyed.db'));

// Promise wrapper for database operations
const dbAsync = {
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  })
};

// Initialize database schema
async function initializeDatabase() {
  try {
    await dbAsync.run(`
      CREATE TABLE IF NOT EXISTS instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        host_url TEXT NOT NULL UNIQUE,
        api_key TEXT NOT NULL,
        strategy_tag TEXT,
        target_profit REAL DEFAULT 5000,
        target_loss REAL DEFAULT 2000,
        current_pnl REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        is_analyzer_mode BOOLEAN DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbAsync.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add migration for new P&L columns if they don't exist
    try {
      await dbAsync.run('ALTER TABLE instances ADD COLUMN realized_pnl REAL DEFAULT 0');
      console.log('✅ Added realized_pnl column to instances table');
    } catch (error) {
      // Column already exists, ignore error
    }

    try {
      await dbAsync.run('ALTER TABLE instances ADD COLUMN unrealized_pnl REAL DEFAULT 0');
      console.log('✅ Added unrealized_pnl column to instances table');
    } catch (error) {
      // Column already exists, ignore error
    }

    try {
      await dbAsync.run('ALTER TABLE instances ADD COLUMN total_pnl REAL DEFAULT 0');
      console.log('✅ Added total_pnl column to instances table');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
}

// Configure authentication
configureAuth(app, __dirname, dbAsync);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup auth routes
setupAuthRoutes(app);

// API Routes
app.get('/api/user', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      // Check if user is admin
      const userEmail = req.user.emails[0].value;
      const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
      
      res.json({ 
        authenticated: true, 
        user: req.user,
        isAdmin: currentUser ? Boolean(currentUser.is_admin) : false
      });
    } catch (error) {
      console.error('Error checking user admin status:', error);
      res.json({ 
        authenticated: true, 
        user: req.user,
        isAdmin: false
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/api/instances', requireAuth, async (req, res) => {
  try {
    const instances = await dbAsync.all('SELECT * FROM instances ORDER BY created_at DESC');
    res.json(instances);
  } catch (error) {
    console.error('Error fetching instances:', error);
    res.status(500).json({ error: 'Failed to fetch instances' });
  }
});

app.post('/api/instances', requireAuth, async (req, res) => {
  try {
    const { name, host_url, api_key, strategy_tag } = req.body;
    
    if (!name || !host_url || !api_key) {
      return res.status(400).json({ error: 'Name, host_url, and api_key are required' });
    }

    const result = await dbAsync.run(
      'INSERT INTO instances (name, host_url, api_key, strategy_tag) VALUES (?, ?, ?, ?)',
      [name, host_url, api_key, strategy_tag]
    );

    const newInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [result.lastID]);
    
    // Immediately try to update the new instance data
    setTimeout(() => {
      updateInstancesData();
    }, 1000);
    
    res.status(201).json(newInstance);
  } catch (error) {
    console.error('Error creating instance:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Instance with this host URL already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create instance' });
    }
  }
});

app.put('/api/instances/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    
    await dbAsync.run(
      `UPDATE instances SET ${fields}, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    res.json(updatedInstance);
  } catch (error) {
    console.error('Error updating instance:', error);
    res.status(500).json({ error: 'Failed to update instance' });
  }
});

app.delete('/api/instances/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await dbAsync.run('DELETE FROM instances WHERE id = ?', [id]);
    res.json({ message: 'Instance deleted successfully' });
  } catch (error) {
    console.error('Error deleting instance:', error);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test connection endpoint
app.post('/api/test-connection', requireAuth, async (req, res) => {
  try {
    const { host_url, api_key } = req.body;
    
    if (!host_url || !api_key) {
      return res.status(400).json({ error: 'host_url and api_key are required' });
    }

    // Create temporary instance object for testing
    const testInstance = { host_url, api_key };
    
    // Test connection using ping endpoint
    const result = await makeOpenAlgoRequest(testInstance, 'ping');
    
    if (result.status === 'success') {
      res.json({ 
        status: 'success', 
        message: 'Connection successful',
        broker: result.data?.broker || 'unknown',
        data: result.data
      });
    } else {
      res.status(400).json({ 
        status: 'error', 
        message: 'Connection failed',
        details: result
      });
    }
  } catch (error) {
    console.error('Test connection error:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// Toggle analyzer mode for instance with Safe-Switch Workflow
app.post('/api/instances/:id/toggle-analyzer', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { mode } = req.body; // true for analyzer, false for live
    
    const instance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // If switching to analyzer mode (Live → Analyzer), follow Safe-Switch Workflow
    if (mode === true) {
      console.log(`🔄 Starting Safe-Switch Workflow for instance ${instance.id}: Live → Analyzer`);
      
      try {
        // Initialize result variables
        let closeResult = null;
        let cancelResult = null;
        
        // Step 1: Close all open positions
        console.log(`Step 1: Closing all open positions for instance ${instance.id}`);
        const closePayload = {};
        if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
          closePayload.strategy = instance.strategy_tag;
        }
        try {
          closeResult = await makeOpenAlgoRequest(instance, 'closeposition', 'POST', closePayload);
          console.log(`Step 1 result:`, closeResult);
        } catch (closeError) {
          console.log(`Step 1 warning: Could not close positions - ${closeError.message}`);
          console.log(`Step 1 continuing: Likely no positions to close`);
        }
        
        // Step 2: Cancel all pending orders
        console.log(`Step 2: Canceling all orders for instance ${instance.id}`);
        const cancelPayload = {};
        if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
          cancelPayload.strategy = instance.strategy_tag;
        }
        try {
          cancelResult = await makeOpenAlgoRequest(instance, 'cancelallorder', 'POST', cancelPayload);
          console.log(`Step 2 result:`, cancelResult);
        } catch (cancelError) {
          console.log(`Step 2 warning: Could not cancel orders - ${cancelError.message}`);
          console.log(`Step 2 continuing: Likely no orders to cancel`);
        }
        
        // Step 3: Confirm no open or pending orders in positionbook
        console.log(`Step 3: Confirming no open positions for instance ${instance.id}`);
        const positionCheck = await makeOpenAlgoRequest(instance, 'positionbook');
        
        // Check if there are still open positions
        if (positionCheck.status === 'success' && 
            positionCheck.data && 
            positionCheck.data.positions && 
            positionCheck.data.positions.length > 0) {
          const openPositions = positionCheck.data.positions.filter(pos => 
            parseFloat(pos.netqty || 0) !== 0
          );
          
          if (openPositions.length > 0) {
            console.log(`❌ Step 3 failed: ${openPositions.length} positions still open`);
            return res.status(400).json({
              status: 'error',
              message: `Cannot switch to analyzer mode: ${openPositions.length} positions still open`,
              openPositions: openPositions.length
            });
          }
        }
        console.log(`✅ Step 3 confirmed: No open positions`);
        
        // Step 4: Toggle analyzer mode
        console.log(`Step 4: Enabling analyzer mode for instance ${instance.id}`);
        const toggleResult = await makeOpenAlgoRequest(instance, 'analyzer/toggle', 'POST', { mode: true });
        
        if (toggleResult.status !== 'success') {
          throw new Error(`Failed to enable analyzer mode: ${toggleResult.message || 'Unknown error'}`);
        }
        console.log(`Step 4 result:`, toggleResult);
        
        // Step 5: Verify analyzer mode is active
        console.log(`Step 5: Verifying analyzer mode for instance ${instance.id}`);
        const verifyResult = await makeOpenAlgoRequest(instance, 'analyzer');
        
        if (verifyResult.status !== 'success' || 
            !verifyResult.data || 
            verifyResult.data.mode !== 'analyze') {
          throw new Error('Failed to verify analyzer mode activation');
        }
        console.log(`✅ Safe-Switch Workflow completed successfully for instance ${instance.id}`);
        
        // Update database with new mode
        await dbAsync.run(
          'UPDATE instances SET is_analyzer_mode = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        
        const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
        res.json({
          status: 'success',
          message: 'Safe-Switch Workflow completed: Instance switched to analyzer mode',
          instance: updatedInstance,
          workflow: {
            step1_close: closeResult,
            step2_cancel: cancelResult,
            step3_verify: 'No open positions confirmed',
            step4_toggle: toggleResult,
            step5_confirm: verifyResult
          }
        });
        
      } catch (workflowError) {
        console.error(`❌ Safe-Switch Workflow failed for instance ${instance.id}:`, workflowError.message);
        res.status(500).json({
          status: 'error',
          message: `Safe-Switch Workflow failed: ${workflowError.message}`,
          error: workflowError.message
        });
      }
      
    } else {
      // Switching to live mode (Analyzer → Live) - Simple toggle
      console.log(`🔄 Switching instance ${instance.id} to Live mode`);
      const result = await makeOpenAlgoRequest(instance, 'analyzer/toggle', 'POST', { mode: false });
      
      if (result.status === 'success') {
        await dbAsync.run(
          'UPDATE instances SET is_analyzer_mode = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        
        const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
        res.json({
          status: 'success',
          message: 'Instance switched to live mode',
          instance: updatedInstance,
          data: result.data
        });
      } else {
        res.status(400).json({
          status: 'error',
          message: 'Failed to switch to live mode',
          details: result
        });
      }
    }
  } catch (error) {
    console.error('Toggle analyzer error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle analyzer mode',
      error: error.message
    });
  }
});

// Get instance analyzer status
app.get('/api/instances/:id/analyzer-status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const instance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Get analyzer status from OpenAlgo API
    const result = await makeOpenAlgoRequest(instance, 'analyzer');
    
    if (result.status === 'success') {
      res.json({ 
        status: 'success',
        data: result.data
      });
    } else {
      res.status(400).json({ 
        status: 'error', 
        message: 'Failed to get analyzer status',
        details: result
      });
    }
  } catch (error) {
    console.error('Get analyzer status error:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get analyzer status',
      error: error.message
    });
  }
});

// Manual refresh instance data endpoint
app.post('/api/refresh-instances', requireAuth, async (req, res) => {
  try {
    console.log('🔄 Manual refresh triggered by user');
    await updateInstancesData();
    
    // Return updated instances
    const instances = await dbAsync.all('SELECT * FROM instances ORDER BY created_at DESC');
    res.json({ 
      status: 'success',
      message: 'Instances refreshed successfully',
      instances 
    });
  } catch (error) {
    console.error('Manual refresh error:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to refresh instances',
      error: error.message
    });
  }
});

// User Management API Routes

// Get all users
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = req.user.emails[0].value;
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const users = await dbAsync.all('SELECT email, is_admin, created_at FROM users ORDER BY created_at ASC');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Add user
app.post('/api/users', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = req.user.emails[0].value;
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if user already exists
    const existingUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    await dbAsync.run('INSERT INTO users (email) VALUES (?)', [email.toLowerCase()]);
    
    const newUser = await dbAsync.get('SELECT email, is_admin, created_at FROM users WHERE email = ?', [email.toLowerCase()]);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Remove user
app.delete('/api/users/:email', requireAuth, async (req, res) => {
  try {
    // Check if user is first user (admin) or is admin
    const userEmail = req.user.emails[0].value;
    const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
    
    if (!currentUser || !currentUser.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const { email } = req.params;
    
    // Prevent removing the first user (admin)
    const targetUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [email]);
    if (targetUser && targetUser.is_admin) {
      return res.status(400).json({ error: 'Cannot remove admin user' });
    }
    
    await dbAsync.run('DELETE FROM users WHERE email = ?', [email]);
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// Make OpenAlgo API request function
async function makeOpenAlgoRequest(instance, endpoint, method = 'POST', data = {}) {
  const url = `${instance.host_url.replace(/\/$/, '')}/api/v1/${endpoint}`;
  const payload = { apikey: instance.api_key, ...data };
  
  console.log(`🔍 Making OpenAlgo request to: ${url}`);
  console.log(`🔍 Payload:`, JSON.stringify(payload, null, 2));
  
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Comprehensive P&L Calculation Functions (based on your Python logic)

// Calculate realized P&L from completed trades
function calculateRealizedPnL(trades) {
  const grouped = {};

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

// Calculate unrealized P&L from open positions
function calculateUnrealizedPnL(positions) {
  const unrealizedPnL = {};
  for (let position of positions) {
    unrealizedPnL[position.symbol] = parseFloat(position.pnl || 0);
  }
  return unrealizedPnL;
}

// Get comprehensive account P&L for an instance
async function getAccountPnL(instance) {
  try {
    // Get tradebook data for realized P&L
    const tradesResp = await makeOpenAlgoRequest(instance, 'tradebook');
    const trades = (tradesResp.status === 'success' && tradesResp.data && tradesResp.data.trades) 
      ? tradesResp.data.trades : [];

    // Get positionbook data for unrealized P&L  
    const positionsResp = await makeOpenAlgoRequest(instance, 'positionbook');
    const positions = (positionsResp.status === 'success' && positionsResp.data && positionsResp.data.positions) 
      ? positionsResp.data.positions : [];

    // Calculate P&L components
    const realized = calculateRealizedPnL(trades);
    const unrealized = calculateUnrealizedPnL(positions);

    // Combine and consolidate
    const symbols = new Set([...Object.keys(realized), ...Object.keys(unrealized)]);
    const perSymbol = [];
    let totalRealized = 0, totalUnrealized = 0;

    for (let symbol of symbols) {
      const r = realized[symbol] || 0;
      const u = unrealized[symbol] || 0;
      perSymbol.push({ 
        symbol, 
        realized_pnl: r, 
        unrealized_pnl: u, 
        total_pnl: r + u 
      });
      totalRealized += r;
      totalUnrealized += u;
    }

    const accountTotals = {
      realized_pnl: totalRealized,
      unrealized_pnl: totalUnrealized,
      total_pnl: totalRealized + totalUnrealized
    };

    return { perSymbol, accountTotals };
  } catch (error) {
    console.error(`❌ Error calculating P&L for instance ${instance.id}:`, error.message);
    // Fallback to basic calculation if comprehensive fails
    try {
      const positionsResp = await makeOpenAlgoRequest(instance, 'positionbook');
      const fallbackPnL = (positionsResp.status === 'success' && positionsResp.data && positionsResp.data.positions) 
        ? positionsResp.data.positions.reduce((total, pos) => total + parseFloat(pos.pnl || 0), 0)
        : 0;
      
      return {
        perSymbol: [],
        accountTotals: {
          realized_pnl: 0,
          unrealized_pnl: fallbackPnL,
          total_pnl: fallbackPnL
        }
      };
    } catch (fallbackError) {
      console.error(`❌ Fallback P&L calculation failed for instance ${instance.id}:`, fallbackError.message);
      return {
        perSymbol: [],
        accountTotals: {
          realized_pnl: 0,
          unrealized_pnl: 0,
          total_pnl: 0
        }
      };
    }
  }
}

// Update instances data periodically (Every 30s: Fund balance, P&L, check targets)
async function updateInstancesData() {
  try {
    const instances = await dbAsync.all('SELECT * FROM instances WHERE is_active = 1');
    
    for (const instance of instances) {
      try {
        // Get account info (fund balance)
        const accountInfo = await makeOpenAlgoRequest(instance, 'funds');
        
        if (accountInfo.status === 'success') {
          const balance = parseFloat(accountInfo.data?.availablecash || 0);
          
          // Get comprehensive P&L calculation (realized + unrealized)
          const pnlData = await getAccountPnL(instance);
          const { realized_pnl, unrealized_pnl, total_pnl } = pnlData.accountTotals;

          // Check profit/loss targets and auto-switch to analyzer if needed
          const targetProfit = parseFloat(instance.target_profit) || 5000;
          const targetLoss = parseFloat(instance.target_loss) || 2000;
          
          if (total_pnl >= targetProfit && !instance.is_analyzer_mode) {
            console.log(`🎯 Target profit reached for instance ${instance.id}: ₹${total_pnl} >= ₹${targetProfit}`);
            console.log(`   📊 Breakdown: Realized ₹${realized_pnl}, Unrealized ₹${unrealized_pnl}`);
            console.log(`🔄 Auto-switching instance ${instance.id} to analyzer mode...`);
            await autoSwitchToAnalyzer(instance, 'Target profit reached');
          } else if (total_pnl <= -Math.abs(targetLoss) && !instance.is_analyzer_mode) {
            console.log(`🛑 Max loss reached for instance ${instance.id}: ₹${total_pnl} <= ₹${-Math.abs(targetLoss)}`);
            console.log(`   📊 Breakdown: Realized ₹${realized_pnl}, Unrealized ₹${unrealized_pnl}`);
            console.log(`🔄 Auto-switching instance ${instance.id} to analyzer mode...`);
            await autoSwitchToAnalyzer(instance, 'Max loss reached');
          }

          // Update database with comprehensive P&L data
          await dbAsync.run(
            'UPDATE instances SET current_balance = ?, current_pnl = ?, realized_pnl = ?, unrealized_pnl = ?, total_pnl = ?, is_active = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            [balance, total_pnl, realized_pnl, unrealized_pnl, total_pnl, instance.id]
          );
          
          console.log(`✅ Updated instance ${instance.id}: Balance ₹${balance}, Total P&L ₹${total_pnl} (Realized: ₹${realized_pnl}, Unrealized: ₹${unrealized_pnl})`);
        }
      } catch (error) {
        console.error(`❌ Error updating instance ${instance.id}:`, error.message);
        
        // Mark instance as inactive if connection failed
        await dbAsync.run(
          'UPDATE instances SET is_active = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [instance.id]
        );
      }
    }
  } catch (error) {
    console.error('❌ Error in updateInstancesData:', error);
  }
}

// Perform health checks (Every 20min: Ping instances)
async function performHealthChecks() {
  try {
    console.log('🏥 Performing health checks on all instances...');
    const instances = await dbAsync.all('SELECT * FROM instances');
    
    for (const instance of instances) {
      try {
        // Health check using ping endpoint
        const pingResult = await makeOpenAlgoRequest(instance, 'ping');
        
        if (pingResult.status === 'success') {
          // Instance is healthy - ensure it's marked as active
          await dbAsync.run(
            'UPDATE instances SET is_active = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            [instance.id]
          );
          console.log(`💚 Health check passed for instance ${instance.id} (${pingResult.data?.broker || 'unknown'})`);
        } else {
          throw new Error('Health check failed - ping unsuccessful');
        }
      } catch (error) {
        console.error(`💔 Health check failed for instance ${instance.id}:`, error.message);
        
        // Mark instance as inactive
        await dbAsync.run(
          'UPDATE instances SET is_active = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [instance.id]
        );
        
        // TODO: Alert admin via dashboard if unreachable > 2 retries (future enhancement)
      }
    }
  } catch (error) {
    console.error('❌ Error in performHealthChecks:', error);
  }
}

// Auto-switch instance to analyzer mode when targets are reached
async function autoSwitchToAnalyzer(instance, reason) {
  try {
    console.log(`🔄 Starting Auto Safe-Switch for instance ${instance.id}: ${reason}`);
    
    // Step 1: Close all open positions
    const closePayload = {};
    if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
      closePayload.strategy = instance.strategy_tag;
    }
    const closeResult = await makeOpenAlgoRequest(instance, 'closeposition', 'POST', closePayload);
    console.log(`Auto-switch Step 1 result:`, closeResult);
    
    // Step 2: Cancel all pending orders
    const cancelPayload = {};
    if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
      cancelPayload.strategy = instance.strategy_tag;
    }
    const cancelResult = await makeOpenAlgoRequest(instance, 'cancelallorder', 'POST', cancelPayload);
    console.log(`Auto-switch Step 2 result:`, cancelResult);
    
    // Step 3: Confirm no open positions
    const positionCheck = await makeOpenAlgoRequest(instance, 'positionbook');
    if (positionCheck.status === 'success' && 
        positionCheck.data && 
        positionCheck.data.positions && 
        positionCheck.data.positions.length > 0) {
      const openPositions = positionCheck.data.positions.filter(pos => 
        parseFloat(pos.netqty || 0) !== 0
      );
      
      if (openPositions.length > 0) {
        throw new Error(`${openPositions.length} positions still open after close attempt`);
      }
    }
    
    // Step 4: Toggle analyzer mode
    const toggleResult = await makeOpenAlgoRequest(instance, 'analyzer/toggle', 'POST', { mode: true });
    if (toggleResult.status !== 'success') {
      throw new Error('Failed to enable analyzer mode');
    }
    
    // Step 5: Verify analyzer mode
    const verifyResult = await makeOpenAlgoRequest(instance, 'analyzer');
    if (verifyResult.status !== 'success' || verifyResult.data?.mode !== 'analyze') {
      throw new Error('Failed to verify analyzer mode activation');
    }
    
    // Update database
    await dbAsync.run(
      'UPDATE instances SET is_analyzer_mode = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      [instance.id]
    );
    
    console.log(`✅ Auto Safe-Switch completed for instance ${instance.id}: ${reason}`);
    
  } catch (error) {
    console.error(`❌ Auto Safe-Switch failed for instance ${instance.id}:`, error.message);
  }
}

// Schedule instance data updates every 30 seconds (as per architecture requirements)
cron.schedule('*/30 * * * * *', updateInstancesData);

// Schedule health checks every 20 minutes (as per architecture requirements)
cron.schedule('*/20 * * * *', performHealthChecks);

// Run initial data update after 3 seconds
setTimeout(() => {
  console.log('🔄 Running initial instance data update...');
  updateInstancesData();
}, 3000);

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(port, () => {
      console.log(`🚀 Simplifyed Trading Backend running on port ${port}`);
      console.log(`🔗 API Base URL: http://localhost:${port}/api`);
      console.log(`🔐 Auth URL: http://localhost:${port}/auth/google`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();