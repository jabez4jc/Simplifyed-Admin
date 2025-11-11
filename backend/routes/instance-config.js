/**
 * Instance Configuration Routes
 * Handles admin instance designation and watchlist assignments
 */

import express from 'express';
import { requireAdminAccess } from '../auth.js';

const router = express.Router();

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * PUT /api/instances/:id/admin-role
 * Set instance as Primary/Secondary Admin (Admin only)
 */
router.put('/:id/admin-role', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const id = parseInteger(req.params.id);
    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid instance ID'
      });
    }
    const { is_primary_admin, is_secondary_admin } = req.body;

    // Check if instance exists
    const instance = await dbAsync.get(
      'SELECT id, name FROM instances WHERE id = ?',
      [id]
    );

    if (!instance) {
      return res.status(404).json({
        status: 'error',
        message: 'Instance not found'
      });
    }

    // Validation: can't be both primary and secondary
    if (is_primary_admin && is_secondary_admin) {
      return res.status(400).json({
        status: 'error',
        message: 'Instance cannot be both primary and secondary admin'
      });
    }

    // If setting as primary, check if there's already a primary
    if (is_primary_admin) {
      const existingPrimary = await dbAsync.get(
        'SELECT id, name FROM instances WHERE is_primary_admin = 1 AND id != ?',
        [id]
      );

      if (existingPrimary) {
        return res.status(409).json({
          status: 'error',
          message: `Instance "${existingPrimary.name}" is already set as primary admin. Only one primary admin is allowed.`,
          existing_primary: existingPrimary
        });
      }
    }

    // If setting as secondary, check if there's already a secondary
    if (is_secondary_admin) {
      const existingSecondary = await dbAsync.get(
        'SELECT id, name FROM instances WHERE is_secondary_admin = 1 AND id != ?',
        [id]
      );

      if (existingSecondary) {
        return res.status(409).json({
          status: 'error',
          message: `Instance "${existingSecondary.name}" is already set as secondary admin. Only one secondary admin is allowed.`,
          existing_secondary: existingSecondary
        });
      }
    }

    // Update instance
    await dbAsync.run(`
      UPDATE instances
      SET
        is_primary_admin = ?,
        is_secondary_admin = ?
      WHERE id = ?
    `, [is_primary_admin ? 1 : 0, is_secondary_admin ? 1 : 0, id]);

    // Fetch updated instance
    const updated = await dbAsync.get(
      'SELECT * FROM instances WHERE id = ?',
      [id]
    );

    res.json({
      status: 'success',
      message: `Instance "${instance.name}" admin role updated`,
      data: updated
    });
  } catch (error) {
    console.error('Error updating admin role:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update admin role',
      error: error.message
    });
  }
});

/**
 * GET /api/admin-instances/status
 * Get WebSocket connection status for admin instances
 */
router.get('/admin-instances/status', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const now = Date.now();

    // Get primary admin
    const primary = await dbAsync.get(`
      SELECT
        i.*,
        ws.status as ws_status,
        ws.connected_at,
        ws.last_message_at,
        ws.messages_received,
        ws.error_count,
        ws.last_error,
        ws.failover_at,
        ws.failover_reason,
        MAX(i.last_ping_at) as last_ping_at
      FROM instances i
      LEFT JOIN websocket_sessions ws ON ws.instance_id = i.id AND ws.session_type = 'PRIMARY'
      WHERE i.is_primary_admin = 1
      GROUP BY i.id
      ORDER BY ws.created_at DESC
      LIMIT 1
    `);

    // Get secondary admin
    const secondary = await dbAsync.get(`
      SELECT
        i.*,
        ws.status as ws_status,
        ws.connected_at,
        ws.last_message_at,
        ws.messages_received,
        ws.error_count,
        ws.last_error,
        ws.failover_at,
        ws.failover_reason,
        MAX(i.last_ping_at) as last_ping_at
      FROM instances i
      LEFT JOIN websocket_sessions ws ON ws.instance_id = i.id AND ws.session_type = 'SECONDARY'
      WHERE i.is_secondary_admin = 1
      GROUP BY i.id
      ORDER BY ws.created_at DESC
      LIMIT 1
    `);

    const formatInstanceStatus = (record) => {
      if (!record) {
        return null;
      }

      const lastMessageAt = record.last_message_at ? new Date(record.last_message_at) : null;
      const lastPingAt = record.last_ping_at ? new Date(record.last_ping_at) : null;
      const heartbeatMs = lastMessageAt ? now - lastMessageAt.getTime() : null;

      // Extract broker name from host_url
      let broker = 'Unknown';
      if (record.host_url) {
        try {
          const url = new URL(record.host_url);
          broker = url.hostname.split('.')[0];
          broker = broker.charAt(0).toUpperCase() + broker.slice(1);
        } catch (e) {
          // If URL parsing fails, keep as Unknown
        }
      }

      return {
        id: record.id,
        name: record.name,
        broker: broker,
        websocket_status: record.ws_status || null,
        connected_at: record.connected_at || null,
        last_message_at: record.last_message_at || null,
        last_ping_at: lastPingAt ? lastPingAt.toISOString() : null,
        heartbeat_ms: heartbeatMs !== null && heartbeatMs >= 0 ? heartbeatMs : null,
        messages_received: record.messages_received ?? 0,
        error_count: record.error_count ?? 0,
        last_error: record.last_error || null,
        failover_at: record.failover_at || null,
        failover_reason: record.failover_reason || null,
        order_placement_enabled: record.order_placement_enabled ? Boolean(record.order_placement_enabled) : false
      };
    };

    res.json({
      status: 'success',
      data: {
        primary: formatInstanceStatus(primary),
        secondary: formatInstanceStatus(secondary)
      }
    });
  } catch (error) {
    console.error('Error fetching admin instance status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admin instance status',
      error: error.message
    });
  }
});

/**
 * POST /api/watchlists/:watchlistId/instances
 * Assign instances to watchlist (Admin only)
 */
router.post('/:watchlistId/instances', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const watchlistId = parseInteger(req.params.watchlistId);
    if (!watchlistId) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid watchlist ID'
      });
    }
    const { instance_ids } = req.body;

    // Validation
    if (!Array.isArray(instance_ids) || instance_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'instance_ids must be a non-empty array'
      });
    }

    const sanitizedInstanceIds = instance_ids
      .map(parseInteger)
      .filter(id => Number.isInteger(id));

    if (sanitizedInstanceIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'instance_ids must contain valid integers'
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

    // Clear existing assignments
    await dbAsync.run(
      'DELETE FROM watchlist_instances WHERE watchlist_id = ?',
      [watchlistId]
    );

    // Add new assignments
    const assigned = [];
    for (const instanceId of sanitizedInstanceIds) {
      // Check if instance exists
      const instance = await dbAsync.get(
        'SELECT id, name FROM instances WHERE id = ?',
        [instanceId]
      );

      if (instance) {
        await dbAsync.run(`
          INSERT INTO watchlist_instances (watchlist_id, instance_id, assigned_by)
          VALUES (?, ?, ?)
        `, [watchlistId, instanceId, (req.user?.email || '').toLowerCase() || null]);

        assigned.push(instance);
      }
    }

    res.json({
      status: 'success',
      message: `${assigned.length} instance(s) assigned to watchlist`,
      data: assigned
    });
  } catch (error) {
    console.error('Error assigning instances:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to assign instances',
      error: error.message
    });
  }
});

/**
 * DELETE /api/watchlists/:watchlistId/instances/:instanceId
 * Remove instance from watchlist (Admin only)
 */
router.delete('/:watchlistId/instances/:instanceId', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const watchlistId = parseInteger(req.params.watchlistId);
    const instanceId = parseInteger(req.params.instanceId);

    if (!watchlistId || !instanceId) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid watchlist or instance ID'
      });
    }

    // Check if assignment exists
    const assignment = await dbAsync.get(`
      SELECT
        wi.*,
        i.name as instance_name
      FROM watchlist_instances wi
      JOIN instances i ON i.id = wi.instance_id
      WHERE wi.watchlist_id = ? AND wi.instance_id = ?
    `, [watchlistId, instanceId]);

    if (!assignment) {
      return res.status(404).json({
        status: 'error',
        message: 'Instance assignment not found'
      });
    }

    // Remove assignment
    await dbAsync.run(
      'DELETE FROM watchlist_instances WHERE watchlist_id = ? AND instance_id = ?',
      [watchlistId, instanceId]
    );

    res.json({
      status: 'success',
      message: `Instance "${assignment.instance_name}" removed from watchlist`
    });
  } catch (error) {
    console.error('Error removing instance:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove instance',
      error: error.message
    });
  }
});

/**
 * PUT /api/instances/:id/order-placement
 * Enable/disable order placement for instance (Admin only)
 */
router.put('/:id/order-placement', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const id = parseInteger(req.params.id);
    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid instance ID'
      });
    }

    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'enabled flag is required'
      });
    }

    if (enabled === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'enabled field is required'
      });
    }

    // Check if instance exists
    const instance = await dbAsync.get(
      'SELECT id, name FROM instances WHERE id = ?',
      [id]
    );

    if (!instance) {
      return res.status(404).json({
        status: 'error',
        message: 'Instance not found'
      });
    }

    // Update order placement flag
    await dbAsync.run(
      'UPDATE instances SET order_placement_enabled = ? WHERE id = ?',
      [enabled ? 1 : 0, id]
    );

    // Fetch updated instance
    const updated = await dbAsync.get(
      'SELECT * FROM instances WHERE id = ?',
      [id]
    );

    res.json({
      status: 'success',
      message: `Order placement ${enabled ? 'enabled' : 'disabled'} for instance "${instance.name}"`,
      data: updated
    });
  } catch (error) {
    console.error('Error updating order placement:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update order placement setting',
      error: error.message
    });
  }
});

export default router;
