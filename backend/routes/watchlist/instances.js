/**
 * Watchlist Instance Assignment Module
 *
 * Handles assigning/unassigning trading instances to watchlists.
 */

import express from 'express';
import { requireAdminAccess } from '../../auth.js';

const router = express.Router();

/**
 * POST /api/watchlists/:id/instances
 * Assign instances to watchlist (Admin only)
 * Body: { instance_ids: [1, 2, 3] }
 */
router.post('/:id/instances', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;
    const { instance_ids } = req.body;

    // Validate watchlist exists
    const watchlist = await dbAsync.get('SELECT id FROM watchlists WHERE id = ?', [id]);
    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    // Validate instance_ids
    if (!Array.isArray(instance_ids)) {
      return res.status(400).json({
        status: 'error',
        message: 'instance_ids must be an array'
      });
    }

    // Remove all existing assignments for this watchlist
    await dbAsync.run('DELETE FROM watchlist_instances WHERE watchlist_id = ?', [id]);

    // Insert new assignments
    if (instance_ids.length > 0) {
      const placeholders = instance_ids.map(() => '(?, ?, ?)').join(', ');
      const values = [];

      for (const instanceId of instance_ids) {
        values.push(id, instanceId, req.user.email);
      }

      await dbAsync.run(`
        INSERT INTO watchlist_instances (watchlist_id, instance_id, assigned_by)
        VALUES ${placeholders}
      `, values);
    }

    res.json({
      status: 'success',
      message: `${instance_ids.length} instance(s) assigned successfully`,
      data: {
        watchlist_id: id,
        instance_count: instance_ids.length
      }
    });
  } catch (error) {
    console.error('Error assigning instances to watchlist:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to assign instances',
      error: error.message
    });
  }
});

export default router;
