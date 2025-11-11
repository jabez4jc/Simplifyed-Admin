/**
 * Position Management Routes
 * API endpoints for manual position entry and management
 * Phase 3: Rule Evaluation Engine
 */

import express from 'express';
import { requireAuth } from '../auth.js';

const router = express.Router();

/**
 * Initialize position routes
 */
export default function createPositionRoutes(dbAsync, positionManager, ruleEvaluator, alertService) {

  // =====================================
  // Position Management Endpoints
  // =====================================

  /**
   * GET /api/positions
   * Get all positions with optional filters
   */
  router.get('/', requireAuth, async (req, res) => {
    try {
      const { instanceId, watchlistId, symbolId, status } = req.query;

      const filters = {};
      if (instanceId) filters.instanceId = parseInt(instanceId);
      if (watchlistId) filters.watchlistId = parseInt(watchlistId);
      if (symbolId) filters.symbolId = parseInt(symbolId);

      let positions;
      if (status === 'open' || !status) {
        positions = await positionManager.getOpenPositions(filters);
      } else {
        // Get all positions including closed
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
          WHERE 1=1
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
        if (status) {
          query += ' AND p.status = ?';
          params.push(status.toUpperCase());
        }

        query += ' ORDER BY p.entered_at DESC LIMIT 500';

        positions = await dbAsync.all(query, params);
      }

      // Calculate unrealized P&L for open positions
      for (const position of positions) {
        if (position.status === 'OPEN' && position.current_ltp) {
          position.unrealized_pnl = positionManager.calculatePnL(position, parseFloat(position.current_ltp));
        }
      }

      res.json({
        success: true,
        count: positions.length,
        positions
      });
    } catch (error) {
      console.error('[Positions API] Error fetching positions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch positions',
        message: error.message
      });
    }
  });

  /**
   * GET /api/positions/:id
   * Get specific position details
   */
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const position = await positionManager.getPosition(positionId);

      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found'
        });
      }

      // Add current unrealized P&L if open
      if (position.status === 'OPEN') {
        const marketData = await dbAsync.get(
          'SELECT ltp FROM market_data WHERE exchange = ? AND symbol = ?',
          [position.exchange, position.symbol]
        );

        if (marketData && marketData.ltp) {
          position.current_ltp = marketData.ltp;
          position.unrealized_pnl = positionManager.calculatePnL(position, parseFloat(marketData.ltp));
        }
      }

      res.json({
        success: true,
        position
      });
    } catch (error) {
      console.error('[Positions API] Error fetching position:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch position',
        message: error.message
      });
    }
  });

  /**
   * POST /api/positions/open
   * Open a new position (Manual Entry)
   */
  router.post('/open', requireAuth, async (req, res) => {
    try {
      const {
        instanceId,
        symbolId,
        watchlistId,
        entryPrice,
        quantity,
        direction = 'LONG',
        orderType = 'MARKET',
        productType = 'MIS'
      } = req.body;

      // Validation
      if (!instanceId || !symbolId || !watchlistId || !entryPrice || !quantity) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required: ['instanceId', 'symbolId', 'watchlistId', 'entryPrice', 'quantity']
        });
      }

      if (!['LONG', 'SHORT'].includes(direction)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid direction. Must be LONG or SHORT'
        });
      }

      if (parseFloat(entryPrice) <= 0 || parseInt(quantity) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Entry price and quantity must be positive numbers'
        });
      }

      // Open position
      const position = await positionManager.openPosition({
        instanceId: parseInt(instanceId),
        symbolId: parseInt(symbolId),
        watchlistId: parseInt(watchlistId),
        entryPrice: parseFloat(entryPrice),
        quantity: parseInt(quantity),
        direction,
        orderType,
        productType,
        enteredBy: req.user.email
      });

      res.json({
        success: true,
        message: 'Position opened successfully',
        position
      });
    } catch (error) {
      console.error('[Positions API] Error opening position:', error);

      // Check if it's a limit violation
      if (error.message.includes('limit') || error.message.includes('Maximum')) {
        return res.status(400).json({
          success: false,
          error: 'Position limit violation',
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to open position',
        message: error.message
      });
    }
  });

  /**
   * POST /api/positions/:id/close
   * Close a position manually
   */
  router.post('/:id/close', requireAuth, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const { exitPrice, exitReason = 'MANUAL_CLOSE' } = req.body;

      // Validate exit price
      let finalExitPrice = exitPrice;
      if (!finalExitPrice) {
        // Get current market price
        const position = await positionManager.getPosition(positionId);
        if (!position) {
          return res.status(404).json({
            success: false,
            error: 'Position not found'
          });
        }

        const marketData = await dbAsync.get(
          'SELECT ltp FROM market_data WHERE exchange = ? AND symbol = ?',
          [position.exchange, position.symbol]
        );

        if (!marketData || !marketData.ltp) {
          return res.status(400).json({
            success: false,
            error: 'Exit price required (no market data available)'
          });
        }

        finalExitPrice = parseFloat(marketData.ltp);
      } else {
        finalExitPrice = parseFloat(finalExitPrice);
        if (finalExitPrice <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Exit price must be a positive number'
          });
        }
      }

      // Close position
      const position = await positionManager.closePosition(
        positionId,
        finalExitPrice,
        exitReason,
        req.user.email
      );

      res.json({
        success: true,
        message: 'Position closed successfully',
        position
      });
    } catch (error) {
      console.error('[Positions API] Error closing position:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to close position',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/positions/:id/update-levels
   * Update target, SL, or trailing stop levels
   */
  router.put('/:id/update-levels', requireAuth, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const { targetPrice, slPrice, trailingStopPrice } = req.body;

      const position = await positionManager.getPosition(positionId);
      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'Position not found'
        });
      }

      if (position.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: 'Cannot update levels for closed position'
        });
      }

      const updates = [];
      const params = [];

      if (targetPrice !== undefined) {
        updates.push('target_price = ?');
        params.push(parseFloat(targetPrice) || null);
      }

      if (slPrice !== undefined) {
        updates.push('sl_price = ?');
        params.push(parseFloat(slPrice) || null);
      }

      if (trailingStopPrice !== undefined) {
        updates.push('trailing_stop_price = ?');
        params.push(parseFloat(trailingStopPrice) || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No updates provided'
        });
      }

      params.push(positionId);

      await dbAsync.run(
        `UPDATE watchlist_positions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      const updatedPosition = await positionManager.getPosition(positionId);

      res.json({
        success: true,
        message: 'Position levels updated successfully',
        position: updatedPosition
      });
    } catch (error) {
      console.error('[Positions API] Error updating position levels:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update position levels',
        message: error.message
      });
    }
  });

  /**
   * GET /api/positions/stats
   * Get position statistics
   */
  router.get('/stats/summary', requireAuth, async (req, res) => {
    try {
      const stats = await positionManager.getPositionStats();
      const evaluationSummary = await ruleEvaluator.getEvaluationSummary();

      res.json({
        success: true,
        stats: {
          ...stats,
          evaluation: evaluationSummary
        }
      });
    } catch (error) {
      console.error('[Positions API] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch position statistics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/positions/near-exit
   * Get positions approaching exit levels
   */
  router.get('/alerts/near-exit', requireAuth, async (req, res) => {
    try {
      const thresholdPercent = parseFloat(req.query.threshold) || 5;
      const positionsNearExit = await ruleEvaluator.getPositionsNearExit(thresholdPercent);

      res.json({
        success: true,
        threshold_percent: thresholdPercent,
        count: positionsNearExit.length,
        positions: positionsNearExit
      });
    } catch (error) {
      console.error('[Positions API] Error fetching positions near exit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch positions near exit',
        message: error.message
      });
    }
  });

  // =====================================
  // Position Limits Configuration (Admin Only)
  // =====================================

  /**
   * GET /api/position-limits
   * Get current position limits configuration
   */
  router.get('/limits', requireAuth, async (req, res) => {
    try {
      const limits = await positionManager.getPositionLimits();

      res.json({
        success: true,
        limits
      });
    } catch (error) {
      console.error('[Positions API] Error fetching position limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch position limits',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/position-limits
   * Update position limits (Admin only)
   */
  router.put('/limits', requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      const userRecord = await dbAsync.get('SELECT is_admin FROM users WHERE email = ?', [req.user.email]);

      if (!userRecord || !userRecord.is_admin) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const {
        max_open_positions,
        max_positions_per_symbol,
        max_capital_per_position,
        max_total_capital_deployed
      } = req.body;

      // Validation
      if (!max_open_positions || max_open_positions < 1) {
        return res.status(400).json({
          success: false,
          error: 'max_open_positions must be at least 1'
        });
      }

      if (!max_positions_per_symbol || max_positions_per_symbol < 1) {
        return res.status(400).json({
          success: false,
          error: 'max_positions_per_symbol must be at least 1'
        });
      }

      // Update limits
      const updatedLimits = await positionManager.updatePositionLimits({
        max_open_positions: parseInt(max_open_positions),
        max_positions_per_symbol: parseInt(max_positions_per_symbol),
        max_capital_per_position: max_capital_per_position ? parseFloat(max_capital_per_position) : null,
        max_total_capital_deployed: max_total_capital_deployed ? parseFloat(max_total_capital_deployed) : null
      }, req.user.email);

      // Create alert
      await alertService.createAlert(
        'POSITION_LIMITS_UPDATED',
        'INFO',
        `Position limits updated by ${req.user.name}`,
        {
          max_open_positions: updatedLimits.max_open_positions,
          max_positions_per_symbol: updatedLimits.max_positions_per_symbol,
          updated_by: req.user.email
        }
      );

      res.json({
        success: true,
        message: 'Position limits updated successfully',
        limits: updatedLimits
      });
    } catch (error) {
      console.error('[Positions API] Error updating position limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update position limits',
        message: error.message
      });
    }
  });

  /**
   * GET /api/position-limits/violations
   * Get position limit violation history (Admin only)
   */
  router.get('/limits/violations', requireAuth, async (req, res) => {
    try {
      // Check if user is admin
      const userRecord = await dbAsync.get('SELECT is_admin FROM users WHERE email = ?', [req.user.email]);

      if (!userRecord || !userRecord.is_admin) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const limit = parseInt(req.query.limit) || 100;

      const violations = await dbAsync.all(`
        SELECT
          v.*,
          ws.symbol,
          ws.exchange,
          i.name as instance_name,
          w.name as watchlist_name
        FROM position_limit_violations v
        LEFT JOIN watchlist_symbols ws ON ws.id = v.symbol_id
        LEFT JOIN instances i ON i.id = v.instance_id
        LEFT JOIN watchlists w ON w.id = v.watchlist_id
        ORDER BY v.created_at DESC
        LIMIT ?
      `, [limit]);

      res.json({
        success: true,
        count: violations.length,
        violations
      });
    } catch (error) {
      console.error('[Positions API] Error fetching violations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch violations',
        message: error.message
      });
    }
  });

  return router;
}
