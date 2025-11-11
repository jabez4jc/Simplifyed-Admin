/**
 * Instance Management Routes
 * Unified router for all instance-related operations
 * - CRUD operations (list, create, update, delete)
 * - Admin operations (admin-role, order-placement)
 * - Analyzer operations (toggle, status)
 * - Test connection
 */

import express from 'express';
import { requireAuth, requireAdminAccess } from '../auth.js';

const router = express.Router();

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// =====================================
// CRUD Operations
// =====================================

/**
 * GET /api/instances
 * List all instances with P&L data
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const instances = await dbAsync.all('SELECT * FROM instances ORDER BY created_at DESC');
    res.json(instances);
  } catch (error) {
    console.error('Error fetching instances:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch instances',
      message: error.message
    });
  }
});

/**
 * POST /api/instances
 * Create a new instance
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, host_url, api_key, strategy_tag, is_primary_admin, is_secondary_admin } = req.body;

    const { dbAsync, normalizeHostUrl, sanitizeApiKey, updater_updateInstancesData, makeOpenAlgoRequest } = req.app.locals;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedHostUrl = normalizeHostUrl(host_url);
    const sanitizedApiKey = sanitizeApiKey(api_key);
    const sanitizedStrategyTag = typeof strategy_tag === 'string' && strategy_tag.trim() !== '' ? strategy_tag.trim() : null;
    const isPrimaryAdmin = is_primary_admin ? 1 : 0;
    const isSecondaryAdmin = is_secondary_admin ? 1 : 0;

    if (!trimmedName || !normalizedHostUrl || !sanitizedApiKey) {
      return res.status(400).json({
        status: 'error',
        error: 'Name, host_url, and api_key are required',
        message: 'Name, host_url, and api_key are required'
      });
    }

    const result = await dbAsync.run(
      'INSERT INTO instances (name, host_url, api_key, strategy_tag, is_primary_admin, is_secondary_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [trimmedName, normalizedHostUrl, sanitizedApiKey, sanitizedStrategyTag, isPrimaryAdmin, isSecondaryAdmin]
    );

    const newInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [result.lastID]);

    // Immediately try to update the new instance data
    setTimeout(() => {
      updater_updateInstancesData(dbAsync, makeOpenAlgoRequest);
    }, 1000);

    res.status(201).json({
      status: 'success',
      data: newInstance,
      message: 'Instance created successfully'
    });
  } catch (error) {
    console.error('Error creating instance:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        status: 'error',
        error: 'Instance with this host URL already exists',
        message: 'Instance with this host URL already exists'
      });
    } else if (error.message.includes('no such column')) {
      res.status(500).json({
        status: 'error',
        error: 'Database schema outdated. Please run migrations.',
        message: 'Database schema outdated. Please run migrations.',
        details: error.message
      });
    } else {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to create instance',
        message: error.message || 'Failed to create instance'
      });
    }
  }
});

/**
 * PUT /api/instances/:id
 * Update an existing instance
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { dbAsync, normalizeHostUrl, sanitizeApiKey } = req.app.locals;

    const allowedFields = new Set([
      'name',
      'host_url',
      'api_key',
      'strategy_tag',
      'target_profit',
      'target_loss',
      'is_active',
      'is_analyzer_mode',
      'is_primary_admin',
      'is_secondary_admin'
    ]);

    const sanitizedUpdates = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.has(key)) {
        continue;
      }

      switch (key) {
        case 'name': {
          const trimmed = typeof value === 'string' ? value.trim() : '';
          if (!trimmed) {
            return res.status(400).json({
              status: 'error',
              error: 'Name cannot be empty',
              message: 'Name cannot be empty'
            });
          }
          sanitizedUpdates.name = trimmed;
          break;
        }
        case 'host_url': {
          const normalized = normalizeHostUrl(value);
          if (!normalized) {
            return res.status(400).json({
              status: 'error',
              error: 'Invalid host_url provided',
              message: 'Invalid host_url provided'
            });
          }
          sanitizedUpdates.host_url = normalized;
          break;
        }
        case 'api_key': {
          const sanitizedKey = sanitizeApiKey(value);
          if (!sanitizedKey) {
            return res.status(400).json({
              status: 'error',
              error: 'API key cannot be empty',
              message: 'API key cannot be empty'
            });
          }
          sanitizedUpdates.api_key = sanitizedKey;
          break;
        }
        case 'strategy_tag': {
          sanitizedUpdates.strategy_tag = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
          break;
        }
        case 'target_profit':
        case 'target_loss': {
          const numericValue = Number.parseFloat(value);
          if (!Number.isFinite(numericValue)) {
            return res.status(400).json({
              status: 'error',
              error: `${key} must be a numeric value`,
              message: `${key} must be a numeric value`
            });
          }
          sanitizedUpdates[key] = numericValue;
          break;
        }
        case 'is_active':
        case 'is_analyzer_mode':
        case 'is_primary_admin':
        case 'is_secondary_admin': {
          sanitizedUpdates[key] = value ? 1 : 0;
          break;
        }
        default:
          break;
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'No valid fields provided for update',
        message: 'No valid fields provided for update'
      });
    }

    const fields = Object.keys(sanitizedUpdates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(sanitizedUpdates), id];

    await dbAsync.run(
      `UPDATE instances SET ${fields}, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    res.json({
      status: 'success',
      data: updatedInstance,
      message: 'Instance updated successfully'
    });
  } catch (error) {
    console.error('Error updating instance:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to update instance',
      message: error.message || 'Failed to update instance'
    });
  }
});

/**
 * DELETE /api/instances/:id
 * Delete an instance
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { dbAsync } = req.app.locals;

    await dbAsync.run('DELETE FROM instances WHERE id = ?', [id]);
    res.json({
      status: 'success',
      message: 'Instance deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting instance:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to delete instance',
      message: error.message || 'Failed to delete instance'
    });
  }
});

// =====================================
// Test Connection
// =====================================

/**
 * POST /api/instances/test-connection
 * Test connection to an OpenAlgo instance
 */
router.post('/test-connection', requireAuth, async (req, res) => {
  try {
    const { host_url, api_key } = req.body;
    const { normalizeHostUrl, sanitizeApiKey, makeOpenAlgoRequest } = req.app.locals;

    const normalizedHostUrl = normalizeHostUrl(host_url);
    const sanitizedApiKey = sanitizeApiKey(api_key);

    if (!normalizedHostUrl || !sanitizedApiKey) {
      return res.status(400).json({
        status: 'error',
        error: 'host_url and api_key are required',
        message: 'host_url and api_key are required'
      });
    }

    // Create temporary instance object for testing
    const testInstance = { host_url: normalizedHostUrl, api_key: sanitizedApiKey };

    // Test connection using ping endpoint
    const result = await makeOpenAlgoRequest(testInstance, 'ping');

    if (result.status === 'success') {
      res.json({
        status: 'success',
        message: 'Connection successful',
        broker: result.data?.broker || 'unknown',
        data: result.data
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Connection failed',
        details: result
      });
    }
  } catch (error) {
    console.error('Test connection error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Connection test failed',
      error: error.message
    });
  }
});

// =====================================
// Manual Refresh
// =====================================

/**
 * POST /api/instances/refresh
 * Manually refresh all instance data
 */
router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const { dbAsync, updater_updateInstancesData, makeOpenAlgoRequest } = req.app.locals;

    console.log('🔄 Manual refresh triggered by user');
    await updater_updateInstancesData(dbAsync, makeOpenAlgoRequest);

    // Return updated instances
    const instances = await dbAsync.all('SELECT * FROM instances ORDER BY created_at DESC');
    res.json({
      status: 'success',
      message: 'Instances refreshed successfully',
      data: instances
    });
  } catch (error) {
    console.error('Manual refresh error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to refresh instances',
      error: error.message
    });
  }
});

// =====================================
// Analyzer Operations
// =====================================

/**
 * POST /api/instances/:id/toggle-analyzer
 * Toggle analyzer mode with Safe-Switch Workflow
 */
router.post('/:id/toggle-analyzer', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { mode } = req.body; // true for analyzer, false for live

    const { dbAsync, makeOpenAlgoRequest } = req.app.locals;

    const instance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    if (!instance) {
      return res.status(404).json({
        status: 'error',
        error: 'Instance not found',
        message: 'Instance not found'
      });
    }

    // If switching to analyzer mode (Live → Analyzer), follow Safe-Switch Workflow
    if (mode === true) {
      console.log(`🔄 Starting Safe-Switch Workflow for instance ${instance.id}: Live → Analyzer`);

      try {
        // Initialize result variables
        let closeResult = null;
        let cancelResult = null;

        // Step 1: Close all open positions
        console.log(`Step 1: Closing all open positions for instance ${instance.id}`);
        const closePayload = {};
        if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
          closePayload.strategy = instance.strategy_tag;
        }
        try {
          closeResult = await makeOpenAlgoRequest(instance, 'closeposition', 'POST', closePayload);
          console.log(`Step 1 result:`, closeResult);
        } catch (closeError) {
          console.log(`Step 1 warning: Could not close positions - ${closeError.message}`);
          console.log(`Step 1 continuing: Likely no positions to close`);
        }

        // Step 2: Cancel all pending orders
        console.log(`Step 2: Canceling all orders for instance ${instance.id}`);
        const cancelPayload = {};
        if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
          cancelPayload.strategy = instance.strategy_tag;
        }
        try {
          cancelResult = await makeOpenAlgoRequest(instance, 'cancelallorder', 'POST', cancelPayload);
          console.log(`Step 2 result:`, cancelResult);
        } catch (cancelError) {
          console.log(`Step 2 warning: Could not cancel orders - ${cancelError.message}`);
          console.log(`Step 2 continuing: Likely no orders to cancel`);
        }

        // Step 3: Confirm no open or pending orders in positionbook
        console.log(`Step 3: Confirming no open positions for instance ${instance.id}`);
        const positionCheck = await makeOpenAlgoRequest(instance, 'positionbook');

        // Check if there are still open positions
        if (positionCheck.status === 'success' && positionCheck.data) {
          const positions = Array.isArray(positionCheck.data) ? positionCheck.data : positionCheck.data.positions || [];
          const openPositions = positions.filter(pos =>
            parseFloat(pos.quantity || pos.netqty || 0) !== 0
          );

          if (openPositions.length > 0) {
            console.log(`❌ Step 3 failed: ${openPositions.length} positions still open`);
            return res.status(400).json({
              status: 'error',
              message: `Cannot switch to analyzer mode: ${openPositions.length} positions still open`,
              openPositions: openPositions.length
            });
          }
        }
        console.log(`✅ Step 3 confirmed: No open positions`);

        // Step 4: Toggle analyzer mode
        console.log(`Step 4: Enabling analyzer mode for instance ${instance.id}`);
        const toggleResult = await makeOpenAlgoRequest(instance, 'analyzer/toggle', 'POST', { mode: true });

        if (toggleResult.status !== 'success') {
          throw new Error(`Failed to enable analyzer mode: ${toggleResult.message || 'Unknown error'}`);
        }
        console.log(`Step 4 result:`, toggleResult);

        // Step 5: Verify analyzer mode is active
        console.log(`Step 5: Verifying analyzer mode for instance ${instance.id}`);
        const verifyResult = await makeOpenAlgoRequest(instance, 'analyzer');

        if (verifyResult.status !== 'success' ||
            !verifyResult.data ||
            verifyResult.data.mode !== 'analyze') {
          throw new Error('Failed to verify analyzer mode activation');
        }
        console.log(`✅ Safe-Switch Workflow completed successfully for instance ${instance.id}`);

        // Update database with new mode
        await dbAsync.run(
          'UPDATE instances SET is_analyzer_mode = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );

        const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
        res.json({
          status: 'success',
          message: 'Safe-Switch Workflow completed: Instance switched to analyzer mode',
          data: updatedInstance,
          workflow: {
            step1_close: closeResult,
            step2_cancel: cancelResult,
            step3_verify: 'No open positions confirmed',
            step4_toggle: toggleResult,
            step5_confirm: verifyResult
          }
        });

      } catch (workflowError) {
        console.error(`❌ Safe-Switch Workflow failed for instance ${instance.id}:`, workflowError.message);
        res.status(500).json({
          status: 'error',
          message: `Safe-Switch Workflow failed: ${workflowError.message}`,
          error: workflowError.message
        });
      }

    } else {
      // Switching to live mode (Analyzer → Live) - Simple toggle
      console.log(`🔄 Switching instance ${instance.id} to Live mode`);
      const result = await makeOpenAlgoRequest(instance, 'analyzer/toggle', 'POST', { mode: false });

      if (result.status === 'success') {
        await dbAsync.run(
          'UPDATE instances SET is_analyzer_mode = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );

        const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
        res.json({
          status: 'success',
          message: 'Instance switched to live mode',
          data: updatedInstance,
          details: result.data
        });
      } else {
        res.status(400).json({
          status: 'error',
          message: 'Failed to switch to live mode',
          details: result
        });
      }
    }
  } catch (error) {
    console.error('Toggle analyzer error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle analyzer mode',
      error: error.message
    });
  }
});

/**
 * GET /api/instances/:id/analyzer-status
 * Get analyzer status from OpenAlgo
 */
router.get('/:id/analyzer-status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { dbAsync, makeOpenAlgoRequest } = req.app.locals;

    const instance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
    if (!instance) {
      return res.status(404).json({
        status: 'error',
        error: 'Instance not found',
        message: 'Instance not found'
      });
    }

    // Get analyzer status from OpenAlgo API
    const result = await makeOpenAlgoRequest(instance, 'analyzer');

    if (result.status === 'success') {
      res.json({
        status: 'success',
        data: result.data
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Failed to get analyzer status',
        details: result
      });
    }
  } catch (error) {
    console.error('Get analyzer status error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get analyzer status',
      error: error.message
    });
  }
});

// =====================================
// Admin Operations
// =====================================

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

/**
 * GET /api/instances/admin-instances/status
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

export default router;
