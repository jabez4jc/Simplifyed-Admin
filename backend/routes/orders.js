/**
 * Order Management Routes
 * API endpoints for order tracking and management
 * Phase 4: Order Placement & Rate Limiting
 */

import express from 'express';
import { requireAuth } from '../auth.js';

const router = express.Router();

/**
 * Initialize order routes
 */
export default function createOrderRoutes(dbAsync, orderPlacementService, rateLimiterManager) {

  /**
   * GET /api/orders - List all orders
   */
  router.get('/', requireAuth, async (req, res) => {
    try {
      const { instanceId, status, watchlistId, limit = 100 } = req.query;

      let query = `
        SELECT
          wo.*,
          ws.symbol,
          ws.exchange,
          i.name as instance_name,
          w.name as watchlist_name
        FROM watchlist_orders wo
        LEFT JOIN watchlist_symbols ws ON ws.id = wo.symbol_id
        LEFT JOIN instances i ON i.id = wo.instance_id
        LEFT JOIN watchlists w ON w.id = wo.watchlist_id
        WHERE 1=1
      `;

      const params = [];

      if (instanceId) {
        query += ' AND wo.instance_id = ?';
        params.push(parseInt(instanceId));
      }

      if (status) {
        query += ' AND wo.status = ?';
        params.push(status);
      }

      if (watchlistId) {
        query += ' AND wo.watchlist_id = ?';
        params.push(parseInt(watchlistId));
      }

      query += ' ORDER BY wo.placed_at DESC LIMIT ?';
      params.push(parseInt(limit));

      const orders = await dbAsync.all(query, params);

      res.json({
        success: true,
        count: orders.length,
        orders
      });
    } catch (error) {
      console.error('[Orders API] Error fetching orders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch orders',
        message: error.message
      });
    }
  });

  /**
   * GET /api/orders/:id - Get order details
   */
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);

      const order = await dbAsync.get(`
        SELECT
          wo.*,
          ws.symbol,
          ws.exchange,
          i.name as instance_name,
          w.name as watchlist_name
        FROM watchlist_orders wo
        LEFT JOIN watchlist_symbols ws ON ws.id = wo.symbol_id
        LEFT JOIN instances i ON i.id = wo.instance_id
        LEFT JOIN watchlists w ON w.id = wo.watchlist_id
        WHERE wo.id = ?
      `, [orderId]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        order
      });
    } catch (error) {
      console.error('[Orders API] Error fetching order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch order',
        message: error.message
      });
    }
  });

  /**
   * POST /api/orders/:id/cancel - Cancel order
   */
  router.post('/:id/cancel', requireAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);

      const order = await dbAsync.get('SELECT * FROM watchlist_orders WHERE id = ?', [orderId]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.status === 'complete' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Cannot cancel order with status: ${order.status}`
        });
      }

      const result = await orderPlacementService.cancelOrder(order.instance_id, order.order_id);

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        order_id: order.order_id
      });
    } catch (error) {
      console.error('[Orders API] Error cancelling order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel order',
        message: error.message
      });
    }
  });

  /**
   * GET /api/orders/stats/summary - Order statistics
   */
  router.get('/stats/summary', requireAuth, async (req, res) => {
    try {
      const stats = await dbAsync.get(`
        SELECT
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_orders,
          SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(retry_count) as total_retries
        FROM watchlist_orders
        WHERE placed_at >= datetime('now', '-24 hours')
      `);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('[Orders API] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch order statistics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/rate-limits/status - Get rate limit status
   */
  router.get('/rate-limits/status', requireAuth, async (req, res) => {
    try {
      const { instanceId } = req.query;

      if (instanceId) {
        const state = rateLimiterManager.getInstanceState(parseInt(instanceId));
        res.json({
          success: true,
          instance_id: parseInt(instanceId),
          rate_limiters: state
        });
      } else {
        const states = rateLimiterManager.getAllStates();
        res.json({
          success: true,
          rate_limiters: states
        });
      }
    } catch (error) {
      console.error('[Orders API] Error fetching rate limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rate limits',
        message: error.message
      });
    }
  });

  /**
   * GET /api/rate-limits/stats - Get rate limit statistics
   */
  router.get('/rate-limits/stats', requireAuth, async (req, res) => {
    try {
      const { instanceId, hours = 24 } = req.query;

      if (!instanceId) {
        return res.status(400).json({
          success: false,
          error: 'instanceId is required'
        });
      }

      const stats = await rateLimiterManager.getRateLimitStats(parseInt(instanceId), parseInt(hours));

      res.json({
        success: true,
        instance_id: parseInt(instanceId),
        hours: parseInt(hours),
        stats
      });
    } catch (error) {
      console.error('[Orders API] Error fetching rate limit stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rate limit statistics',
        message: error.message
      });
    }
  });

  return router;
}
