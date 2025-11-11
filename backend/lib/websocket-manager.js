/**
 * WebSocket Manager
 * Manages WebSocket connection to OpenAlgo for real-time market data
 * Handles Primary/Secondary admin failover
 */

import WebSocket from 'ws';
import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';

/**
 * WebSocket Manager Class
 * Connects to OpenAlgo admin instance and streams market data
 */
class WebSocketManager extends EventEmitter {
  constructor(dbAsync, alertService) {
    super();

    this.dbAsync = dbAsync;
    this.alertService = alertService;
    this.ws = null;
    this.currentInstance = null;
    this.sessionId = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.heartbeatInterval = null;
    this.lastMessageTime = null;
    this.messageCount = 0;

    // LRU Cache for market data (stores last 10,000 ticks)
    this.marketDataCache = new LRUCache({
      max: 10000,
      ttl: 1000 * 60 * 5, // 5 minutes TTL
      updateAgeOnGet: true
    });

    // Track subscribed symbols
    this.subscribedSymbols = new Set();
  }

  /**
   * Initialize WebSocket connection to Primary Admin
   */
  async initialize() {
    try {
      console.log('🔌 Initializing WebSocket Manager...');

      // Get Primary Admin instance
      const primaryAdmin = await this.getPrimaryAdminInstance();

      if (!primaryAdmin) {
        console.warn('⚠️  No Primary Admin instance configured');
        await this.alertService.createAlert({
          type: 'WEBSOCKET_CONFIG_MISSING',
          severity: 'WARNING',
          title: 'No Primary Admin Configured',
          message: 'Please designate a Primary Admin instance for WebSocket streaming',
          instance_id: null
        });
        return false;
      }

      // Connect to Primary Admin
      await this.connectToInstance(primaryAdmin, 'PRIMARY');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize WebSocket Manager:', error);
      return false;
    }
  }

  /**
   * Get Primary Admin instance from database
   */
  async getPrimaryAdminInstance() {
    return await this.dbAsync.get(`
      SELECT * FROM instances
      WHERE is_primary_admin = 1
      AND is_active = 1
      LIMIT 1
    `);
  }

  /**
   * Get Secondary Admin instance from database
   */
  async getSecondaryAdminInstance() {
    return await this.dbAsync.get(`
      SELECT * FROM instances
      WHERE is_secondary_admin = 1
      AND is_active = 1
      LIMIT 1
    `);
  }

  /**
   * Connect to an OpenAlgo instance
   */
  async connectToInstance(instance, sessionType = 'PRIMARY') {
    if (this.isConnecting) {
      console.log('⏳ Connection already in progress...');
      return;
    }

    this.isConnecting = true;
    this.currentInstance = instance;

    try {
      console.log(`🔗 Connecting to ${sessionType} Admin: ${instance.name}`);

      // Construct WebSocket URL
      const wsUrl = this.getWebSocketUrl(instance);

      if (!wsUrl) {
        throw new Error('Invalid WebSocket URL');
      }

      // Create WebSocket session record
      const session = await this.dbAsync.run(`
        INSERT INTO websocket_sessions (
          instance_id, session_type, status, connection_url
        ) VALUES (?, ?, 'CONNECTING', ?)
      `, [instance.id, sessionType, wsUrl]);

      this.sessionId = session.lastID;

      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl);

      // Set up event handlers
      this.setupEventHandlers(instance, sessionType);

      // Update instance WebSocket status
      await this.updateInstanceStatus(instance.id, 'connecting');

    } catch (error) {
      console.error(`❌ Failed to connect to ${sessionType} Admin:`, error);
      this.isConnecting = false;

      await this.alertService.createAlert({
        type: 'WEBSOCKET_DISCONNECT',
        severity: 'ERROR',
        title: 'WebSocket Connection Failed',
        message: `Failed to connect to ${sessionType} Admin: ${instance.name}`,
        instance_id: instance.id,
        details: { error: error.message }
      });
    }
  }

  /**
   * Get WebSocket URL for instance
   */
  getWebSocketUrl(instance) {
    // Use websocket_url if specified, otherwise derive from host_url
    if (instance.websocket_url) {
      return instance.websocket_url;
    }

    // Convert HTTP(S) URL to WS(S) URL
    const hostUrl = instance.host_url;
    if (!hostUrl) return null;

    // Replace http:// with ws:// and https:// with wss://
    const wsUrl = hostUrl
      .replace(/^http:\/\//, 'ws://')
      .replace(/^https:\/\//, 'wss://');

    // Append WebSocket endpoint path
    return `${wsUrl}/ws`;
  }

  /**
   * Set up WebSocket event handlers
   */
  setupEventHandlers(instance, sessionType) {
    // Connection opened
    this.ws.on('open', async () => {
      console.log(`✅ WebSocket connected to ${sessionType} Admin: ${instance.name}`);

      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.lastMessageTime = new Date();

      // Update session status
      await this.updateSessionStatus('CONNECTED');
      await this.updateInstanceStatus(instance.id, 'connected', new Date());

      // Start heartbeat monitoring
      this.startHeartbeat();

      // Subscribe to watchlist symbols
      await this.subscribeToWatchlistSymbols();

      // Emit connected event
      this.emit('connected', { instance, sessionType });

      // Create success alert
      await this.alertService.createAlert({
        type: 'WEBSOCKET_DISCONNECT',
        severity: 'INFO',
        title: 'WebSocket Connected',
        message: `Successfully connected to ${sessionType} Admin: ${instance.name}`,
        instance_id: instance.id
      });
    });

    // Message received
    this.ws.on('message', async (data) => {
      try {
        this.lastMessageTime = new Date();
        this.messageCount++;

        // Parse message
        const message = JSON.parse(data.toString());

        // Update session metrics
        await this.updateSessionMetrics();

        // Process market data
        await this.processMarketData(message);

        // Emit data event
        this.emit('data', message);

      } catch (error) {
        console.error('❌ Error processing WebSocket message:', error);
      }
    });

    // Connection closed
    this.ws.on('close', async (code, reason) => {
      console.warn(`⚠️  WebSocket disconnected: ${code} - ${reason}`);

      // Update session status
      await this.updateSessionStatus('DISCONNECTED');
      await this.updateInstanceStatus(instance.id, 'disconnected');

      // Stop heartbeat
      this.stopHeartbeat();

      // Emit disconnected event
      this.emit('disconnected', { instance, sessionType, code, reason });

      // Create alert
      await this.alertService.createAlert({
        type: 'WEBSOCKET_DISCONNECT',
        severity: 'WARNING',
        title: 'WebSocket Disconnected',
        message: `WebSocket connection closed for ${sessionType} Admin: ${instance.name}`,
        instance_id: instance.id,
        details: { code, reason: reason.toString() }
      });

      // Attempt reconnection
      this.attemptReconnect(sessionType);
    });

    // Error occurred
    this.ws.on('error', async (error) => {
      console.error(`❌ WebSocket error:`, error);

      // Update session error count
      await this.updateSessionError(error.message);

      // Emit error event
      this.emit('error', { instance, sessionType, error });
    });
  }

  /**
   * Process incoming market data
   */
  async processMarketData(message) {
    try {
      // Expected message format from OpenAlgo WebSocket
      // { type: 'tick', data: { exchange, symbol, ltp, open, high, low, volume, ... } }

      if (!message || !message.data) {
        return;
      }

      const { exchange, symbol, token } = message.data;

      if (!exchange || !symbol) {
        return;
      }

      // Create cache key
      const cacheKey = `${exchange}:${symbol}`;

      // Store in cache
      this.marketDataCache.set(cacheKey, {
        ...message.data,
        timestamp: new Date(),
        received_at: this.lastMessageTime
      });

      // Update database (batch updates every 1 second to avoid overwhelming DB)
      // This will be handled by a separate batch processor
      this.emit('market_tick', message.data);

    } catch (error) {
      console.error('❌ Error processing market data:', error);
    }
  }

  /**
   * Subscribe to all watchlist symbols
   */
  async subscribeToWatchlistSymbols() {
    try {
      // Get all unique symbols from all active watchlists
      const symbols = await this.dbAsync.all(`
        SELECT DISTINCT ws.exchange, ws.symbol, ws.token
        FROM watchlist_symbols ws
        JOIN watchlists w ON w.id = ws.watchlist_id
        WHERE w.is_active = 1
      `);

      if (symbols.length === 0) {
        console.log('ℹ️  No symbols to subscribe to');
        return;
      }

      console.log(`📡 Subscribing to ${symbols.length} symbols...`);

      // Build subscription message for OpenAlgo
      const instruments = symbols.map(s => ({
        exchange: s.exchange,
        token: s.token || s.symbol
      }));

      // Send subscription request
      // Note: Actual format depends on OpenAlgo WebSocket protocol
      const subscriptionMessage = {
        action: 'subscribe',
        instruments: instruments
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(subscriptionMessage));

        // Track subscribed symbols
        symbols.forEach(s => {
          const key = `${s.exchange}:${s.symbol}`;
          this.subscribedSymbols.add(key);
        });

        console.log(`✅ Subscribed to ${symbols.length} symbols`);
      }

    } catch (error) {
      console.error('❌ Error subscribing to symbols:', error);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    // Check for messages every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      const now = new Date();
      const timeSinceLastMessage = now - this.lastMessageTime;

      // If no message for 60 seconds, consider connection stale
      if (timeSinceLastMessage > 60000) {
        console.warn('⚠️  No WebSocket data received for 60 seconds');

        await this.alertService.createAlert({
          type: 'WEBSOCKET_DISCONNECT',
          severity: 'WARNING',
          title: 'WebSocket Data Lag',
          message: 'No market data received for 60 seconds',
          instance_id: this.currentInstance?.id,
          details: { lastMessageTime: this.lastMessageTime, timeSinceLastMessage }
        });

        // Close connection to trigger reconnect
        if (this.ws) {
          this.ws.close(1000, 'No data timeout');
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  async attemptReconnect(sessionType) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached`);

      await this.alertService.createAlert({
        type: 'WEBSOCKET_DISCONNECT',
        severity: 'CRITICAL',
        title: 'WebSocket Reconnection Failed',
        message: `Failed to reconnect after ${this.maxReconnectAttempts} attempts. Initiating failover...`,
        instance_id: this.currentInstance?.id
      });

      // Trigger failover to secondary
      await this.failoverToSecondary();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      if (sessionType === 'PRIMARY') {
        const primaryAdmin = await this.getPrimaryAdminInstance();
        if (primaryAdmin) {
          await this.connectToInstance(primaryAdmin, 'PRIMARY');
        }
      } else if (sessionType === 'SECONDARY') {
        const secondaryAdmin = await this.getSecondaryAdminInstance();
        if (secondaryAdmin) {
          await this.connectToInstance(secondaryAdmin, 'SECONDARY');
        }
      }
    }, delay);
  }

  /**
   * Failover to Secondary Admin
   */
  async failoverToSecondary() {
    try {
      console.log('🔀 Initiating failover to Secondary Admin...');

      const secondaryAdmin = await this.getSecondaryAdminInstance();

      if (!secondaryAdmin) {
        console.error('❌ No Secondary Admin instance configured');

        await this.alertService.createAlert({
          type: 'WEBSOCKET_DISCONNECT',
          severity: 'CRITICAL',
          title: 'Failover Failed',
          message: 'No Secondary Admin instance configured for failover',
          instance_id: null
        });
        return;
      }

      // Update session with failover info
      await this.dbAsync.run(`
        UPDATE websocket_sessions
        SET failover_triggered = 1, failover_at = CURRENT_TIMESTAMP, failover_reason = ?
        WHERE id = ?
      `, ['Primary Admin connection failed', this.sessionId]);

      // Reset reconnect attempts
      this.reconnectAttempts = 0;

      // Connect to Secondary Admin
      await this.connectToInstance(secondaryAdmin, 'SECONDARY');

      await this.alertService.createAlert({
        type: 'WEBSOCKET_FAILOVER',
        severity: 'WARNING',
        title: 'Failover to Secondary Admin',
        message: `Switched to Secondary Admin: ${secondaryAdmin.name}`,
        instance_id: secondaryAdmin.id
      });

    } catch (error) {
      console.error('❌ Failover failed:', error);

      await this.alertService.createAlert({
        type: 'WEBSOCKET_DISCONNECT',
        severity: 'CRITICAL',
        title: 'Failover Error',
        message: `Failover to Secondary Admin failed: ${error.message}`,
        instance_id: null,
        details: { error: error.message }
      });
    }
  }

  /**
   * Get market data from cache
   */
  getMarketData(exchange, symbol) {
    const cacheKey = `${exchange}:${symbol}`;
    return this.marketDataCache.get(cacheKey);
  }

  /**
   * Alias for compatibility with consumers expecting `getLatestMarketData`
   */
  getLatestMarketData(exchange, symbol) {
    return this.getMarketData(exchange, symbol);
  }

  /**
   * Get all cached market data
   */
  getAllMarketData() {
    const data = [];
    for (const [key, value] of this.marketDataCache.entries()) {
      data.push(value);
    }
    return data;
  }

  /**
   * Update session status in database
   */
  async updateSessionStatus(status) {
    if (!this.sessionId) return;

    try {
      const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [status];

      if (status === 'CONNECTED') {
        updateFields.push('connected_at = CURRENT_TIMESTAMP');
      } else if (status === 'DISCONNECTED') {
        updateFields.push('disconnected_at = CURRENT_TIMESTAMP');
      }

      params.push(this.sessionId);

      await this.dbAsync.run(`
        UPDATE websocket_sessions
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);

    } catch (error) {
      console.error('Error updating session status:', error);
    }
  }

  /**
   * Update session metrics
   */
  async updateSessionMetrics() {
    if (!this.sessionId) return;

    try {
      await this.dbAsync.run(`
        UPDATE websocket_sessions
        SET messages_received = ?, last_message_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [this.messageCount, this.sessionId]);
    } catch (error) {
      // Ignore errors to avoid slowing down message processing
    }
  }

  /**
   * Update session error
   */
  async updateSessionError(errorMessage) {
    if (!this.sessionId) return;

    try {
      await this.dbAsync.run(`
        UPDATE websocket_sessions
        SET error_count = error_count + 1, last_error = ?
        WHERE id = ?
      `, [errorMessage, this.sessionId]);
    } catch (error) {
      console.error('Error updating session error:', error);
    }
  }

  /**
   * Update instance WebSocket status
   */
  async updateInstanceStatus(instanceId, status, connectTime = null) {
    try {
      const updateFields = ['websocket_status = ?'];
      const params = [status];

      if (connectTime) {
        updateFields.push('last_websocket_connect = ?');
        params.push(connectTime.toISOString());
      }

      params.push(instanceId);

      await this.dbAsync.run(`
        UPDATE instances
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);

    } catch (error) {
      console.error('Error updating instance status:', error);
    }
  }

  /**
   * Close WebSocket connection
   */
  close() {
    console.log('🔌 Closing WebSocket connection...');

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Manager shutdown');
      this.ws = null;
    }

    this.subscribedSymbols.clear();
    this.marketDataCache.clear();
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.ws && this.ws.readyState === WebSocket.OPEN,
      instance: this.currentInstance,
      messageCount: this.messageCount,
      lastMessageTime: this.lastMessageTime,
      subscribedSymbols: this.subscribedSymbols.size,
      cacheSize: this.marketDataCache.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

export default WebSocketManager;
