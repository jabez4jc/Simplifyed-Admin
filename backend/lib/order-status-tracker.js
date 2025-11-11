/**
 * Order Status Tracker
 * Polls OpenAlgo orderbook and updates order status in database
 * Updates position fill prices when orders complete
 * Phase 4: Order Placement & Rate Limiting
 */

class OrderStatusTracker {
  constructor(dbAsync, orderPlacementService, alertService) {
    this.dbAsync = dbAsync;
    this.orderService = orderPlacementService;
    this.alertService = alertService;
    this.pollingInterval = parseInt(process.env.ORDER_STATUS_POLLING_INTERVAL_MS || '5000');
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start order status polling
   */
  start() {
    if (this.isRunning) {
      console.log('[OrderStatusTracker] Already running');
      return;
    }

    this.isRunning = true;

    this.intervalId = setInterval(async () => {
      try {
        await this.updatePendingOrders();
      } catch (error) {
        console.error('[OrderStatusTracker] Error in polling loop:', error.message);
      }
    }, this.pollingInterval);

    console.log(`[OrderStatusTracker] Started (polling every ${this.pollingInterval}ms)`);
  }

  /**
   * Stop order status polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[OrderStatusTracker] Stopped');
    }
  }

  /**
   * Update all pending orders
   */
  async updatePendingOrders() {
    try {
      // Get all pending/open orders
      const pendingOrders = await this.dbAsync.all(`
        SELECT
          wo.*,
          i.name as instance_name
        FROM watchlist_orders wo
        JOIN instances i ON i.id = wo.instance_id
        WHERE wo.status IN ('pending', 'open')
        ORDER BY wo.placed_at ASC
      `);

      if (pendingOrders.length === 0) {
        return { updated: 0, completed: 0 };
      }

      let updatedCount = 0;
      let completedCount = 0;

      // Group orders by instance to minimize API calls
      const ordersByInstance = new Map();
      for (const order of pendingOrders) {
        if (!ordersByInstance.has(order.instance_id)) {
          ordersByInstance.set(order.instance_id, []);
        }
        ordersByInstance.get(order.instance_id).push(order);
      }

      // Update orders for each instance
      for (const [instanceId, orders] of ordersByInstance.entries()) {
        try {
          const orderBook = await this.orderService.getOrderBook(instanceId);

          for (const order of orders) {
            const updated = await this.updateOrderFromOrderBook(order, orderBook);
            if (updated) {
              updatedCount++;
              if (updated.completed) {
                completedCount++;
              }
            }
          }
        } catch (error) {
          console.error(`[OrderStatusTracker] Failed to fetch orderbook for instance ${instanceId}:`, error.message);
        }
      }

      if (updatedCount > 0) {
        console.log(`[OrderStatusTracker] Updated ${updatedCount} orders, ${completedCount} completed`);
      }

      return { updated: updatedCount, completed: completedCount };

    } catch (error) {
      console.error('[OrderStatusTracker] Error updating pending orders:', error);
      throw error;
    }
  }

  /**
   * Update single order from orderbook data
   */
  async updateOrderFromOrderBook(order, orderBook) {
    try {
      // Ensure orderBook is an array
      if (!Array.isArray(orderBook)) {
        console.warn(`[OrderStatusTracker] OrderBook is not an array for order ${order.order_id}, skipping`);
        return null;
      }

      // Find matching order in orderbook
      const remoteOrder = orderBook.find(o => o.orderid === order.order_id);

      if (!remoteOrder) {
        // Order not found in orderbook
        // Could be too old or already removed
        return null;
      }

      // Check if status changed
      const newStatus = this.mapOrderStatus(remoteOrder.status);
      const statusChanged = newStatus !== order.status;

      if (!statusChanged && order.filled_quantity === parseInt(remoteOrder.fillshares || 0)) {
        // No changes
        return null;
      }

      // Update order in database
      await this.dbAsync.run(`
        UPDATE watchlist_orders
        SET
          status = ?,
          filled_quantity = ?,
          average_price = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `, [
        newStatus,
        parseInt(remoteOrder.fillshares || 0),
        parseFloat(remoteOrder.avgprice || 0),
        order.id
      ]);

      console.log(`[OrderStatusTracker] Order ${order.order_id} status: ${order.status} → ${newStatus}`);

      // Handle order completion
      let completed = false;
      if (newStatus === 'complete' && order.status !== 'complete') {
        completed = true;
        await this.handleOrderCompletion(order, remoteOrder);
      }

      // Handle order rejection
      if (newStatus === 'rejected' && order.status !== 'rejected') {
        await this.handleOrderRejection(order, remoteOrder);
      }

      return { updated: true, completed };

    } catch (error) {
      console.error(`[OrderStatusTracker] Error updating order ${order.id}:`, error.message);
      return null;
    }
  }

  /**
   * Map OpenAlgo order status to our status
   */
  mapOrderStatus(openAlgoStatus) {
    const statusMap = {
      'pending': 'pending',
      'open': 'open',
      'complete': 'complete',
      'rejected': 'rejected',
      'cancelled': 'cancelled',
      'trigger pending': 'pending'
    };

    return statusMap[openAlgoStatus.toLowerCase()] || openAlgoStatus.toLowerCase();
  }

  /**
   * Handle order completion
   */
  async handleOrderCompletion(order, remoteOrder) {
    try {
      const fillPrice = parseFloat(remoteOrder.avgprice || 0);
      const filledQty = parseInt(remoteOrder.fillshares || 0);

      console.log(`[OrderStatusTracker] Order completed: ${order.order_id} @ ₹${fillPrice} (${filledQty} qty)`);

      // Update position with fill price
      if (order.position_id) {
        if (order.order_type === 'ENTRY') {
          await this.updatePositionEntryPrice(order.position_id, fillPrice);
        } else if (order.order_type === 'EXIT') {
          await this.updatePositionExitPrice(order.position_id, fillPrice);
        }
      }

      // Create alert
      await this.alertService.createAlert(
        'ORDER_COMPLETED',
        'INFO',
        `Order completed: ${order.action} ${filledQty} ${order.symbol} @ ₹${fillPrice}`,
        {
          order_id: order.order_id,
          symbol: order.symbol,
          action: order.action,
          quantity: filledQty,
          fill_price: fillPrice,
          position_id: order.position_id
        },
        order.instance_id,
        order.watchlist_id
      );

    } catch (error) {
      console.error(`[OrderStatusTracker] Error handling order completion:`, error);
    }
  }

  /**
   * Handle order rejection
   */
  async handleOrderRejection(order, remoteOrder) {
    try {
      console.log(`[OrderStatusTracker] Order rejected: ${order.order_id}`);

      // Update position status if this was entry order
      if (order.position_id && order.order_type === 'ENTRY') {
        await this.dbAsync.run(`
          UPDATE watchlist_positions
          SET status = 'FAILED', exit_reason = ?
          WHERE id = ?
        `, ['ORDER_REJECTED', order.position_id]);
      }

      // Create alert
      await this.alertService.createAlert(
        'ORDER_REJECTED',
        'ERROR',
        `Order rejected: ${order.action} ${order.quantity} ${order.symbol}`,
        {
          order_id: order.order_id,
          symbol: order.symbol,
          action: order.action,
          quantity: order.quantity,
          position_id: order.position_id
        },
        order.instance_id,
        order.watchlist_id
      );

    } catch (error) {
      console.error(`[OrderStatusTracker] Error handling order rejection:`, error);
    }
  }

  /**
   * Update position entry price from filled order
   */
  async updatePositionEntryPrice(positionId, fillPrice) {
    try {
      await this.dbAsync.run(`
        UPDATE watchlist_positions
        SET
          entry_price = ?,
          status = 'OPEN'
        WHERE id = ? AND status != 'OPEN'
      `, [fillPrice, positionId]);

      console.log(`[OrderStatusTracker] Position ${positionId} entry price updated: ₹${fillPrice}`);

      // Recalculate exit levels with actual fill price
      const position = await this.dbAsync.get(`
        SELECT
          p.*,
          sc.*,
          ws.symbol,
          ws.exchange
        FROM watchlist_positions p
        LEFT JOIN symbol_configs sc ON sc.symbol_id = p.symbol_id
        JOIN watchlist_symbols ws ON ws.id = p.symbol_id
        WHERE p.id = ?
      `, [positionId]);

      if (position && position.target_type) {
        // Recalculate target, SL, trailing stop with actual entry price
        const exitLevels = this.calculateExitLevels(position, fillPrice);

        await this.dbAsync.run(`
          UPDATE watchlist_positions
          SET
            target_price = ?,
            sl_price = ?,
            trailing_stop_price = ?
          WHERE id = ?
        `, [
          exitLevels.target,
          exitLevels.sl,
          exitLevels.trailingStop,
          positionId
        ]);

        console.log(`[OrderStatusTracker] Position ${positionId} exit levels recalculated`);
      }

    } catch (error) {
      console.error(`[OrderStatusTracker] Error updating position entry price:`, error);
    }
  }

  /**
   * Update position exit price from filled order
   */
  async updatePositionExitPrice(positionId, fillPrice) {
    try {
      // Get position to calculate P&L
      const position = await this.dbAsync.get(`
        SELECT * FROM watchlist_positions WHERE id = ?
      `, [positionId]);

      if (!position) {
        return;
      }

      // Calculate P&L
      const pnl = this.calculatePnL(position, fillPrice);

      // Close position with actual fill price
      await this.dbAsync.run(`
        UPDATE watchlist_positions
        SET
          status = 'CLOSED',
          exit_price = ?,
          pnl = ?,
          exited_at = datetime('now')
        WHERE id = ?
      `, [fillPrice, pnl, positionId]);

      console.log(`[OrderStatusTracker] Position ${positionId} closed @ ₹${fillPrice} | P&L: ₹${pnl.toFixed(2)}`);

      // Create position closed alert
      await this.alertService.createAlert(
        'POSITION_CLOSED',
        pnl >= 0 ? 'INFO' : 'WARNING',
        `Position closed: ${position.symbol} @ ₹${fillPrice} | P&L: ₹${pnl.toFixed(2)}`,
        {
          position_id: positionId,
          symbol: position.symbol,
          exit_price: fillPrice,
          pnl: pnl
        },
        position.instance_id,
        position.watchlist_id
      );

    } catch (error) {
      console.error(`[OrderStatusTracker] Error updating position exit price:`, error);
    }
  }

  /**
   * Calculate exit levels (helper method - should match PositionManager logic)
   */
  calculateExitLevels(symbolConfig, entryPrice) {
    const exitLevels = {
      target: null,
      sl: null,
      trailingStop: null
    };

    const direction = symbolConfig.direction || 'LONG';

    // Calculate target
    if (symbolConfig.target_type && symbolConfig.target_value) {
      if (symbolConfig.target_type === 'PERCENTAGE') {
        const targetPct = symbolConfig.target_value / 100;
        exitLevels.target = direction === 'LONG'
          ? entryPrice * (1 + targetPct)
          : entryPrice * (1 - targetPct);
      } else if (symbolConfig.target_type === 'POINTS') {
        exitLevels.target = direction === 'LONG'
          ? entryPrice + symbolConfig.target_value
          : entryPrice - symbolConfig.target_value;
      }
    }

    // Calculate stop loss
    if (symbolConfig.sl_type && symbolConfig.sl_value) {
      if (symbolConfig.sl_type === 'PERCENTAGE') {
        const slPct = symbolConfig.sl_value / 100;
        exitLevels.sl = direction === 'LONG'
          ? entryPrice * (1 - slPct)
          : entryPrice * (1 + slPct);
      } else if (symbolConfig.sl_type === 'POINTS') {
        exitLevels.sl = direction === 'LONG'
          ? entryPrice - symbolConfig.sl_value
          : entryPrice + symbolConfig.sl_value;
      }
    }

    // Calculate trailing stop if IMMEDIATE activation
    if (symbolConfig.ts_type && symbolConfig.ts_value && symbolConfig.trailing_activation_type === 'IMMEDIATE') {
      if (symbolConfig.ts_type === 'PERCENTAGE') {
        const tsPct = symbolConfig.ts_value / 100;
        exitLevels.trailingStop = direction === 'LONG'
          ? entryPrice * (1 - tsPct)
          : entryPrice * (1 + tsPct);
      } else if (symbolConfig.ts_type === 'POINTS') {
        exitLevels.trailingStop = direction === 'LONG'
          ? entryPrice - symbolConfig.ts_value
          : entryPrice + symbolConfig.ts_value;
      }
    }

    return exitLevels;
  }

  /**
   * Calculate P&L (helper method - should match PositionManager logic)
   */
  calculatePnL(position, currentPrice) {
    const { entry_price, quantity, direction } = position;

    if (direction === 'LONG') {
      return (currentPrice - entry_price) * quantity;
    } else {
      return (entry_price - currentPrice) * quantity;
    }
  }

  /**
   * Manually trigger update for specific order
   */
  async updateOrder(orderId) {
    try {
      const order = await this.dbAsync.get(`
        SELECT
          wo.*,
          i.name as instance_name
        FROM watchlist_orders wo
        JOIN instances i ON i.id = wo.instance_id
        WHERE wo.order_id = ?
      `, [orderId]);

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderBook = await this.orderService.getOrderBook(order.instance_id);
      const result = await this.updateOrderFromOrderBook(order, orderBook);

      return result || { updated: false };

    } catch (error) {
      console.error(`[OrderStatusTracker] Error updating order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const stats = await this.dbAsync.get(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_orders,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
      FROM watchlist_orders
      WHERE placed_at >= datetime('now', '-24 hours')
    `);

    return {
      ...stats,
      is_running: this.isRunning,
      polling_interval_ms: this.pollingInterval
    };
  }
}

export default OrderStatusTracker;
