/**
 * WebSocket Status Monitoring Routes
 * Provides real-time status of WebSocket connections and market data
 */

import express from 'express';

const router = express.Router();

/**
 * GET /api/websocket/status
 * Get current WebSocket connection status
 */
router.get('/status', async (req, res) => {
  try {
    const { wsManager } = req.app.locals;

    if (!wsManager) {
      return res.json({
        status: 'disabled',
        message: 'WebSocket manager not initialized'
      });
    }

    res.json({
      status: 'success',
      data: {
        is_connected: wsManager.isConnected,
        current_instance: wsManager.currentInstance ? {
          id: wsManager.currentInstance.id,
          name: wsManager.currentInstance.name,
          host: wsManager.currentInstance.host
        } : null,
        session_type: wsManager.currentSessionType,
        reconnect_attempts: wsManager.reconnectAttempts,
        max_reconnect_attempts: wsManager.maxReconnectAttempts,
        last_message_time: wsManager.lastMessageTime,
        subscribed_symbols_count: wsManager.subscribedSymbols.size,
        cache_size: wsManager.marketDataCache.size,
        cache_max: wsManager.marketDataCache.max
      }
    });
  } catch (error) {
    console.error('Error fetching WebSocket status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch WebSocket status',
      error: error.message
    });
  }
});

/**
 * GET /api/websocket/sessions
 * Get recent WebSocket session history
 */
router.get('/sessions', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const limit = parseInt(req.query.limit) || 20;

    const sessions = await dbAsync.all(`
      SELECT
        ws.*,
        i.name as instance_name,
        i.host as instance_host
      FROM websocket_sessions ws
      JOIN instances i ON i.id = ws.instance_id
      ORDER BY ws.created_at DESC
      LIMIT ?
    `, [limit]);

    res.json({
      status: 'success',
      data: sessions
    });
  } catch (error) {
    console.error('Error fetching WebSocket sessions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch WebSocket sessions',
      error: error.message
    });
  }
});

/**
 * GET /api/websocket/market-data/:exchange/:symbol
 * Get cached market data for a specific symbol
 */
router.get('/market-data/:exchange/:symbol', async (req, res) => {
  try {
    const { wsManager } = req.app.locals;
    const { exchange, symbol } = req.params;

    if (!wsManager) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket manager not initialized'
      });
    }

    const cacheKey = `${exchange}:${symbol}`;
    const data = wsManager.marketDataCache.get(cacheKey);

    if (!data) {
      return res.status(404).json({
        status: 'error',
        message: 'No market data found for this symbol'
      });
    }

    res.json({
      status: 'success',
      data
    });
  } catch (error) {
    console.error('Error fetching market data:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch market data',
      error: error.message
    });
  }
});

/**
 * GET /api/websocket/market-data
 * Get all cached market data
 */
router.get('/market-data', async (req, res) => {
  try {
    const { wsManager } = req.app.locals;

    if (!wsManager) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket manager not initialized'
      });
    }

    const allData = {};
    for (const [key, value] of wsManager.marketDataCache.entries()) {
      allData[key] = value;
    }

    res.json({
      status: 'success',
      count: Object.keys(allData).length,
      data: allData
    });
  } catch (error) {
    console.error('Error fetching all market data:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch market data',
      error: error.message
    });
  }
});

/**
 * POST /api/websocket/reconnect
 * Manually trigger WebSocket reconnection (Admin only)
 */
router.post('/reconnect', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({
        status: 'error',
        message: 'Admin privileges required'
      });
    }

    const { wsManager } = req.app.locals;

    if (!wsManager) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket manager not initialized'
      });
    }

    // Disconnect current connection
    if (wsManager.ws) {
      wsManager.ws.close();
    }

    // Reset reconnect attempts
    wsManager.reconnectAttempts = 0;

    // Reinitialize connection
    await wsManager.initialize();

    res.json({
      status: 'success',
      message: 'WebSocket reconnection initiated'
    });
  } catch (error) {
    console.error('Error reconnecting WebSocket:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reconnect WebSocket',
      error: error.message
    });
  }
});

/**
 * POST /api/websocket/subscribe
 * Subscribe to additional symbols (Admin only)
 */
router.post('/subscribe', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({
        status: 'error',
        message: 'Admin privileges required'
      });
    }

    const { wsManager } = req.app.locals;
    const { symbols } = req.body;

    if (!wsManager) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket manager not initialized'
      });
    }

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'symbols must be a non-empty array'
      });
    }

    // Validate symbol format
    for (const symbol of symbols) {
      if (!symbol.exchange || !symbol.token) {
        return res.status(400).json({
          status: 'error',
          message: 'Each symbol must have exchange and token'
        });
      }
    }

    await wsManager.subscribeToSymbols(symbols);

    res.json({
      status: 'success',
      message: `Subscribed to ${symbols.length} symbol(s)`,
      subscribed_count: wsManager.subscribedSymbols.size
    });
  } catch (error) {
    console.error('Error subscribing to symbols:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to subscribe to symbols',
      error: error.message
    });
  }
});

/**
 * GET /api/websocket/subscriptions
 * Get list of currently subscribed symbols
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const { wsManager } = req.app.locals;

    if (!wsManager) {
      return res.status(503).json({
        status: 'error',
        message: 'WebSocket manager not initialized'
      });
    }

    const subscriptions = Array.from(wsManager.subscribedSymbols);

    res.json({
      status: 'success',
      count: subscriptions.length,
      data: subscriptions
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscriptions',
      error: error.message
    });
  }
});

/**
 * GET /api/websocket/health
 * Get WebSocket health metrics
 */
router.get('/health', async (req, res) => {
  try {
    const { wsManager, dbAsync } = req.app.locals;

    if (!wsManager) {
      return res.json({
        status: 'disabled',
        is_healthy: false,
        message: 'WebSocket manager not initialized'
      });
    }

    const now = Date.now();
    const lastMessageAge = wsManager.lastMessageTime ? now - wsManager.lastMessageTime.getTime() : null;
    const isStale = lastMessageAge && lastMessageAge > 60000; // 60 seconds

    // Get session stats from database
    const sessionStats = await dbAsync.get(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'CONNECTED' THEN 1 ELSE 0 END) as connected_sessions,
        SUM(CASE WHEN status = 'DISCONNECTED' THEN 1 ELSE 0 END) as disconnected_sessions,
        MAX(messages_received) as max_messages_received
      FROM websocket_sessions
      WHERE created_at > datetime('now', '-24 hours')
    `);

    res.json({
      status: 'success',
      is_healthy: wsManager.isConnected && !isStale,
      data: {
        connected: wsManager.isConnected,
        last_message_age_ms: lastMessageAge,
        is_stale: isStale,
        reconnect_attempts: wsManager.reconnectAttempts,
        cache_utilization: wsManager.marketDataCache.size / wsManager.marketDataCache.max,
        session_stats: sessionStats
      }
    });
  } catch (error) {
    console.error('Error fetching WebSocket health:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch WebSocket health',
      error: error.message
    });
  }
});

export default router;
