/**
 * Alert Service
 * Manages system alerts and notifications for watchlist operations
 */

import nodemailer from 'nodemailer';

class AlertService {
  constructor(dbAsync, emailConfig = null) {
    this.dbAsync = dbAsync;
    this.emailConfig = emailConfig;
    this.emailTransporter = null;

    // Initialize email transporter if config provided
    if (emailConfig && emailConfig.enabled) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure || false,
          auth: emailConfig.user && emailConfig.pass ? {
            user: emailConfig.user,
            pass: emailConfig.pass
          } : undefined
        });
      } catch (error) {
        console.error('[AlertService] Failed to initialise email transporter:', error);
        this.emailTransporter = null;
      }
    }
  }

  /**
   * Create a system alert
   * @param {string} alertType - Type of alert (WEBSOCKET_DISCONNECT, ORDER_FAILED, etc.)
   * @param {string} severity - Severity level (INFO, WARNING, ERROR, CRITICAL)
   * @param {string} message - Human-readable alert message
   * @param {object} context - Additional context data (JSON)
   * @param {number|null} instanceId - Related instance ID (optional)
   * @param {number|null} watchlistId - Related watchlist ID (optional)
   * @returns {Promise<number>} Alert ID
   */
  async createAlert(alertType, severity, message, context = {}, instanceId = null, watchlistId = null) {
    try {
      // Support both object format and parameter format
      let type, sev, msg, ctx, instId, wlId, titleText;

      if (typeof alertType === 'object' && alertType !== null) {
        // Object format (from WebSocketManager)
        type = alertType.type;
        sev = alertType.severity;
        titleText = alertType.title || (typeof type === 'string' ? type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : String(type));
        msg = alertType.message;
        ctx = alertType.details || alertType.context || {};
        instId = alertType.instance_id || null;
        wlId = alertType.watchlist_id || null;
      } else {
        // Parameter format
        type = alertType;
        sev = severity;
        msg = message;
        ctx = context;
        instId = instanceId;
        wlId = watchlistId;
        titleText = typeof type === 'string' ? type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : String(type);
      }

      const result = await this.dbAsync.run(`
        INSERT INTO system_alerts (
          alert_type,
          severity,
          title,
          message,
          details_json,
          instance_id,
          watchlist_id,
          is_resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `, [
        type,
        sev,
        titleText,
        msg,
        JSON.stringify(ctx),
        instId,
        wlId
      ]);

      const alertId = result.lastID;

      // Send email notification for critical alerts
      if (sev === 'CRITICAL' && this.emailTransporter) {
        await this.sendEmailNotification(alertId, type, sev, msg, ctx);
      }

      console.log(`[AlertService] Created ${sev} alert: ${type} - ${msg}`);

      return alertId;
    } catch (error) {
      console.error('[AlertService] Failed to create alert:', error);
      throw error;
    }
  }

  /**
   * WebSocket specific alerts
   */

  async alertWebSocketDisconnected(instanceId, instanceName, reason = 'Unknown') {
    return await this.createAlert(
      'WEBSOCKET_DISCONNECT',
      'ERROR',
      `WebSocket disconnected from instance "${instanceName}"`,
      { reason, instance_name: instanceName },
      instanceId
    );
  }

  async alertWebSocketConnected(instanceId, instanceName, sessionType = 'PRIMARY') {
    return await this.createAlert(
      'WEBSOCKET_CONNECT',
      'INFO',
      `WebSocket connected to ${sessionType} admin instance "${instanceName}"`,
      { session_type: sessionType, instance_name: instanceName },
      instanceId
    );
  }

  async alertWebSocketFailover(fromInstanceId, toInstanceId, fromName, toName) {
    return await this.createAlert(
      'WEBSOCKET_FAILOVER',
      'WARNING',
      `WebSocket failover: ${fromName} → ${toName}`,
      {
        from_instance_id: fromInstanceId,
        to_instance_id: toInstanceId,
        from_name: fromName,
        to_name: toName
      },
      toInstanceId
    );
  }

  async alertWebSocketReconnecting(instanceId, instanceName, attempt, maxAttempts) {
    return await this.createAlert(
      'WEBSOCKET_RECONNECT',
      'WARNING',
      `Reconnecting to "${instanceName}" (attempt ${attempt}/${maxAttempts})`,
      { attempt, max_attempts: maxAttempts, instance_name: instanceName },
      instanceId
    );
  }

  async alertWebSocketReconnectFailed(instanceId, instanceName) {
    return await this.createAlert(
      'WEBSOCKET_RECONNECT_FAILED',
      'CRITICAL',
      `Failed to reconnect to "${instanceName}" after maximum attempts`,
      { instance_name: instanceName },
      instanceId
    );
  }

  async alertWebSocketHeartbeatTimeout(instanceId, instanceName, lastMessageAge) {
    return await this.createAlert(
      'WEBSOCKET_HEARTBEAT_TIMEOUT',
      'WARNING',
      `No heartbeat from "${instanceName}" for ${lastMessageAge}ms`,
      { last_message_age_ms: lastMessageAge, instance_name: instanceName },
      instanceId
    );
  }

  /**
   * Order specific alerts
   */

  async alertOrderPlaced(orderId, instanceId, watchlistId, symbol, orderDetails) {
    return await this.createAlert(
      'ORDER_PLACED',
      'INFO',
      `Order placed: ${orderDetails.action} ${orderDetails.quantity} ${symbol}`,
      { order_id: orderId, symbol, ...orderDetails },
      instanceId,
      watchlistId
    );
  }

  async alertOrderFailed(instanceId, watchlistId, symbol, errorMessage, orderDetails) {
    return await this.createAlert(
      'ORDER_FAILED',
      'ERROR',
      `Order failed for ${symbol}: ${errorMessage}`,
      { symbol, error: errorMessage, ...orderDetails },
      instanceId,
      watchlistId
    );
  }

  async alertOrderRetry(orderId, instanceId, watchlistId, symbol, retryCount) {
    return await this.createAlert(
      'ORDER_RETRY',
      'WARNING',
      `Retrying order for ${symbol} (attempt ${retryCount})`,
      { order_id: orderId, symbol, retry_count: retryCount },
      instanceId,
      watchlistId
    );
  }

  async alertPartialOrderFailure(watchlistId, successCount, failureCount, totalCount) {
    return await this.createAlert(
      'PARTIAL_ORDER_FAILURE',
      'WARNING',
      `Partial order broadcast failure: ${successCount}/${totalCount} succeeded, ${failureCount} failed`,
      { success_count: successCount, failure_count: failureCount, total_count: totalCount },
      null,
      watchlistId
    );
  }

  /**
   * Position specific alerts
   */

  async alertPositionOpened(positionId, instanceId, watchlistId, symbol, entryDetails) {
    return await this.createAlert(
      'POSITION_OPENED',
      'INFO',
      `Position opened: ${symbol}`,
      { position_id: positionId, symbol, ...entryDetails },
      instanceId,
      watchlistId
    );
  }

  async alertPositionClosed(positionId, instanceId, watchlistId, symbol, exitDetails) {
    return await this.createAlert(
      'POSITION_CLOSED',
      'INFO',
      `Position closed: ${symbol} - ${exitDetails.exit_reason}`,
      { position_id: positionId, symbol, ...exitDetails },
      instanceId,
      watchlistId
    );
  }

  async alertTargetHit(positionId, instanceId, watchlistId, symbol, pnl) {
    return await this.createAlert(
      'TARGET_HIT',
      'INFO',
      `Target hit for ${symbol} - P&L: ₹${pnl.toFixed(2)}`,
      { position_id: positionId, symbol, pnl },
      instanceId,
      watchlistId
    );
  }

  async alertStopLossHit(positionId, instanceId, watchlistId, symbol, pnl) {
    return await this.createAlert(
      'STOPLOSS_HIT',
      'WARNING',
      `Stop Loss hit for ${symbol} - P&L: ₹${pnl.toFixed(2)}`,
      { position_id: positionId, symbol, pnl },
      instanceId,
      watchlistId
    );
  }

  async alertTrailingStopHit(positionId, instanceId, watchlistId, symbol, pnl) {
    return await this.createAlert(
      'TRAILING_STOP_HIT',
      'INFO',
      `Trailing Stop hit for ${symbol} - P&L: ₹${pnl.toFixed(2)}`,
      { position_id: positionId, symbol, pnl },
      instanceId,
      watchlistId
    );
  }

  /**
   * Rate limiting alerts
   */

  async alertRateLimitExceeded(instanceId, endpoint, currentRate, maxRate) {
    return await this.createAlert(
      'RATE_LIMIT_EXCEEDED',
      'WARNING',
      `Rate limit exceeded for ${endpoint}: ${currentRate}/${maxRate} req/sec`,
      { endpoint, current_rate: currentRate, max_rate: maxRate },
      instanceId
    );
  }

  async alertRateLimitApproaching(instanceId, endpoint, currentRate, maxRate, threshold) {
    return await this.createAlert(
      'RATE_LIMIT_APPROACHING',
      'INFO',
      `Rate limit approaching ${threshold}% for ${endpoint}: ${currentRate}/${maxRate} req/sec`,
      { endpoint, current_rate: currentRate, max_rate: maxRate, threshold },
      instanceId
    );
  }

  /**
   * Market data alerts
   */

  async alertMarketDataStale(watchlistId, symbolsCount, staleDuration) {
    return await this.createAlert(
      'MARKET_DATA_STALE',
      'WARNING',
      `Market data stale for ${symbolsCount} symbols (${staleDuration}ms)`,
      { symbols_count: symbolsCount, stale_duration_ms: staleDuration },
      null,
      watchlistId
    );
  }

  async alertMarketDataResumed(watchlistId) {
    return await this.createAlert(
      'MARKET_DATA_RESUMED',
      'INFO',
      `Market data streaming resumed`,
      {},
      null,
      watchlistId
    );
  }

  /**
   * Instance alerts
   */

  async alertInstanceOffline(instanceId, instanceName) {
    return await this.createAlert(
      'INSTANCE_OFFLINE',
      'ERROR',
      `Instance "${instanceName}" went offline`,
      { instance_name: instanceName },
      instanceId
    );
  }

  async alertInstanceOnline(instanceId, instanceName) {
    return await this.createAlert(
      'INSTANCE_ONLINE',
      'INFO',
      `Instance "${instanceName}" is back online`,
      { instance_name: instanceName },
      instanceId
    );
  }

  async alertOrderPlacementDisabled(instanceId, instanceName) {
    return await this.createAlert(
      'ORDER_PLACEMENT_DISABLED',
      'WARNING',
      `Order placement disabled for instance "${instanceName}"`,
      { instance_name: instanceName },
      instanceId
    );
  }

  /**
   * Query alerts
   */

  async getUnresolvedAlerts(limit = 100) {
    return await this.dbAsync.all(`
      SELECT
        a.*,
        i.name as instance_name,
        w.name as watchlist_name
      FROM system_alerts a
      LEFT JOIN instances i ON i.id = a.instance_id
      LEFT JOIN watchlists w ON w.id = a.watchlist_id
      WHERE a.is_resolved = 0
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  async getAlertsByType(alertType, limit = 50) {
    return await this.dbAsync.all(`
      SELECT
        a.*,
        i.name as instance_name,
        w.name as watchlist_name
      FROM system_alerts a
      LEFT JOIN instances i ON i.id = a.instance_id
      LEFT JOIN watchlists w ON w.id = a.watchlist_id
      WHERE a.alert_type = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [alertType, limit]);
  }

  async getAlertsBySeverity(severity, limit = 50) {
    return await this.dbAsync.all(`
      SELECT
        a.*,
        i.name as instance_name,
        w.name as watchlist_name
      FROM system_alerts a
      LEFT JOIN instances i ON i.id = a.instance_id
      LEFT JOIN watchlists w ON w.id = a.watchlist_id
      WHERE a.severity = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [severity, limit]);
  }

  async getAlertsForInstance(instanceId, limit = 50) {
    return await this.dbAsync.all(`
      SELECT
        a.*,
        w.name as watchlist_name
      FROM system_alerts a
      LEFT JOIN watchlists w ON w.id = a.watchlist_id
      WHERE a.instance_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [instanceId, limit]);
  }

  async getAlertsForWatchlist(watchlistId, limit = 50) {
    return await this.dbAsync.all(`
      SELECT
        a.*,
        i.name as instance_name
      FROM system_alerts a
      LEFT JOIN instances i ON i.id = a.instance_id
      WHERE a.watchlist_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `, [watchlistId, limit]);
  }

  /**
   * Resolve alerts
   */

  async resolveAlert(alertId, resolvedBy = null, resolution = null) {
    await this.dbAsync.run(`
      UPDATE system_alerts
      SET
        is_resolved = 1,
        resolved_at = datetime('now'),
        resolved_by = ?,
        resolution_notes = ?
      WHERE id = ?
    `, [resolvedBy, resolution, alertId]);

    console.log(`[AlertService] Resolved alert ${alertId}`);
  }

  async resolveAlertsByType(alertType, resolvedBy = null) {
    const result = await this.dbAsync.run(`
      UPDATE system_alerts
      SET
        is_resolved = 1,
        resolved_at = datetime('now'),
        resolved_by = ?
      WHERE alert_type = ? AND is_resolved = 0
    `, [resolvedBy, alertType]);

    console.log(`[AlertService] Resolved ${result.changes} alerts of type ${alertType}`);
    return result.changes;
  }

  async autoResolveOldAlerts(olderThanDays = 7) {
    const result = await this.dbAsync.run(`
      UPDATE system_alerts
      SET
        is_resolved = 1,
        resolved_at = datetime('now'),
        resolved_by = 'AUTO',
        resolution_notes = 'Auto-resolved after ${olderThanDays} days'
      WHERE
        is_resolved = 0
        AND created_at < datetime('now', '-${olderThanDays} days')
    `);

    console.log(`[AlertService] Auto-resolved ${result.changes} old alerts`);
    return result.changes;
  }

  /**
   * Send email notification for critical alerts
   */
  async sendEmailNotification(alertId, alertType, severity, message, context) {
    if (!this.emailTransporter) {
      console.log('[AlertService] Email notifications disabled - no transporter configured');
      return;
    }

    try {
      const mailOptions = {
        from: this.emailConfig.from || 'alerts@simplifyed.in',
        to: this.emailConfig.to || this.emailConfig.user,
        subject: `[${severity}] Simplifyed Alert: ${alertType}`,
        html: `
          <h2>System Alert #${alertId}</h2>
          <p><strong>Type:</strong> ${alertType}</p>
          <p><strong>Severity:</strong> <span style="color: red;">${severity}</span></p>
          <p><strong>Message:</strong> ${message}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr>
          <h3>Context:</h3>
          <pre>${JSON.stringify(context, null, 2)}</pre>
          <hr>
          <p><em>This is an automated alert from Simplifyed Admin Dashboard.</em></p>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
      console.log(`[AlertService] Email notification sent for alert ${alertId}`);
    } catch (error) {
      console.error('[AlertService] Failed to send email notification:', error);
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats() {
    const stats = await this.dbAsync.get(`
      SELECT
        COUNT(*) as total_alerts,
        SUM(CASE WHEN is_resolved = 0 THEN 1 ELSE 0 END) as unresolved_count,
        SUM(CASE WHEN severity = 'CRITICAL' AND is_resolved = 0 THEN 1 ELSE 0 END) as critical_unresolved,
        SUM(CASE WHEN severity = 'ERROR' AND is_resolved = 0 THEN 1 ELSE 0 END) as error_unresolved,
        SUM(CASE WHEN severity = 'WARNING' AND is_resolved = 0 THEN 1 ELSE 0 END) as warning_unresolved,
        SUM(CASE WHEN severity = 'INFO' AND is_resolved = 0 THEN 1 ELSE 0 END) as info_unresolved
      FROM system_alerts
      WHERE created_at > datetime('now', '-7 days')
    `);

    return stats;
  }

  /**
   * Cleanup old resolved alerts
   */
  async cleanupOldAlerts(olderThanDays = 30) {
    const result = await this.dbAsync.run(`
      DELETE FROM system_alerts
      WHERE
        is_resolved = 1
        AND resolved_at < datetime('now', '-${olderThanDays} days')
    `);

    console.log(`[AlertService] Cleaned up ${result.changes} old resolved alerts`);
    return result.changes;
  }
}

export default AlertService;
