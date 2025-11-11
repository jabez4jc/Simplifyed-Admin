/**
 * API v1 Routes
 *
 * Consolidates all v1 routes in one place for easy management.
 * Import this in server.js and mount at /api/v1
 */

import express from 'express';
import { requireAuth, requireAdminAccess } from '../../auth.js';

// Import existing route modules
import watchlistRoutes from '../watchlist.js';
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
