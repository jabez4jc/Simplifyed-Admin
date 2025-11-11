/**
 * Position Manager
 * Manages position lifecycle, limits, and validation for watchlist trading
 * Phase 3: Rule Evaluation Engine
 */

class PositionManager {
  constructor(dbAsync, alertService, orderPlacementService = null) {
    this.dbAsync = dbAsync;
    this.alertService = alertService;
    this.orderPlacementService = orderPlacementService;  // Phase 4: Optional order placement
    this.positionLocks = new Map();
  }

  /**
   * Set order placement service (can be set after construction)
   */
  setOrderPlacementService(orderPlacementService) {
    this.orderPlacementService = orderPlacementService;
  }

  /**
   * Get current position limits configuration
   */
  async getPositionLimits() {
    const limits = await this.dbAsync.get(`
      SELECT * FROM position_limits
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return limits || {
      max_open_positions: 10,
      max_positions_per_symbol: 5,
      max_capital_per_position: null,
      max_total_capital_deployed: null
    };
  }

  /**
   * Update position limits (Admin only)
   */
  async updatePositionLimits(limits, updatedBy) {
    // Deactivate current limits
    await this.dbAsync.run(`
      UPDATE position_limits
      SET is_active = 0
      WHERE is_active = 1
    `);

    // Insert new limits
    const result = await this.dbAsync.run(`
      INSERT INTO position_limits (
        max_open_positions,
        max_positions_per_symbol,
        max_capital_per_position,
        max_total_capital_deployed,
        is_active,
        created_by
      ) VALUES (?, ?, ?, ?, 1, ?)
    `, [
      limits.max_open_positions,
      limits.max_positions_per_symbol,
      limits.max_capital_per_position || null,
      limits.max_total_capital_deployed || null,
      updatedBy
    ]);

    console.log(`[PositionManager] Position limits updated by ${updatedBy}`);

    return await this.dbAsync.get(
      'SELECT * FROM position_limits WHERE id = ?',
      [result.lastID]
    );
  }

  /**
   * Check if position can be opened (enforce limits)
   */
  async canOpenPosition(instanceId, symbolId, watchlistId, quantity, estimatedCapital) {
    const limits = await this.getPositionLimits();

    // Check 1: Total open positions across all instances
    const totalOpen = await this.dbAsync.get(`
      SELECT COUNT(*) as count
      FROM watchlist_positions
      WHERE status = 'OPEN'
    `);

    if (totalOpen.count >= limits.max_open_positions) {
      await this.logViolation('MAX_POSITIONS', instanceId, symbolId, watchlistId, {
        current: totalOpen.count,
        limit: limits.max_open_positions,
        attempted_quantity: quantity
      });
      return {
        allowed: false,
        reason: `Maximum open positions limit reached (${limits.max_open_positions})`,
        violation: 'MAX_POSITIONS'
      };
    }

    // Check 2: Positions per symbol
    const symbolPositions = await this.dbAsync.get(`
      SELECT COUNT(*) as count
      FROM watchlist_positions
      WHERE symbol_id = ? AND status = 'OPEN'
    `, [symbolId]);

    if (symbolPositions.count >= limits.max_positions_per_symbol) {
      await this.logViolation('MAX_PER_SYMBOL', instanceId, symbolId, watchlistId, {
        current: symbolPositions.count,
        limit: limits.max_positions_per_symbol,
        attempted_quantity: quantity
      });
      return {
        allowed: false,
        reason: `Maximum positions per symbol limit reached (${limits.max_positions_per_symbol})`,
        violation: 'MAX_PER_SYMBOL'
      };
    }

    // Check 3: Capital per position (if configured)
    if (limits.max_capital_per_position && estimatedCapital > limits.max_capital_per_position) {
      await this.logViolation('MAX_CAPITAL', instanceId, symbolId, watchlistId, {
        attempted_capital: estimatedCapital,
        limit: limits.max_capital_per_position,
        attempted_quantity: quantity
      });
      return {
        allowed: false,
        reason: `Position capital exceeds limit (₹${limits.max_capital_per_position})`,
        violation: 'MAX_CAPITAL'
      };
    }

    // Check 4: Total capital deployed (if configured)
    if (limits.max_total_capital_deployed) {
      const totalCapital = await this.dbAsync.get(`
        SELECT SUM(entry_price * quantity) as total
        FROM watchlist_positions
        WHERE status = 'OPEN'
      `);

      const currentCapital = totalCapital.total || 0;
      if (currentCapital + estimatedCapital > limits.max_total_capital_deployed) {
        await this.logViolation('MAX_TOTAL_CAPITAL', instanceId, symbolId, watchlistId, {
          current_capital: currentCapital,
          attempted_capital: estimatedCapital,
          limit: limits.max_total_capital_deployed,
          attempted_quantity: quantity
        });
        return {
          allowed: false,
          reason: `Total capital limit would be exceeded (₹${limits.max_total_capital_deployed})`,
          violation: 'MAX_TOTAL_CAPITAL'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Open a new position (Manual Entry)
   */
  async openPosition(params) {
    const {
      instanceId,
      symbolId,
      watchlistId,
      entryPrice,
      quantity,
      direction = 'LONG',
      orderType = 'MARKET',
      productType = 'MIS',
      enteredBy
    } = params;

    // Get symbol details
    const symbol = await this.dbAsync.get(`
      SELECT
        ws.*,
        sc.*,
        ws.exchange,
        ws.symbol,
        ws.token
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.symbol_id = ws.id
      WHERE ws.id = ?
    `, [symbolId]);

    if (!symbol) {
      throw new Error('Symbol not found');
    }

    let resolvedQuantity = Number.parseInt(quantity, 10);
    let capitalReferencePrice = entryPrice;
    const qtyType = (symbol.qty_type || '').toUpperCase();

    if (qtyType === 'CAPITAL_BASED') {
      const resolved = await this.resolveCapitalBasedQuantity(symbol, entryPrice);
      resolvedQuantity = resolved.quantity;
      capitalReferencePrice = resolved.referencePrice;
    }

    if (!Number.isFinite(resolvedQuantity) || resolvedQuantity <= 0) {
      throw new Error('Quantity must be a positive integer');
    }

    const estimatedCapital = capitalReferencePrice * resolvedQuantity;

    // Check position limits
    const canOpen = await this.canOpenPosition(instanceId, symbolId, watchlistId, resolvedQuantity, estimatedCapital);
    if (!canOpen.allowed) {
      throw new Error(canOpen.reason);
    }

    // Calculate exit levels
    const exitLevels = this.calculateExitLevels(symbol, entryPrice, direction);

    // Create position
    const result = await this.dbAsync.run(`
      INSERT INTO watchlist_positions (
        watchlist_id,
        symbol_id,
        instance_id,
        entry_price,
        quantity,
        direction,
        status,
        order_type,
        product_type,
        target_price,
        sl_price,
        trailing_stop_price,
        highest_price_seen,
        lowest_price_seen,
        trailing_activated,
        entered_at,
        entered_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `, [
      watchlistId,
      symbolId,
      instanceId,
      entryPrice,
      resolvedQuantity,
      direction,
      orderType,
      productType,
      exitLevels.target,
      exitLevels.sl,
      exitLevels.trailingStop,
      direction === 'LONG' ? entryPrice : null,
      direction === 'SHORT' ? entryPrice : null,
      exitLevels.trailingActivated ? 1 : 0,
      enteredBy
    ]);

    const positionId = result.lastID;

    // Create alert
    await this.alertService.createAlert(
      'POSITION_OPENED',
      'INFO',
      `Position opened: ${symbol.symbol} ${direction} @ ₹${entryPrice} (Qty: ${resolvedQuantity})`,
      {
        position_id: positionId,
        symbol: symbol.symbol,
        exchange: symbol.exchange,
        direction,
        entry_price: entryPrice,
        quantity: resolvedQuantity,
        target_price: exitLevels.target,
        sl_price: exitLevels.sl,
        estimated_capital: estimatedCapital
      },
      instanceId,
      watchlistId
    );

    console.log(`[PositionManager] Position opened: ${symbol.symbol} ${direction} @ ₹${entryPrice}`);

    // Phase 4: Place entry order if order placement service is available and enabled
    if (this.orderPlacementService && params.placeOrder !== false) {
      try {
        const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);

        if (instance && instance.order_placement_enabled) {
          const position = await this.getPosition(positionId);

          const orderResult = await this.orderPlacementService.placeEntryOrder(
            instance,
            position,
            symbol
          );

          console.log(`[PositionManager] Entry order placed: ${orderResult.order_id}`);

          // Update position status to PENDING_ORDER until filled
          await this.dbAsync.run(`
            UPDATE watchlist_positions
            SET status = 'PENDING_ORDER'
            WHERE id = ?
          `, [positionId]);
        }
      } catch (orderError) {
        console.error(`[PositionManager] Failed to place entry order:`, orderError.message);

        // Mark position as FAILED
        await this.dbAsync.run(`
          UPDATE watchlist_positions
          SET status = 'FAILED', exit_reason = ?
          WHERE id = ?
        `, [`ORDER_FAILED: ${orderError.message}`, positionId]);

        // Re-throw error so caller knows order placement failed
        throw new Error(`Position created but order placement failed: ${orderError.message}`);
      }
    }

    // Return full position details
    return await this.getPosition(positionId);
  }

  /**
   * Calculate exit levels (target, SL, trailing stop)
   */
  calculateExitLevels(symbolConfig, entryPrice, direction) {
    const exitLevels = {
      target: null,
      sl: null,
      trailingStop: null,
      trailingActivated: false
    };

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

    // Calculate initial trailing stop
    if (symbolConfig.ts_type && symbolConfig.ts_value) {
      // Check activation type
      const activationType = symbolConfig.trailing_activation_type || 'IMMEDIATE';

      if (activationType === 'IMMEDIATE') {
        exitLevels.trailingActivated = true;
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
      } else {
        // Will activate later based on conditions
        exitLevels.trailingActivated = false;
        exitLevels.trailingStop = null;
      }
    }

    return exitLevels;
  }

  /**
   * Close a position
   */
  async closePosition(positionId, exitPrice, exitReason, closedBy, placeOrder = true) {
    if (this.positionLocks.has(positionId)) {
      console.warn(`[PositionManager] Close already in progress for position ${positionId}, reusing existing promise`);
      return this.positionLocks.get(positionId);
    }

    const closePromise = this._closePositionInternal(positionId, exitPrice, exitReason, closedBy, placeOrder)
      .finally(() => {
        this.positionLocks.delete(positionId);
      });

    this.positionLocks.set(positionId, closePromise);
    return closePromise;
  }

  async _closePositionInternal(positionId, exitPrice, exitReason, closedBy, placeOrder) {
    const position = await this.getPosition(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    if (position.status !== 'OPEN') {
      throw new Error(`Position is already ${position.status}`);
    }

    // Phase 4: Place exit order if order placement service is available and enabled
    if (this.orderPlacementService && placeOrder) {
      try {
        const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [position.instance_id]);

        if (instance && instance.order_placement_enabled) {
          const orderResult = await this.orderPlacementService.placeExitOrder(
            instance,
            position,
            exitReason
          );

          console.log(`[PositionManager] Exit order placed: ${orderResult.order_id}`);

          // Update position status to CLOSING until order fills
          await this.dbAsync.run(`
            UPDATE watchlist_positions
            SET status = 'CLOSING', exit_reason = ?
            WHERE id = ?
          `, [exitReason, positionId]);

          // OrderStatusTracker will update position when order fills
          return await this.getPosition(positionId);
        }
      } catch (orderError) {
        console.error(`[PositionManager] Failed to place exit order:`, orderError.message);

        // Fall through to manual close if order placement fails
        console.log(`[PositionManager] Falling back to manual close`);
      }
    }

    // Manual close (no order placement) or fallback
    // Calculate P&L
    const pnl = this.calculatePnL(position, exitPrice);

    // Update position
    await this.dbAsync.run(`
      UPDATE watchlist_positions
      SET
        status = 'CLOSED',
        exit_price = ?,
        exit_reason = ?,
        pnl = ?,
        exited_at = datetime('now'),
        closed_by = ?
      WHERE id = ?
    `, [exitPrice, exitReason, pnl, closedBy, positionId]);

    // Create alert
    const alertSeverity = pnl >= 0 ? 'INFO' : 'WARNING';
    await this.alertService.createAlert(
      'POSITION_CLOSED',
      alertSeverity,
      `Position closed: ${position.symbol} @ ₹${exitPrice} | P&L: ₹${pnl.toFixed(2)} (${exitReason})`,
      {
        position_id: positionId,
        symbol: position.symbol,
        exchange: position.exchange,
        direction: position.direction,
        entry_price: position.entry_price,
        exit_price: exitPrice,
        quantity: position.quantity,
        pnl,
        exit_reason: exitReason
      },
      position.instance_id,
      position.watchlist_id
    );

    console.log(`[PositionManager] Position closed: ${position.symbol} @ ₹${exitPrice} | P&L: ₹${pnl.toFixed(2)}`);

    return await this.getPosition(positionId);
  }

  /**
   * Calculate P&L for a position
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
   * Get position details
   */
  async getPosition(positionId) {
    return await this.dbAsync.get(`
      SELECT
        p.*,
        ws.exchange,
        ws.symbol,
        ws.token,
        i.name as instance_name,
        w.name as watchlist_name
      FROM watchlist_positions p
      JOIN watchlist_symbols ws ON ws.id = p.symbol_id
      JOIN instances i ON i.id = p.instance_id
      JOIN watchlists w ON w.id = p.watchlist_id
      WHERE p.id = ?
    `, [positionId]);
  }

  /**
   * Get all open positions
   */
  async getOpenPositions(filters = {}) {
    let query = `
      SELECT
        p.*,
        ws.exchange,
        ws.symbol,
        ws.token,
        i.name as instance_name,
        w.name as watchlist_name,
        md.ltp as current_ltp
      FROM watchlist_positions p
      JOIN watchlist_symbols ws ON ws.id = p.symbol_id
      JOIN instances i ON i.id = p.instance_id
      JOIN watchlists w ON w.id = p.watchlist_id
      LEFT JOIN market_data md ON md.exchange = ws.exchange AND md.symbol = ws.symbol
      WHERE p.status = 'OPEN'
    `;

    const params = [];

    if (filters.instanceId) {
      query += ' AND p.instance_id = ?';
      params.push(filters.instanceId);
    }

    if (filters.watchlistId) {
      query += ' AND p.watchlist_id = ?';
      params.push(filters.watchlistId);
    }

    if (filters.symbolId) {
      query += ' AND p.symbol_id = ?';
      params.push(filters.symbolId);
    }

    query += ' ORDER BY p.entered_at DESC';

    return await this.dbAsync.all(query, params);
  }

  /**
   * Get position statistics
   */
  async getPositionStats() {
    const stats = await this.dbAsync.get(`
      SELECT
        COUNT(*) as total_positions,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_positions,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_positions,
        SUM(CASE WHEN status = 'CLOSED' AND pnl > 0 THEN 1 ELSE 0 END) as profitable_positions,
        SUM(CASE WHEN status = 'CLOSED' AND pnl < 0 THEN 1 ELSE 0 END) as loss_positions,
        SUM(CASE WHEN status = 'CLOSED' THEN pnl ELSE 0 END) as total_pnl,
        AVG(CASE WHEN status = 'CLOSED' THEN pnl ELSE NULL END) as avg_pnl,
        MAX(CASE WHEN status = 'CLOSED' THEN pnl ELSE NULL END) as max_profit,
        MIN(CASE WHEN status = 'CLOSED' THEN pnl ELSE NULL END) as max_loss
      FROM watchlist_positions
    `);

    return stats;
  }

  /**
   * Log position limit violation
   */
  async logViolation(violationType, instanceId, symbolId, watchlistId, details) {
    await this.dbAsync.run(`
      INSERT INTO position_limit_violations (
        violation_type,
        instance_id,
        symbol_id,
        watchlist_id,
        attempted_quantity,
        attempted_capital,
        current_positions,
        limit_value,
        details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      violationType,
      instanceId,
      symbolId,
      watchlistId,
      details.attempted_quantity || null,
      details.attempted_capital || null,
      details.current || null,
      details.limit || null,
      JSON.stringify(details)
    ]);

    console.log(`[PositionManager] Position limit violation: ${violationType}`);
  }
}

export default PositionManager;
