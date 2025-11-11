/**
 * Watchlist CRUD Operations Module
 *
 * Handles create, read, update, delete, and clone operations for watchlists.
 */

import express from 'express';
import { requireAdminAccess } from '../../auth.js';

const router = express.Router();

/**
 * GET /api/watchlists
 * List all watchlists with counts
 */
router.get('/', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;

    const watchlists = await dbAsync.all(`
      SELECT
        w.*,
        (SELECT COUNT(*) FROM watchlist_symbols WHERE watchlist_id = w.id) as symbol_count,
        (SELECT COUNT(*) FROM watchlist_instances WHERE watchlist_id = w.id) as instance_count
      FROM watchlists w
      ORDER BY w.created_at DESC
    `);

    res.json({
      status: 'success',
      data: watchlists
    });
  } catch (error) {
    console.error('Error fetching watchlists:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch watchlists',
      error: error.message
    });
  }
});

/**
 * GET /api/watchlists/:id
 * Get single watchlist by ID with symbols and instances
 */
router.get('/:id', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;

    const watchlist = await dbAsync.get(`
      SELECT
        w.*,
        (SELECT COUNT(*) FROM watchlist_symbols WHERE watchlist_id = w.id) as symbol_count,
        (SELECT COUNT(*) FROM watchlist_instances WHERE watchlist_id = w.id) as instance_count
      FROM watchlists w
      WHERE w.id = ?
    `, [id]);

    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Get symbols with V2 fields
    const symbols = await dbAsync.all(`
      SELECT
        ws.id as symbol_id,
        ws.exchange,
        ws.symbol,
        ws.display_order,
        ws.added_at,
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
        sc.options_expiry_mode
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.watchlist_id = ws.watchlist_id AND sc.symbol_id = ws.id
      WHERE ws.watchlist_id = ?
      ORDER BY ws.display_order, ws.added_at
    `, [id]);

    // Get assigned instances
    const instances = await dbAsync.all(`
      SELECT
        i.id,
        i.name,
        i.host_url,
        i.is_active,
        i.is_analyzer_mode,
        i.order_placement_enabled,
        wi.assigned_at
      FROM watchlist_instances wi
      JOIN instances i ON i.id = wi.instance_id
      WHERE wi.watchlist_id = ?
      ORDER BY i.name
    `, [id]);

    // Extract broker name from host_url for each instance
    const instancesWithBroker = instances.map(instance => {
      let broker = 'Unknown';
      if (instance.host_url) {
        try {
          const url = new URL(instance.host_url);
          broker = url.hostname.split('.')[0]; // Extract subdomain (e.g., 'flattrade' from flattrade.simplifyed.in)
          // Capitalize first letter
          broker = broker.charAt(0).toUpperCase() + broker.slice(1);
        } catch (e) {
          // If URL parsing fails, keep as Unknown
        }
      }
      return {
        ...instance,
        broker
      };
    });

    res.json({
      status: 'success',
      data: {
        ...watchlist,
        symbols,
        instances: instancesWithBroker
      }
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch watchlist',
      error: error.message
    });
  }
});

/**
 * POST /api/watchlists
 * Create new watchlist (Admin only)
 */
router.post('/', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { name, description, is_active = true } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Watchlist name is required'
      });
    }

    // Check for duplicate name
    const existing = await dbAsync.get(
      'SELECT id FROM watchlists WHERE name = ?',
      [name.trim()]
    );

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A watchlist with this name already exists'
      });
    }

    // Create watchlist
    const result = await dbAsync.run(`
      INSERT INTO watchlists (name, description, is_active, created_by)
      VALUES (?, ?, ?, ?)
    `, [name.trim(), description || null, is_active ? 1 : 0, req.user.email]);

    // Fetch created watchlist
    const watchlist = await dbAsync.get(
      'SELECT * FROM watchlists WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json({
      status: 'success',
      message: 'Watchlist created successfully',
      data: watchlist
    });
  } catch (error) {
    console.error('Error creating watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create watchlist',
      error: error.message
    });
  }
});

/**
 * PUT /api/watchlists/:id
 * Update watchlist (Admin only)
 */
router.put('/:id', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    // Check if watchlist exists
    const existing = await dbAsync.get(
      'SELECT id FROM watchlists WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Validation
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Watchlist name cannot be empty'
        });
      }

      // Check for duplicate name (excluding current watchlist)
      const duplicate = await dbAsync.get(
        'SELECT id FROM watchlists WHERE name = ? AND id != ?',
        [name.trim(), id]
      );

      if (duplicate) {
        return res.status(409).json({
          status: 'error',
          message: 'A watchlist with this name already exists'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    // Update watchlist
    await dbAsync.run(`
      UPDATE watchlists
      SET ${updates.join(', ')}
      WHERE id = ?
    `, params);

    // Fetch updated watchlist
    const watchlist = await dbAsync.get(
      'SELECT * FROM watchlists WHERE id = ?',
      [id]
    );

    res.json({
      status: 'success',
      message: 'Watchlist updated successfully',
      data: watchlist
    });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update watchlist',
      error: error.message
    });
  }
});

/**
 * DELETE /api/watchlists/:id
 * Delete watchlist (Admin only)
 */
router.delete('/:id', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;

    // Check if watchlist exists
    const existing = await dbAsync.get(
      'SELECT id, name FROM watchlists WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Delete watchlist (CASCADE will handle related records)
    await dbAsync.run('DELETE FROM watchlists WHERE id = ?', [id]);

    res.json({
      status: 'success',
      message: `Watchlist "${existing.name}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete watchlist',
      error: error.message
    });
  }
});

/**
 * POST /api/watchlists/:id/clone
 * Clone an existing watchlist (Admin only)
 */
router.post('/:id/clone', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;
    const { name } = req.body;

    // Get source watchlist
    const source = await dbAsync.get(
      'SELECT * FROM watchlists WHERE id = ?',
      [id]
    );

    if (!source) {
      return res.status(404).json({
        status: 'error',
        message: 'Source watchlist not found'
      });
    }

    // Generate new name if not provided
    const newName = name || `${source.name} (Copy)`;

    // Check for duplicate name
    const existing = await dbAsync.get(
      'SELECT id FROM watchlists WHERE name = ?',
      [newName]
    );

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A watchlist with this name already exists'
      });
    }

    // Create new watchlist
    const result = await dbAsync.run(`
      INSERT INTO watchlists (name, description, is_active, created_by)
      VALUES (?, ?, ?, ?)
    `, [newName, source.description, source.is_active, req.user.email]);

    const newWatchlistId = result.lastID;

    // Copy symbols
    await dbAsync.run(`
      INSERT INTO watchlist_symbols (watchlist_id, exchange, symbol, display_order)
      SELECT ?, exchange, symbol, display_order
      FROM watchlist_symbols
      WHERE watchlist_id = ?
    `, [newWatchlistId, id]);

    // Copy symbol configs
    await dbAsync.run(`
      INSERT INTO symbol_configs (
        watchlist_id, symbol_id, qty_type, qty_value,
        target_type, target_value, sl_type, sl_value,
        ts_type, ts_value, product_type, order_type,
        max_position_size, max_instances, is_enabled
      )
      SELECT
        ?,
        (SELECT ws2.id FROM watchlist_symbols ws2
         WHERE ws2.watchlist_id = ?
         AND ws2.exchange = ws1.exchange
         AND ws2.symbol = ws1.symbol),
        sc.qty_type, sc.qty_value,
        sc.target_type, sc.target_value, sc.sl_type, sc.sl_value,
        sc.ts_type, sc.ts_value, sc.product_type, sc.order_type,
        sc.max_position_size, sc.max_instances, sc.is_enabled
      FROM symbol_configs sc
      JOIN watchlist_symbols ws1 ON ws1.id = sc.symbol_id
      WHERE sc.watchlist_id = ?
    `, [newWatchlistId, newWatchlistId, id]);

    // Copy instance assignments
    await dbAsync.run(`
      INSERT INTO watchlist_instances (watchlist_id, instance_id, assigned_by)
      SELECT ?, instance_id, ?
      FROM watchlist_instances
      WHERE watchlist_id = ?
    `, [newWatchlistId, req.user.email, id]);

    // Fetch new watchlist
    const newWatchlist = await dbAsync.get(
      'SELECT * FROM watchlists WHERE id = ?',
      [newWatchlistId]
    );

    res.status(201).json({
      status: 'success',
      message: 'Watchlist cloned successfully',
      data: newWatchlist
    });
  } catch (error) {
    console.error('Error cloning watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to clone watchlist',
      error: error.message
    });
  }
});

export default router;
