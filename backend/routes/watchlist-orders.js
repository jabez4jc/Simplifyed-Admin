/**
 * Watchlist Order Placement Routes
 * Handles order placement for watchlist symbols
 */

import express from 'express';
import { requireAdminAccess } from '../auth.js';

const router = express.Router();

/**
 * POST /api/quotes
 * Get LTP (Last Traded Price) for a symbol
 *
 * Body: {
 *   exchange: "NSE",            // Required: Exchange
 *   symbol: "RELIANCE"          // Required: Symbol
 * }
 */
router.post('/quotes', requireAdminAccess, async (req, res) => {
  const makeOpenAlgoRequest = req.app.locals.makeOpenAlgoRequest;
  const dbAsync = req.app.locals.dbAsync;

  const { exchange, symbol } = req.body;

  if (!exchange || !symbol) {
    return res.status(400).json({ error: 'Exchange and symbol are required' });
  }

  try {
    // Get admin instance for quotes API
    const adminInstance = await dbAsync.get('SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1');

    if (!adminInstance) {
      return res.status(500).json({ error: 'No admin instance available' });
    }

    // Call OpenAlgo quotes API
    const quotesResponse = await makeOpenAlgoRequest(
      adminInstance,
      'quotes',
      'POST',
      { exchange, symbol }
    );

    if (quotesResponse.status === 'success') {
      return res.json({
        status: 'success',
        data: {
          ltp: quotesResponse.data?.ltp || null,
          symbol,
          exchange
        }
      });
    } else {
      return res.status(500).json({ error: quotesResponse.message || 'Failed to fetch quotes' });
    }

  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quotes' });
  }
});

/**
 * POST /api/watchlists/:id/place-orders
 * Place orders for symbols in a watchlist
 *
 * Body: {
 *   symbol_ids: [1, 2, 3],     // Optional: specific symbols, or all enabled if omitted
 *   action: "BUY",              // Required: BUY, SELL, SHORT, COVER
 *   option_type: "CE",          // Optional: CE or PE for options trading
 *   instance_ids: [4, 5],       // Optional: specific instances, or all assigned if omitted
 *   product_type: "MIS",        // Optional: override symbol config
 *   order_type: "MARKET",       // Optional: override symbol config
 *   price: 100.50               // Optional: for LIMIT orders
 * }
 */
router.post('/:id/place-orders', requireAdminAccess, async (req, res) => {
  const dbAsync = req.app.locals.dbAsync;
  const orderPlacementService = req.app.locals.orderPlacementService;
  const makeOpenAlgoRequest = req.app.locals.makeOpenAlgoRequest;

  if (!orderPlacementService) {
    return res.status(500).json({ error: 'Order placement service not initialized' });
  }

  const watchlistId = parseInt(req.params.id);
  const {
    symbol_ids,
    action,
    option_type,
    instance_ids,
    product_type,
    order_type,
    price
  } = req.body;

  // Validate action
  const validActions = ['BUY', 'SELL', 'SHORT', 'COVER'];
  if (!action || !validActions.includes(action.toUpperCase())) {
    return res.status(400).json({ error: `Action must be one of: ${validActions.join(', ')}` });
  }

  // Validate option_type if provided
  if (option_type && !['CE', 'PE'].includes(option_type.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid option_type. Must be CE or PE.' });
  }

  try {
    // Get watchlist details
    const watchlist = await dbAsync.get('SELECT * FROM watchlists WHERE id = ?', [watchlistId]);
    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    // Get symbols to place orders for
    let symbols;
    if (symbol_ids && Array.isArray(symbol_ids) && symbol_ids.length > 0) {
      // Specific symbols requested
      const placeholders = symbol_ids.map(() => '?').join(',');
      symbols = await dbAsync.all(`
        SELECT
          ws.id as symbol_id,
          ws.watchlist_id,
          ws.exchange,
          ws.symbol,
          ws.token,
          sc.*
        FROM watchlist_symbols ws
        LEFT JOIN symbol_configs sc ON ws.id = sc.symbol_id AND ws.watchlist_id = sc.watchlist_id
        WHERE ws.watchlist_id = ? AND ws.id IN (${placeholders}) AND (sc.is_enabled = 1 OR sc.is_enabled IS NULL)
        ORDER BY ws.display_order
      `, [watchlistId, ...symbol_ids]);
    } else {
      // All enabled symbols in watchlist
      symbols = await dbAsync.all(`
        SELECT
          ws.id as symbol_id,
          ws.watchlist_id,
          ws.exchange,
          ws.symbol,
          ws.token,
          sc.*
        FROM watchlist_symbols ws
        LEFT JOIN symbol_configs sc ON ws.id = sc.symbol_id AND ws.watchlist_id = sc.watchlist_id
        WHERE ws.watchlist_id = ? AND (sc.is_enabled = 1 OR sc.is_enabled IS NULL)
        ORDER BY ws.display_order
      `, [watchlistId]);
    }

    if (symbols.length === 0) {
      return res.status(400).json({ error: 'No enabled symbols found in watchlist' });
    }

    // Get instances to place orders with
    let instances;
    if (instance_ids && Array.isArray(instance_ids) && instance_ids.length > 0) {
      // Specific instances requested
      const placeholders = instance_ids.map(() => '?').join(',');
      instances = await dbAsync.all(`
        SELECT i.*
        FROM instances i
        INNER JOIN watchlist_instances wi ON i.id = wi.instance_id
        WHERE wi.watchlist_id = ? AND i.id IN (${placeholders}) AND i.is_active = 1 AND i.order_placement_enabled = 1
      `, [watchlistId, ...instance_ids]);
    } else {
      // All assigned instances
      instances = await dbAsync.all(`
        SELECT i.*
        FROM instances i
        INNER JOIN watchlist_instances wi ON i.id = wi.instance_id
        WHERE wi.watchlist_id = ? AND i.is_active = 1 AND i.order_placement_enabled = 1
      `, [watchlistId]);
    }

    if (instances.length === 0) {
      return res.status(400).json({ error: 'No active instances with order placement enabled found for this watchlist' });
    }

    // Place orders for each symbol on each instance
    const results = [];
    const errors = [];

    for (const symbol of symbols) {
      for (const instance of instances) {
        try {
          // Get current position from OpenAlgo instance
          let currentPosition = { rawQuantity: 0 };
          try {
            const positionResponse = await makeOpenAlgoRequest(instance, 'openposition', 'POST', {
              strategy: instance.strategy_tag || 'WATCHLIST',
              symbol: symbol.symbol,
              exchange: symbol.exchange,
              product: product_type || symbol.product_type || 'MIS'
            });

            if (positionResponse.status === 'success' && positionResponse.data) {
              currentPosition.rawQuantity = parseInt(positionResponse.data.quantity) || 0;
            }
          } catch (posError) {
            console.log(`[WatchlistOrders] Failed to fetch position for ${symbol.symbol}:`, posError.message);
          }

          console.log(`[WatchlistOrders] Current position for ${symbol.symbol}: ${currentPosition.rawQuantity}`);

          // Calculate actual quantity based on quantity mode and units
          let actualQuantity = symbol.qty_value || 1;
          const lotSize = symbol.lot_size || 1;

          // For fixed quantity mode with "lots" units, calculate actual quantity
          if ((symbol.qty_mode || 'fixed') === 'fixed' && (symbol.qty_units || 'units') === 'lots') {
            actualQuantity = (symbol.qty_value || 1) * lotSize;
            console.log(`[WatchlistOrders] Lots mode: ${symbol.qty_value} lots × ${lotSize} lot_size = ${actualQuantity} actual quantity`);
          }

          // Build order parameters from symbol config
          const orderParams = {
            apikey: instance.api_key,
            exchange: symbol.exchange,
            symbol: symbol.symbol,
            action: action.toUpperCase(),
            quantity: actualQuantity, // Actual quantity (for "lots" mode, this is qty_value × lot_size)
            lot_size: lotSize, // Store for reference
            qty_mode: symbol.qty_mode || 'fixed',
            qty_units: symbol.qty_units || 'units',
            user_qty_value: symbol.qty_value, // User's entered quantity (before lot size multiplication)
            product: product_type || symbol.product_type || 'MIS',
            pricetype: order_type || symbol.order_type || 'MARKET',
            strategy: instance.strategy_tag || 'WATCHLIST',
            option_type: option_type || null // CE or PE for options trading
          };

          // Add price for LIMIT orders
          if (orderParams.pricetype.toUpperCase() === 'LIMIT') {
            if (price) {
              orderParams.price = price;
            } else if (!price && !symbol.price) {
              // Skip this order - LIMIT requires price
              errors.push({
                symbol: symbol.symbol,
                instance: instance.name,
                error: 'LIMIT order requires price parameter'
              });
              continue;
            }
          }

          // Translate UI actions to backend actions with proper position_size
          const actionUpper = action.toUpperCase();
          let backendAction = actionUpper;
          let positionSize = orderParams.position_size;

          // For "lots" mode, position_size should also be the actual quantity (lot_size × lots)
          let basePositionSize = actualQuantity;

          // UI SHORT button → SELL action with negative position_size (enter SHORT)
          if (actionUpper === 'SHORT') {
            backendAction = 'SELL';
            // Enter SHORT position (negative actual quantity)
            if (!positionSize) {
              positionSize = -basePositionSize;
            } else {
              positionSize = -Math.abs(positionSize) * lotSize;
            }
            console.log(`[WatchlistOrders] UI SHORT → Backend SELL with position_size: ${positionSize}`);
          }
          // UI COVER button → BUY action with position_size: 0 (close SHORT)
          else if (actionUpper === 'COVER') {
            backendAction = 'BUY';
            positionSize = 0;
            console.log(`[WatchlistOrders] UI COVER → Backend BUY with position_size: ${positionSize}`);
          }
          // UI BUY button → BUY action with positive position_size (enter LONG)
          else if (actionUpper === 'BUY') {
            if (!positionSize) {
              positionSize = basePositionSize;
              console.log(`[WatchlistOrders] BUY entry: setting position_size to ${positionSize} (${symbol.qty_value} ${symbol.qty_units || 'units'})`);
            }
          }
          // UI SELL button → SELL action with position_size: 0 (close all)
          else if (actionUpper === 'SELL') {
            positionSize = 0;
            console.log(`[WatchlistOrders] SELL exit: setting position_size to 0 to close all positions`);
          }

          // Update order params with backend action and position_size
          orderParams.action = backendAction;
          orderParams.position_size = positionSize;

          // Apply quantity rules (capital-based sizing if configured)
          const processedParams = await orderPlacementService.applyQuantityRules(orderParams, {
            watchlist_id: watchlistId,
            symbol_id: symbol.symbol_id
          });

          // Get symbol configuration for order_type and product_type
          const symbolConfig = await dbAsync.get(`
            SELECT order_type, product_type
            FROM symbol_configs
            WHERE symbol_id = ? AND watchlist_id = ?
          `, [symbol.symbol_id, watchlistId]);

          // Log complete order details
          console.log(`[WatchlistOrders] Placing order:`);
          console.log(`  Symbol: ${symbol.symbol} (${symbol.exchange})`);
          console.log(`  UI Action: ${action.toUpperCase()}${option_type ? ' ' + option_type : ''}`);
          console.log(`  Backend Action: ${processedParams.action}`);
          console.log(`  Option Type: ${option_type || 'N/A'}`);
          console.log(`  Lot Size: ${lotSize}`);
          console.log(`  Quantity Mode: ${symbol.qty_mode || 'fixed'}, Units: ${symbol.qty_units || 'units'}`);
          console.log(`  User Qty: ${symbol.qty_value} ${symbol.qty_units || 'units'}`);
          console.log(`  Actual Quantity: ${processedParams.quantity}`);
          console.log(`  Position Size: ${processedParams.position_size}`);
          console.log(`  Instance: ${instance.name}`);

          // Place order using OrderPlacementService (which handles normalization)
          const result = await orderPlacementService.placeOrder(instance.id, processedParams, {
            watchlist_id: watchlistId,
            symbol_id: symbol.symbol_id
          });

          // Use the result for database logging
          const response = { status: 'success', data: { orderid: result.order_id } };

          // Record order in database
          if (response.status === 'success') {
            await dbAsync.run(`
              INSERT INTO watchlist_orders (
                watchlist_id, symbol_id, instance_id, order_id, orderid,
                exchange, symbol, action, quantity, price, product_type, order_type,
                status, response_json, placed_at, trigger_reason
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            `, [
              watchlistId,
              symbol.symbol_id,
              instance.id,
              response.data?.orderid || null,
              response.data?.orderid || null,
              symbol.exchange,
              symbol.symbol,
              processedParams.action, // Use backend action, not UI action
              processedParams.quantity,
              processedParams.price || null,
              processedParams.product || symbolConfig?.product_type || 'MIS',
              processedParams.order_type || symbolConfig?.order_type || 'MARKET',
              'PLACED',
              JSON.stringify(response),
              'MANUAL_PLACEMENT'
            ]);

            results.push({
              success: true,
              symbol: symbol.symbol,
              instance: instance.name,
              order_id: response.data?.orderid,
              quantity: processedParams.quantity,
              price: processedParams.price || 'MARKET',
              option_type: option_type || null,
              message: `${processedParams.action}${option_type ? ' ' + option_type : ''} order placed successfully (UI: ${action.toUpperCase()}${option_type ? ' ' + option_type : ''})`
            });
          } else {
            throw new Error(response.message || 'Order placement failed');
          }
        } catch (error) {
          errors.push({
            symbol: symbol.symbol,
            instance: instance.name,
            error: error.message
          });
        }
      }
    }

    // Return results
    res.json({
      status: 'completed',
      summary: {
        total_symbols: symbols.length,
        total_instances: instances.length,
        total_attempts: symbols.length * instances.length,
        successful: results.length,
        failed: errors.length
      },
      results,
      errors
    });

  } catch (error) {
    console.error('Error placing watchlist orders:', error);
    res.status(500).json({ error: error.message || 'Failed to place orders' });
  }
});

/**
 * POST /api/watchlists/:id/exit-all
 * Exit all positions for a symbol
 *
 * Body: {
 *   symbol_id: 1,              // Required: Symbol ID
 *   instance_ids: [4, 5]       // Optional: specific instances, or all assigned if omitted
 * }
 */
router.post('/:id/exit-all', requireAdminAccess, async (req, res) => {
  const dbAsync = req.app.locals.dbAsync;
  const orderPlacementService = req.app.locals.orderPlacementService;

  if (!orderPlacementService) {
    return res.status(500).json({ error: 'Order placement service not initialized' });
  }

  const watchlistId = parseInt(req.params.id);
  const { symbol_id, instance_ids } = req.body;

  if (!symbol_id) {
    return res.status(400).json({ error: 'symbol_id is required' });
  }

  try {
    // Get symbol details
    const symbol = await dbAsync.get(`
      SELECT
        ws.id as symbol_id,
        ws.watchlist_id,
        ws.exchange,
        ws.symbol,
        ws.token
      FROM watchlist_symbols ws
      WHERE ws.id = ? AND ws.watchlist_id = ?
    `, [symbol_id, watchlistId]);

    if (!symbol) {
      return res.status(404).json({ error: 'Symbol not found in this watchlist' });
    }

    // Get instances to exit positions from
    let instances;
    if (instance_ids && Array.isArray(instance_ids) && instance_ids.length > 0) {
      // Specific instances requested
      const placeholders = instance_ids.map(() => '?').join(',');
      instances = await dbAsync.all(`
        SELECT i.*
        FROM instances i
        INNER JOIN watchlist_instances wi ON i.id = wi.instance_id
        WHERE wi.watchlist_id = ? AND i.id IN (${placeholders}) AND i.is_active = 1 AND i.order_placement_enabled = 1
      `, [watchlistId, ...instance_ids]);
    } else {
      // All assigned instances
      instances = await dbAsync.all(`
        SELECT i.*
        FROM instances i
        INNER JOIN watchlist_instances wi ON i.id = wi.instance_id
        WHERE wi.watchlist_id = ? AND i.is_active = 1 AND i.order_placement_enabled = 1
      `, [watchlistId]);
    }

    if (instances.length === 0) {
      return res.status(400).json({ error: 'No active instances with order placement enabled found for this watchlist' });
    }

    // Get symbol configuration
    const symbolConfig = await dbAsync.get(`
      SELECT product_type
      FROM symbol_configs
      WHERE symbol_id = ? AND watchlist_id = ?
    `, [symbol_id, watchlistId]);

    const productType = symbolConfig?.product_type || 'MIS';

    // Exit positions for each instance
    const results = [];
    const errors = [];

    for (const instance of instances) {
      try {
        console.log(`[WatchlistOrders] EXIT ALL for ${symbol.symbol} on instance ${instance.name}`);

        // Exit all positions for this symbol
        const result = await orderPlacementService.exitAllPositions(instance.id, {
          symbol: symbol.symbol,
          exchange: symbol.exchange,
          product: productType
        });

        if (result.success) {
          results.push({
            success: true,
            symbol: symbol.symbol,
            instance: instance.name,
            order_id: result.order_id,
            positions_closed: result.positions_closed,
            message: result.message
          });
        } else {
          throw new Error(result.message || 'Exit failed');
        }
      } catch (error) {
        errors.push({
          symbol: symbol.symbol,
          instance: instance.name,
          error: error.message
        });
      }
    }

    // Return results
    res.json({
      status: 'completed',
      summary: {
        symbol: symbol.symbol,
        total_instances: instances.length,
        successful: results.length,
        failed: errors.length,
        total_positions_closed: results.reduce((sum, r) => sum + r.positions_closed, 0)
      },
      results,
      errors
    });

  } catch (error) {
    console.error('Error exiting all positions:', error);
    res.status(500).json({ error: error.message || 'Failed to exit positions' });
  }
});

export default router;
