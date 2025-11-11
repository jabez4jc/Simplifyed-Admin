/**
 * Rule Evaluator
 * Evaluates exit signals and manages trailing stops for watchlist positions
 * Phase 3: Rule Evaluation Engine
 */

class RuleEvaluator {
  constructor(dbAsync, positionManager, alertService, wsManager) {
    this.dbAsync = dbAsync;
    this.positionManager = positionManager;
    this.alertService = alertService;
    this.wsManager = wsManager;
  }

  /**
   * Evaluate all open positions for exit signals
   * Called continuously by monitoring loop
   */
  async evaluateExitSignals() {
    try {
      // Get all open positions with symbol details
      const positions = await this.dbAsync.all(`
        SELECT
          p.*,
          ws.exchange,
          ws.symbol,
          ws.token,
          sc.ts_type,
          sc.ts_value,
          sc.trailing_activation_type,
          sc.trailing_activation_value
        FROM watchlist_positions p
        JOIN watchlist_symbols ws ON ws.id = p.symbol_id
        LEFT JOIN symbol_configs sc ON sc.symbol_id = ws.id
        WHERE p.is_closed = 0
      `);

      if (positions.length === 0) {
        return { evaluated: 0, closed: 0 };
      }

      let closedCount = 0;

      // Evaluate each position
      for (const position of positions) {
        try {
          // Get current market price
          const marketData = this.wsManager.getLatestMarketData(position.exchange, position.symbol);

          if (!marketData || !marketData.ltp) {
            console.log(`[RuleEvaluator] No market data for ${position.symbol}`);
            continue;
          }

          const currentLTP = parseFloat(marketData.ltp);

          // Check exit conditions
          const exitSignal = await this.checkExitConditions(position, currentLTP);

          if (exitSignal.shouldExit) {
            // Close position
            await this.positionManager.closePosition(
              position.id,
              currentLTP,
              exitSignal.reason,
              'SYSTEM_AUTO'
            );
            closedCount++;
            console.log(`[RuleEvaluator] Position closed: ${position.symbol} @ ₹${currentLTP} (${exitSignal.reason})`);
          } else {
            // Update trailing stop if applicable
            await this.updateTrailingStop(position, currentLTP);
          }
        } catch (error) {
          console.error(`[RuleEvaluator] Error evaluating position ${position.id}:`, error.message);
        }
      }

      return { evaluated: positions.length, closed: closedCount };
    } catch (error) {
      console.error('[RuleEvaluator] Error in evaluateExitSignals:', error);
      throw error;
    }
  }

  /**
   * Check if position should exit (target, SL, or trailing stop hit)
   */
  async checkExitConditions(position, currentLTP) {
    const { direction, target_price, sl_price, trailing_stop_price, trailing_activated } = position;

    // For LONG positions
    if (direction === 'LONG') {
      // Check target hit
      if (target_price && currentLTP >= target_price) {
        return {
          shouldExit: true,
          reason: 'TARGET_HIT',
          exitPrice: currentLTP
        };
      }

      // Check stop loss hit
      if (sl_price && currentLTP <= sl_price) {
        return {
          shouldExit: true,
          reason: 'STOP_LOSS',
          exitPrice: currentLTP
        };
      }

      // Check trailing stop hit
      if (trailing_activated && trailing_stop_price && currentLTP <= trailing_stop_price) {
        return {
          shouldExit: true,
          reason: 'TRAILING_STOP',
          exitPrice: currentLTP
        };
      }
    }

    // For SHORT positions
    if (direction === 'SHORT') {
      // Check target hit
      if (target_price && currentLTP <= target_price) {
        return {
          shouldExit: true,
          reason: 'TARGET_HIT',
          exitPrice: currentLTP
        };
      }

      // Check stop loss hit
      if (sl_price && currentLTP >= sl_price) {
        return {
          shouldExit: true,
          reason: 'STOP_LOSS',
          exitPrice: currentLTP
        };
      }

      // Check trailing stop hit
      if (trailing_activated && trailing_stop_price && currentLTP >= trailing_stop_price) {
        return {
          shouldExit: true,
          reason: 'TRAILING_STOP',
          exitPrice: currentLTP
        };
      }
    }

    return { shouldExit: false };
  }

  /**
   * Update trailing stop based on price movement
   * Implements: "if price moves x points/%, trail by y points/%"
   */
  async updateTrailingStop(position, currentLTP) {
    const {
      id,
      direction,
      entry_price,
      highest_price_seen,
      lowest_price_seen,
      trailing_activated,
      trailing_stop_price,
      trailing_activation_type,
      trailing_activation_value,
      ts_type,
      ts_value,
      target_price
    } = position;

    // Skip if no trailing stop configured
    if (!ts_type || !ts_value) {
      return;
    }

    let updates = {};
    let needsUpdate = false;
    let shouldActivate = false;

    // Check if trailing stop should be activated
    if (!trailing_activated) {
      shouldActivate = await this.checkTrailingActivation(
        position,
        currentLTP,
        trailing_activation_type,
        trailing_activation_value
      );

      if (shouldActivate) {
        updates.trailing_activated = 1;
        needsUpdate = true;

        // Calculate initial trailing stop
        const initialTS = this.calculateTrailingStopPrice(
          currentLTP,
          direction,
          ts_type,
          ts_value
        );
        updates.trailing_stop_price = initialTS;

        await this.alertService.createAlert(
          'TRAILING_STOP_ACTIVATED',
          'INFO',
          `Trailing stop activated for ${position.symbol} @ ₹${initialTS.toFixed(2)}`,
          {
            position_id: id,
            symbol: position.symbol,
            current_ltp: currentLTP,
            trailing_stop_price: initialTS,
            activation_type: trailing_activation_type
          },
          position.instance_id,
          position.watchlist_id
        );

        console.log(`[RuleEvaluator] Trailing stop activated: ${position.symbol} @ ₹${initialTS.toFixed(2)}`);
      }
    }

    // Update highest/lowest price seen
    if (direction === 'LONG') {
      if (!highest_price_seen || currentLTP > highest_price_seen) {
        updates.highest_price_seen = currentLTP;
        needsUpdate = true;

        // Update trailing stop if activated
        if (trailing_activated || shouldActivate) {
          const newTS = this.calculateTrailingStopPrice(
            currentLTP,
            direction,
            ts_type,
            ts_value
          );

          // Only trail up, never down
          if (!trailing_stop_price || newTS > trailing_stop_price) {
            updates.trailing_stop_price = newTS;
            console.log(`[RuleEvaluator] Trailing stop updated: ${position.symbol} ₹${trailing_stop_price?.toFixed(2)} → ₹${newTS.toFixed(2)}`);
          }
        }
      }
    } else if (direction === 'SHORT') {
      if (!lowest_price_seen || currentLTP < lowest_price_seen) {
        updates.lowest_price_seen = currentLTP;
        needsUpdate = true;

        // Update trailing stop if activated
        if (trailing_activated || shouldActivate) {
          const newTS = this.calculateTrailingStopPrice(
            currentLTP,
            direction,
            ts_type,
            ts_value
          );

          // Only trail down, never up
          if (!trailing_stop_price || newTS < trailing_stop_price) {
            updates.trailing_stop_price = newTS;
            console.log(`[RuleEvaluator] Trailing stop updated: ${position.symbol} ₹${trailing_stop_price?.toFixed(2)} → ₹${newTS.toFixed(2)}`);
          }
        }
      }
    }

    // Apply updates if needed
    if (needsUpdate) {
      const setClauses = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), id];

      await this.dbAsync.run(
        `UPDATE watchlist_positions SET ${setClauses} WHERE id = ?`,
        values
      );
    }
  }

  /**
   * Check if trailing stop should be activated
   */
  async checkTrailingActivation(position, currentLTP, activationType, activationValue) {
    if (!activationType || activationType === 'IMMEDIATE') {
      return true; // Already activated at entry
    }

    const { direction, entry_price, target_price } = position;

    if (activationType === 'AFTER_TARGET') {
      // Activate after target is hit
      if (direction === 'LONG') {
        return target_price && currentLTP >= target_price;
      } else {
        return target_price && currentLTP <= target_price;
      }
    }

    if (activationType === 'AFTER_MOVE' && activationValue) {
      // Activate after price moves by specified amount
      // activationValue format: "50" (points) or "2.5" (percentage if < 100)

      const threshold = parseFloat(activationValue);

      // Determine if it's percentage or points
      // Convention: values < 100 are treated as percentage
      const isPercentage = threshold < 100;

      if (isPercentage) {
        const movePercent = Math.abs((currentLTP - entry_price) / entry_price * 100);
        return movePercent >= threshold;
      } else {
        const movePoints = Math.abs(currentLTP - entry_price);
        return movePoints >= threshold;
      }
    }

    return false;
  }

  /**
   * Calculate trailing stop price based on current LTP
   * Implements "trail by y points/%" logic
   */
  calculateTrailingStopPrice(currentLTP, direction, tsType, tsValue) {
    const trailValue = parseFloat(tsValue);

    if (tsType === 'PERCENTAGE') {
      const trailPct = trailValue / 100;

      if (direction === 'LONG') {
        // Trail below current price
        return currentLTP * (1 - trailPct);
      } else {
        // Trail above current price
        return currentLTP * (1 + trailPct);
      }
    } else if (tsType === 'POINTS') {
      if (direction === 'LONG') {
        // Trail below current price
        return currentLTP - trailValue;
      } else {
        // Trail above current price
        return currentLTP + trailValue;
      }
    }

    return null;
  }

  /**
   * Get positions approaching exit levels
   * Useful for alerts and monitoring
   */
  async getPositionsNearExit(thresholdPercent = 5) {
    const positions = await this.dbAsync.all(`
      SELECT
        p.*,
        ws.exchange,
        ws.symbol,
        ws.token
      FROM watchlist_positions p
      JOIN watchlist_symbols ws ON ws.id = p.symbol_id
      WHERE p.status = 'OPEN'
    `);

    const nearExit = [];

    for (const position of positions) {
      const marketData = this.wsManager.getLatestMarketData(position.exchange, position.symbol);

      if (!marketData || !marketData.ltp) {
        continue;
      }

      const currentLTP = parseFloat(marketData.ltp);
      const { direction, entry_price, target_price, sl_price, trailing_stop_price } = position;

      // Calculate distances
      const entryToTarget = target_price ? Math.abs(target_price - entry_price) : 0;
      const entryToSL = sl_price ? Math.abs(entry_price - sl_price) : 0;

      // Check if near target
      if (target_price) {
        const distanceToTarget = Math.abs(currentLTP - target_price);
        const targetThreshold = entryToTarget * (thresholdPercent / 100);

        if (distanceToTarget <= targetThreshold) {
          nearExit.push({
            ...position,
            current_ltp: currentLTP,
            near_level: 'TARGET',
            distance: distanceToTarget,
            level_price: target_price
          });
          continue;
        }
      }

      // Check if near stop loss
      if (sl_price) {
        const distanceToSL = Math.abs(currentLTP - sl_price);
        const slThreshold = entryToSL * (thresholdPercent / 100);

        if (distanceToSL <= slThreshold) {
          nearExit.push({
            ...position,
            current_ltp: currentLTP,
            near_level: 'STOP_LOSS',
            distance: distanceToSL,
            level_price: sl_price
          });
          continue;
        }
      }

      // Check if near trailing stop
      if (trailing_stop_price) {
        const distanceToTS = Math.abs(currentLTP - trailing_stop_price);
        const tsThreshold = Math.abs(entry_price) * (thresholdPercent / 100);

        if (distanceToTS <= tsThreshold) {
          nearExit.push({
            ...position,
            current_ltp: currentLTP,
            near_level: 'TRAILING_STOP',
            distance: distanceToTS,
            level_price: trailing_stop_price
          });
        }
      }
    }

    return nearExit;
  }

  /**
   * Get position evaluation summary
   */
  async getEvaluationSummary() {
    const openPositions = await this.dbAsync.all(`
      SELECT
        p.*,
        ws.exchange,
        ws.symbol
      FROM watchlist_positions p
      JOIN watchlist_symbols ws ON ws.id = p.symbol_id
      WHERE p.status = 'OPEN'
    `);

    const summary = {
      total_open: openPositions.length,
      with_trailing_active: 0,
      with_trailing_inactive: 0,
      near_target: 0,
      near_sl: 0,
      positions: []
    };

    for (const position of openPositions) {
      const marketData = this.wsManager.getLatestMarketData(position.exchange, position.symbol);
      const currentLTP = marketData?.ltp ? parseFloat(marketData.ltp) : null;

      if (position.trailing_activated) {
        summary.with_trailing_active++;
      } else if (position.ts_type && position.ts_value) {
        summary.with_trailing_inactive++;
      }

      // Calculate unrealized P&L
      const unrealizedPnL = currentLTP
        ? this.positionManager.calculatePnL(position, currentLTP)
        : 0;

      summary.positions.push({
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        entry_price: position.entry_price,
        current_ltp: currentLTP,
        unrealized_pnl: unrealizedPnL,
        target_price: position.target_price,
        sl_price: position.sl_price,
        trailing_stop_price: position.trailing_stop_price,
        trailing_activated: position.trailing_activated
      });
    }

    return summary;
  }
}

export default RuleEvaluator;
