/**
 * Symbol Management Routes
 * Handles adding/removing symbols to watchlists and managing symbol configurations
 */

import express from 'express';
import { requireAdminAccess } from '../auth.js';
import { validateOpenAlgoSymbol } from '../lib/openalgo-search.js';

const router = express.Router();

/**
 * POST /api/symbols/validate
 * Validate symbol and get metadata including lot size from OpenAlgo search API
 */
router.post('/validate', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { symbol, exchange } = req.body;

    // Validation
    if (!symbol || !exchange) {
      return res.status(400).json({
        status: 'error',
        message: 'Symbol and exchange are required'
      });
    }

    // Call OpenAlgo search API
    const validation = await validateOpenAlgoSymbol({ symbol, exchange, dbAsync });

    if (!validation.valid) {
      return res.status(400).json({
        status: 'error',
        message: validation.reason || 'Symbol validation failed',
        valid: false
      });
    }

    // Extract metadata from results
    const results = validation.results || [];
    let metadata = null;

    if (results.length > 0) {
      const firstResult = results[0];

      // Extract common metadata fields from different API response formats
      metadata = {
        symbol: firstResult.symbol || firstResult.tradingsymbol || symbol,
        exchange: firstResult.exchange || firstResult.exch || firstResult.segment || exchange,
        lotsize: firstResult.lotsize || firstResult.lot_size || firstResult.lotsize || 1,
        tick_size: firstResult.tick_size || firstResult.ticksize || null,
        expiry: firstResult.expiry || firstResult.expiry_date || null,
        strike: firstResult.strike || null,
        option_type: firstResult.option_type || firstResult.opt_type || null,
        instrument_type: firstResult.instrument_type || firstResult.instrument || firstResult.exercise_type || null,
        exchange_segment: firstResult.exchange_segment || firstResult.segment || null,
        trading_symbol: firstResult.tradingsymbol || firstResult.symbol,
        name: firstResult.name || firstResult.companyname || null,
        isin: firstResult.isin || null
      };

      // If lotsize is still not found, use the hardcoded defaults as last resort
      if (!metadata.lotsize || metadata.lotsize === 1) {
        const exchangeUpper = exchange.toUpperCase();
        if (exchangeUpper === 'NFO') {
          metadata.lotsize = 25;
        } else if (exchangeUpper === 'MCX') {
          metadata.lotsize = 1000;
        } else {
          metadata.lotsize = 1;
        }
      }
    }

    res.json({
      status: 'success',
      valid: true,
      data: {
        symbol: symbol.toUpperCase(),
        exchange: exchange.toUpperCase(),
        metadata
      }
    });
  } catch (error) {
    console.error('Error validating symbol:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to validate symbol',
      error: error.message
    });
  }
});

/**
 * GET /api/watchlists/:watchlistId/symbols
 * Get all symbols in a watchlist with their configurations
 */
router.get('/:watchlistId/symbols', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { watchlistId } = req.params;

    // Check if watchlist exists
    const watchlist = await dbAsync.get(
      'SELECT id FROM watchlists WHERE id = ?',
      [watchlistId]
    );

    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Get symbols with configurations and market data
    const symbols = await dbAsync.all(`
      SELECT
        ws.id,
        ws.exchange,
        ws.symbol,
        ws.display_order,
        ws.added_at,
        sc.qty_type,
        sc.qty_value,
        sc.target_type,
        sc.target_value,
        sc.sl_type,
        sc.sl_value,
        sc.ts_type,
        sc.ts_value,
        sc.product_type,
        sc.order_type,
        sc.max_position_size,
        sc.max_instances,
        sc.is_enabled,
        md.ltp,
        md.open,
        md.high,
        md.low,
        md.volume,
        md.last_updated as ltp_updated
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.watchlist_id = ws.watchlist_id AND sc.symbol_id = ws.id
      LEFT JOIN market_data md ON md.exchange = ws.exchange AND md.symbol = ws.symbol
      WHERE ws.watchlist_id = ?
      ORDER BY ws.display_order, ws.added_at
    `, [watchlistId]);

    res.json({
      status: 'success',
      data: symbols
    });
  } catch (error) {
    console.error('Error fetching symbols:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch symbols',
      error: error.message
    });
  }
});

/**
 * POST /api/watchlists/:watchlistId/symbols
 * Add symbol to watchlist (Admin only)
 */
router.post('/:watchlistId/symbols', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { watchlistId } = req.params;
    const {
      exchange,
      symbol,
      // V2 Quantity Fields
      qty_mode,
      qty_value,
      qty_units,
      lot_size,
      min_qty_per_click,
      max_qty_per_click,
      capital_ceiling_per_trade,
      contract_multiplier,
      rounding,
      // V1 Legacy Field
      qty_type,
      // Other Fields
      product_type,
      order_type,
      is_enabled,
      // F&O Configuration Fields
      can_trade_equity,
      can_trade_futures,
      can_trade_options,
      options_strike_offset,
      options_expiry_mode,
      // Per-Type Quantity Fields (NEW)
      equity_qty_mode,
      equity_qty_value,
      equity_qty_units,
      futures_qty_mode,
      futures_qty_value,
      futures_qty_units,
      options_qty_mode,
      options_qty_value,
      options_qty_units
    } = req.body;

    // Validation
    if (!exchange || !symbol) {
      return res.status(400).json({
        status: 'error',
        message: 'Exchange and symbol are required'
      });
    }

    // Validate qty_mode if provided
    if (qty_mode && !['fixed', 'capital', 'funds_percent'].includes(qty_mode)) {
      return res.status(400).json({
        status: 'error',
        message: 'qty_mode must be fixed, capital, or funds_percent'
      });
    }

    // Validate qty_units if provided
    if (qty_units && !['units', 'lots'].includes(qty_units)) {
      return res.status(400).json({
        status: 'error',
        message: 'qty_units must be units or lots'
      });
    }

    // Validate symbol using admin instance
    const validation = await validateOpenAlgoSymbol({ symbol, exchange, dbAsync });
    if (!validation.valid) {
      return res.status(400).json({
        status: 'error',
        message: validation.reason || 'Symbol failed OpenAlgo validation'
      });
    }

    // Check if watchlist exists
    const watchlist = await dbAsync.get(
      'SELECT id FROM watchlists WHERE id = ?',
      [watchlistId]
    );

    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Check for duplicate
    const existing = await dbAsync.get(
      'SELECT id FROM watchlist_symbols WHERE watchlist_id = ? AND exchange = ? AND symbol = ?',
      [watchlistId, exchange.toUpperCase(), symbol.toUpperCase()]
    );

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'Symbol already exists in this watchlist'
      });
    }

    // Get max display_order
    const maxOrder = await dbAsync.get(
      'SELECT MAX(display_order) as max_order FROM watchlist_symbols WHERE watchlist_id = ?',
      [watchlistId]
    );

    const displayOrder = (maxOrder?.max_order || 0) + 1;

    // Add symbol
    const result = await dbAsync.run(`
      INSERT INTO watchlist_symbols (watchlist_id, exchange, symbol, display_order)
      VALUES (?, ?, ?, ?)
    `, [watchlistId, exchange.toUpperCase(), symbol.toUpperCase(), displayOrder]);

    // Create configuration with V2 fields
    await dbAsync.run(`
      INSERT INTO symbol_configs (
        watchlist_id, symbol_id,
        qty_mode, qty_type, qty_value, qty_units, lot_size,
        min_qty_per_click, max_qty_per_click, capital_ceiling_per_trade,
        contract_multiplier, rounding,
        product_type, order_type, is_enabled,
        can_trade_equity, can_trade_futures, can_trade_options,
        options_strike_offset, options_expiry_mode,
        equity_qty_mode, equity_qty_value, equity_qty_units,
        futures_qty_mode, futures_qty_value, futures_qty_units,
        options_qty_mode, options_qty_value, options_qty_units
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      watchlistId, result.lastID,

      // V2 Quantity (with V1 fallback)
      qty_mode || (qty_type === 'CAPITAL' ? 'capital' : 'fixed'),
      qty_type || (qty_mode === 'capital' ? 'CAPITAL' : 'FIXED'),
      qty_value || 1,
      qty_units || 'units',
      lot_size || 1,

      // Guardrails
      min_qty_per_click || 1,
      max_qty_per_click || null,
      capital_ceiling_per_trade || null,

      // Advanced
      contract_multiplier || 1.0,
      rounding || 'floor_to_lot',

      // Product/Order
      product_type || 'MIS',
      order_type || 'MARKET',

      // Status
      is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1,

      // F&O Configuration (defaults: equity enabled, futures/options disabled)
      can_trade_equity !== undefined ? (can_trade_equity ? 1 : 0) : 1,
      can_trade_futures !== undefined ? (can_trade_futures ? 1 : 0) : 0,
      can_trade_options !== undefined ? (can_trade_options ? 1 : 0) : 0,
      options_strike_offset || 'ATM',
      options_expiry_mode || 'AUTO',

      // Per-Type Quantity Fields (NEW)
      equity_qty_mode || 'fixed',
      equity_qty_value || 1,
      equity_qty_units || 'units',
      futures_qty_mode || 'fixed',
      futures_qty_value || 1,
      futures_qty_units || 'lots',
      options_qty_mode || 'fixed',
      options_qty_value || 1,
      options_qty_units || 'lots'
    ]);

    // Fetch created symbol with config (including V2 fields)
    const newSymbol = await dbAsync.get(`
      SELECT
        ws.*,
        sc.qty_mode,
        sc.qty_type,
        sc.qty_value,
        sc.qty_units,
        sc.lot_size,
        sc.min_qty_per_click,
        sc.max_qty_per_click,
        sc.capital_ceiling_per_trade,
        sc.contract_multiplier,
        sc.rounding,
        sc.target_type,
        sc.target_value,
        sc.sl_type,
        sc.sl_value,
        sc.ts_type,
        sc.ts_value,
        sc.trailing_activation_type,
        sc.trailing_activation_value,
        sc.product_type,
        sc.order_type,
        sc.max_position_size,
        sc.max_instances,
        sc.is_enabled,
        sc.can_trade_equity,
        sc.can_trade_futures,
        sc.can_trade_options,
        sc.options_strike_offset,
        sc.options_expiry_mode,
        sc.equity_qty_mode,
        sc.equity_qty_value,
        sc.equity_qty_units,
        sc.futures_qty_mode,
        sc.futures_qty_value,
        sc.futures_qty_units,
        sc.options_qty_mode,
        sc.options_qty_value,
        sc.options_qty_units
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.watchlist_id = ws.watchlist_id AND sc.symbol_id = ws.id
      WHERE ws.id = ?
    `, [result.lastID]);

    res.status(201).json({
      status: 'success',
      message: 'Symbol added to watchlist',
      data: newSymbol
    });
  } catch (error) {
    console.error('Error adding symbol:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add symbol',
      error: error.message
    });
  }
});

/**
 * DELETE /api/watchlists/:watchlistId/symbols/:symbolId
 * Remove symbol from watchlist (Admin only)
 */
router.delete('/:watchlistId/symbols/:symbolId', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { watchlistId, symbolId } = req.params;

    // Check if symbol exists
    const symbol = await dbAsync.get(
      'SELECT id, exchange, symbol FROM watchlist_symbols WHERE id = ? AND watchlist_id = ?',
      [symbolId, watchlistId]
    );

    if (!symbol) {
      return res.status(404).json({
        status: 'error',
        message: 'Symbol not found in this watchlist'
      });
    }

    // Delete symbol (CASCADE will handle configs)
    await dbAsync.run(
      'DELETE FROM watchlist_symbols WHERE id = ?',
      [symbolId]
    );

    res.json({
      status: 'success',
      message: `Symbol ${symbol.symbol} removed from watchlist`
    });
  } catch (error) {
    console.error('Error removing symbol:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove symbol',
      error: error.message
    });
  }
});

/**
 * PUT /api/watchlists/:watchlistId/symbols/:symbolId/config
 * Update symbol configuration (Admin only)
 */
router.put('/:watchlistId/symbols/:symbolId/config', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { watchlistId, symbolId } = req.params;
    const {
      // V2 Quantity Fields
      qty_mode,
      qty_value,
      qty_units,
      lot_size,
      min_qty_per_click,
      max_qty_per_click,
      capital_ceiling_per_trade,
      contract_multiplier,
      rounding,

      // V1 Legacy Fields (for backward compatibility)
      qty_type,

      // Other Fields
      target_type,
      target_value,
      sl_type,
      sl_value,
      ts_type,
      ts_value,
      trailing_activation_type,
      trailing_activation_value,
      product_type,
      order_type,
      max_position_size,
      max_instances,
      is_enabled,
      // F&O Configuration Fields
      can_trade_equity,
      can_trade_futures,
      can_trade_options,
      options_strike_offset,
      options_expiry_mode
    } = req.body;

    // Check if symbol exists
    const symbol = await dbAsync.get(
      'SELECT id FROM watchlist_symbols WHERE id = ? AND watchlist_id = ?',
      [symbolId, watchlistId]
    );

    if (!symbol) {
      return res.status(404).json({
        status: 'error',
        message: 'Symbol not found in this watchlist'
      });
    }

    // Validation
    if (qty_mode && !['fixed', 'capital', 'funds_percent'].includes(qty_mode)) {
      return res.status(400).json({
        status: 'error',
        message: 'qty_mode must be fixed, capital, or funds_percent'
      });
    }

    // Validate qty_units if provided
    if (qty_units && !['units', 'lots'].includes(qty_units)) {
      return res.status(400).json({
        status: 'error',
        message: 'qty_units must be units or lots'
      });
    }

    // Validate rounding if provided
    if (rounding && !['floor_to_lot', 'none'].includes(rounding)) {
      return res.status(400).json({
        status: 'error',
        message: 'rounding must be floor_to_lot or none'
      });
    }

    // Legacy V1 validation (for backward compatibility)
    if (qty_type && !['FIXED', 'CAPITAL'].includes(qty_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'qty_type must be FIXED or CAPITAL'
      });
    }

    if (target_type && !['NONE', 'POINTS', 'PERCENTAGE'].includes(target_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'target_type must be NONE, POINTS, or PERCENTAGE'
      });
    }

    if (sl_type && !['NONE', 'POINTS', 'PERCENTAGE'].includes(sl_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'sl_type must be NONE, POINTS, or PERCENTAGE'
      });
    }

    if (ts_type && !['NONE', 'POINTS', 'PERCENTAGE'].includes(ts_type)) {
      return res.status(400).json({
        status: 'error',
        message: 'ts_type must be NONE, POINTS, or PERCENTAGE'
      });
    }

    // Check if config exists
    const existingConfig = await dbAsync.get(
      'SELECT id FROM symbol_configs WHERE watchlist_id = ? AND symbol_id = ?',
      [watchlistId, symbolId]
    );

    if (!existingConfig) {
      // Create new config with all V2 fields
      await dbAsync.run(`
        INSERT INTO symbol_configs (
          watchlist_id, symbol_id,
          qty_mode, qty_type, qty_value, qty_units, lot_size,
          min_qty_per_click, max_qty_per_click, capital_ceiling_per_trade,
          contract_multiplier, rounding,
          target_type, target_value, sl_type, sl_value,
          ts_type, ts_value, trailing_activation_type, trailing_activation_value,
          product_type, order_type,
          max_position_size, max_instances, is_enabled,
          can_trade_equity, can_trade_futures, can_trade_options,
          options_strike_offset, options_expiry_mode
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        watchlistId, symbolId,

        // Quantity (V2 with V1 fallback)
        qty_mode || (qty_type === 'CAPITAL' ? 'capital' : 'fixed'),
        qty_type || (qty_mode === 'capital' ? 'CAPITAL' : 'FIXED'),
        qty_value || 1,
        qty_units || 'units',
        lot_size || 1,

        // Guardrails
        min_qty_per_click || 1,
        max_qty_per_click || null,
        capital_ceiling_per_trade || null,

        // Advanced
        contract_multiplier || 1.0,
        rounding || 'floor_to_lot',

        // Target/SL/TS
        target_type || null,
        target_value || null,
        sl_type || null,
        sl_value || null,
        ts_type || null,
        ts_value || null,
        trailing_activation_type || 'IMMEDIATE',
        trailing_activation_value || null,

        // Product/Order
        product_type || 'MIS',
        order_type || 'MARKET',

        // Limits
        max_position_size || null,
        max_instances || null,

        // Status
        is_enabled !== undefined ? (is_enabled ? 1 : 0) : 1,

        // F&O Configuration (defaults: equity enabled, futures/options disabled)
        can_trade_equity !== undefined ? (can_trade_equity ? 1 : 0) : 1,
        can_trade_futures !== undefined ? (can_trade_futures ? 1 : 0) : 0,
        can_trade_options !== undefined ? (can_trade_options ? 1 : 0) : 0,
        options_strike_offset || 'ATM',
        options_expiry_mode || 'AUTO'
      ]);
    } else {
      // Build update query dynamically
      const updates = [];
      const params = [];

      // V2 Quantity Fields
      if (qty_mode !== undefined) {
        updates.push('qty_mode = ?');
        params.push(qty_mode);
      }

      if (qty_value !== undefined) {
        updates.push('qty_value = ?');
        params.push(qty_value);
      }

      if (qty_units !== undefined) {
        updates.push('qty_units = ?');
        params.push(qty_units);
      }

      if (lot_size !== undefined) {
        updates.push('lot_size = ?');
        params.push(lot_size);
      }

      if (min_qty_per_click !== undefined) {
        updates.push('min_qty_per_click = ?');
        params.push(min_qty_per_click);
      }

      if (max_qty_per_click !== undefined) {
        updates.push('max_qty_per_click = ?');
        params.push(max_qty_per_click);
      }

      if (capital_ceiling_per_trade !== undefined) {
        updates.push('capital_ceiling_per_trade = ?');
        params.push(capital_ceiling_per_trade);
      }

      if (contract_multiplier !== undefined) {
        updates.push('contract_multiplier = ?');
        params.push(contract_multiplier);
      }

      if (rounding !== undefined) {
        updates.push('rounding = ?');
        params.push(rounding);
      }

      // Legacy V1 Field (for backward compatibility)
      if (qty_type !== undefined) {
        updates.push('qty_type = ?');
        params.push(qty_type);
      }

      if (target_type !== undefined) {
        updates.push('target_type = ?');
        params.push(target_type);
      }

      if (target_value !== undefined) {
        updates.push('target_value = ?');
        params.push(target_value);
      }

      if (sl_type !== undefined) {
        updates.push('sl_type = ?');
        params.push(sl_type);
      }

      if (sl_value !== undefined) {
        updates.push('sl_value = ?');
        params.push(sl_value);
      }

      if (ts_type !== undefined) {
        updates.push('ts_type = ?');
        params.push(ts_type);
      }

      if (ts_value !== undefined) {
        updates.push('ts_value = ?');
        params.push(ts_value);
      }

      if (trailing_activation_type !== undefined) {
        updates.push('trailing_activation_type = ?');
        params.push(trailing_activation_type);
      }

      if (trailing_activation_value !== undefined) {
        updates.push('trailing_activation_value = ?');
        params.push(trailing_activation_value);
      }

      if (product_type !== undefined) {
        updates.push('product_type = ?');
        params.push(product_type);
      }

      if (order_type !== undefined) {
        updates.push('order_type = ?');
        params.push(order_type);
      }

      if (max_position_size !== undefined) {
        updates.push('max_position_size = ?');
        params.push(max_position_size);
      }

      if (max_instances !== undefined) {
        updates.push('max_instances = ?');
        params.push(max_instances);
      }

      if (is_enabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(is_enabled ? 1 : 0);
      }

      // F&O Configuration Fields
      if (can_trade_equity !== undefined) {
        updates.push('can_trade_equity = ?');
        params.push(can_trade_equity ? 1 : 0);
      }

      if (can_trade_futures !== undefined) {
        updates.push('can_trade_futures = ?');
        params.push(can_trade_futures ? 1 : 0);
      }

      if (can_trade_options !== undefined) {
        updates.push('can_trade_options = ?');
        params.push(can_trade_options ? 1 : 0);
      }

      if (options_strike_offset !== undefined) {
        updates.push('options_strike_offset = ?');
        params.push(options_strike_offset);
      }

      if (options_expiry_mode !== undefined) {
        updates.push('options_expiry_mode = ?');
        params.push(options_expiry_mode);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(watchlistId, symbolId);

        await dbAsync.run(`
          UPDATE symbol_configs
          SET ${updates.join(', ')}
          WHERE watchlist_id = ? AND symbol_id = ?
        `, params);
      }
    }

    // Fetch updated config
    const config = await dbAsync.get(`
      SELECT
        ws.*,
        sc.qty_type,
        sc.qty_value,
        sc.target_type,
        sc.target_value,
        sc.sl_type,
        sc.sl_value,
        sc.ts_type,
        sc.ts_value,
        sc.product_type,
        sc.order_type,
        sc.max_position_size,
        sc.max_instances,
        sc.is_enabled,
        sc.can_trade_equity,
        sc.can_trade_futures,
        sc.can_trade_options,
        sc.options_strike_offset,
        sc.options_expiry_mode
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.watchlist_id = ws.watchlist_id AND sc.symbol_id = ws.id
      WHERE ws.id = ?
    `, [symbolId]);

    res.json({
      status: 'success',
      message: 'Symbol configuration updated',
      data: config
    });
  } catch (error) {
    console.error('Error updating symbol config:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update symbol configuration',
      error: error.message
    });
  }
});

/**
 * PUT /api/watchlists/:watchlistId/symbols/reorder
 * Reorder symbols in watchlist (Admin only)
 */
router.put('/:watchlistId/symbols/reorder', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { watchlistId } = req.params;
    const { symbol_ids } = req.body;

    // Validation
    if (!Array.isArray(symbol_ids) || symbol_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'symbol_ids must be a non-empty array'
      });
    }

    // Update display_order for each symbol
    for (let i = 0; i < symbol_ids.length; i++) {
      await dbAsync.run(
        'UPDATE watchlist_symbols SET display_order = ? WHERE id = ? AND watchlist_id = ?',
        [i + 1, symbol_ids[i], watchlistId]
      );
    }

    res.json({
      status: 'success',
      message: 'Symbols reordered successfully'
    });
  } catch (error) {
    console.error('Error reordering symbols:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reorder symbols',
      error: error.message
    });
  }
});

export default router;
