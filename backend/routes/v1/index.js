/**
 * API v1 Routes
 *
 * Consolidates all v1 routes in one place for easy management.
 * Import this in server.js and mount at /api/v1
 */

import express from 'express';
import { requireAuth, requireAdminAccess } from '../../auth.js';

// Import existing route modules
import watchlistRoutes from '../watchlist/index.js';
import symbolRoutes from '../symbols.js';
import symbolSearchRoutes from '../symbol-search.js';
import watchlistOrderRoutes from '../watchlist-orders.js';
import instanceConfigRoutes from '../instance-config.js';
import websocketStatusRoutes from '../websocket-status.js';
import optionsRoutes from '../options.js';
import quotesRoutes from '../quotes.js';
import createPositionRoutes from '../positions.js';
import createOrderRoutes from '../orders.js';

/**
 * Create v1 API router
 */
export function createV1Router(dependencies) {
  const router = express.Router();
  const { dbAsync, io } = dependencies;

  // User info endpoint
  router.get('/user', async (req, res) => {
    // Check if test mode is enabled
    const isTestMode = process.env.TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';

    if (isTestMode) {
      return res.json({
        authenticated: true,
        user: { email: 'test@simplifyed.in', name: 'Test User', is_admin: true },
        isAdmin: true
      });
    }

    if (req.isAuthenticated()) {
      try {
        const userEmail = (req.user.email || '').toLowerCase();
        const currentUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);

        res.json({
          authenticated: true,
          user: req.user,
          isAdmin: currentUser ? Boolean(currentUser.is_admin) : false
        });
      } catch (error) {
        console.error('Error checking user admin status:', error);
        res.json({
          authenticated: true,
          user: req.user,
          isAdmin: false
        });
      }
    } else {
      res.json({ authenticated: false });
    }
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Instances CRUD endpoints (using app.locals for utilities)
  router.get('/instances', requireAuth, async (req, res) => {
    try {
      const instances = await dbAsync.all('SELECT * FROM instances ORDER BY created_at DESC');
      res.json(instances);
    } catch (error) {
      console.error('Error fetching instances:', error);
      res.status(500).json({ error: 'Failed to fetch instances' });
    }
  });

  router.post('/instances', requireAuth, async (req, res) => {
    try {
      const { name, host_url, api_key, strategy_tag, is_primary_admin, is_secondary_admin } = req.body;

      // Access utility functions from app.locals
      const { normalizeHostUrl, sanitizeApiKey, updater_updateInstancesData, makeOpenAlgoRequest } = req.app.locals;

      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const normalizedHostUrl = normalizeHostUrl(host_url);
      const sanitizedApiKey = sanitizeApiKey(api_key);
      const sanitizedStrategyTag = typeof strategy_tag === 'string' && strategy_tag.trim() !== '' ? strategy_tag.trim() : null;
      const isPrimaryAdmin = is_primary_admin ? 1 : 0;
      const isSecondaryAdmin = is_secondary_admin ? 1 : 0;

      if (!trimmedName || !normalizedHostUrl || !sanitizedApiKey) {
        return res.status(400).json({ error: 'Name, host_url, and api_key are required' });
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

      res.status(201).json(newInstance);
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
          error: 'Database schema outdated. Please run migrations: node db/migrate.js up',
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

  router.put('/instances/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const { normalizeHostUrl, sanitizeApiKey } = req.app.locals;

      const allowedFields = new Set([
        'name', 'host_url', 'api_key', 'strategy_tag',
        'target_profit', 'target_loss', 'is_active', 'is_analyzer_mode',
        'is_primary_admin', 'is_secondary_admin'
      ]);

      const sanitizedUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (!allowedFields.has(key)) continue;

        switch (key) {
          case 'name':
            const trimmed = typeof value === 'string' ? value.trim() : '';
            if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
            sanitizedUpdates.name = trimmed;
            break;
          case 'host_url':
            const normalized = normalizeHostUrl(value);
            if (!normalized) return res.status(400).json({ error: 'Invalid host_url provided' });
            sanitizedUpdates.host_url = normalized;
            break;
          case 'api_key':
            const sanitizedKey = sanitizeApiKey(value);
            if (!sanitizedKey) return res.status(400).json({ error: 'API key cannot be empty' });
            sanitizedUpdates.api_key = sanitizedKey;
            break;
          case 'strategy_tag':
            sanitizedUpdates.strategy_tag = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
            break;
          case 'target_profit':
          case 'target_loss':
            const numericValue = Number.parseFloat(value);
            if (!Number.isFinite(numericValue)) {
              return res.status(400).json({ error: `${key} must be a numeric value` });
            }
            sanitizedUpdates[key] = numericValue;
            break;
          case 'is_active':
          case 'is_analyzer_mode':
          case 'is_primary_admin':
          case 'is_secondary_admin':
            sanitizedUpdates[key] = value ? 1 : 0;
            break;
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
      }

      const fields = Object.keys(sanitizedUpdates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(sanitizedUpdates), id];

      await dbAsync.run(
        `UPDATE instances SET ${fields}, last_updated = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      const updatedInstance = await dbAsync.get('SELECT * FROM instances WHERE id = ?', [id]);
      res.json(updatedInstance);
    } catch (error) {
      console.error('Error updating instance:', error);
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to update instance',
        message: error.message || 'Failed to update instance'
      });
    }
  });

  router.delete('/instances/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await dbAsync.run('DELETE FROM instances WHERE id = ?', [id]);
      res.json({ message: 'Instance deleted successfully' });
    } catch (error) {
      console.error('Error deleting instance:', error);
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to delete instance',
        message: error.message || 'Failed to delete instance'
      });
    }
  });

  // Mount feature routes (all require authentication)
  router.use('/watchlists', requireAuth, watchlistRoutes);
  router.use('/watchlists', requireAuth, symbolRoutes);
  router.use('/watchlists', requireAuth, watchlistOrderRoutes);
  router.use('/instances', requireAuth, instanceConfigRoutes);
  router.use('/websocket', requireAuth, websocketStatusRoutes);
  router.use('/symbols', requireAuth, symbolSearchRoutes);
  router.use('/symbols', requireAuth, symbolRoutes);
  router.use('/options', requireAuth, optionsRoutes);
  router.use('/quotes', requireAuth, quotesRoutes);

  // Position and order routes (require dependency injection)
  router.use('/positions', requireAuth, createPositionRoutes(dbAsync));
  router.use('/orders', requireAuth, createOrderRoutes(dbAsync, io));

  return router;
}

export default createV1Router;
