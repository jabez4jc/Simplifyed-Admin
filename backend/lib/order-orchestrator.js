/**
 * Order Orchestrator - Scalper Terminal
 * Manages multi-instance order placement with position-aware logic
 * Handles fan-out, idempotency, and order reconciliation
 */

import crypto from 'crypto';

class OrderOrchestrator {
  constructor(dbAsync, makeOpenAlgoRequest) {
    this.dbAsync = dbAsync;
    this.makeOpenAlgoRequest = makeOpenAlgoRequest;
    this.maxInstances = 50;
  }

  /**
   * Calculate position-aware order quantity
   * Uses current position to determine action and quantity
   *
   * 4-Action System:
   * - BUY: Target net +lots (add to long or open new long)
   * - SELL: Target net 0 (close long position, don't open short)
   * - SHORT: Target net -lots (add to short or open new short)
   * - COVER: Target net 0 (close short position)
   */
  async calculatePositionAwareOrder(instanceId, symbol, action, requestedQuantity) {
    try {
      // Get current position
      const positionResponse = await this.makeOpenAlgoRequest(
        { id: instanceId },
        'positionbook',
        'POST',
        { instance_id: instanceId }
      );

      if (positionResponse.status !== 'success') {
        throw new Error('Failed to fetch position for position-aware logic');
      }

      const position = positionResponse.data?.find(p => p.symbol === symbol);
      const currentNetQty = position ? parseInt(position.netqty || 0) : 0; // Keep sign!
      const lotSize = position ? parseInt(position.lotsize || 75) : 75;

      // Round requested quantity to lot size
      const roundedQuantity = Math.ceil(requestedQuantity / lotSize) * lotSize;

      let targetNetQty, execQty, execAction, message;

      switch (action) {
        case 'BUY':
          // Target: +roundedQuantity
          targetNetQty = roundedQuantity;
          execQty = targetNetQty - currentNetQty;
          execAction = execQty > 0 ? 'BUY' : execQty < 0 ? 'SELL' : null;
          message = execQty > 0 ? `Adding to long position` : execQty < 0 ? `Reducing short position` : `No action needed`;
          break;

        case 'SELL':
          // Target: 0 (close only, don't flip to short)
          targetNetQty = 0;
          if (currentNetQty > 0) {
            // Long position, close it
            execQty = Math.min(currentNetQty, roundedQuantity);
            execAction = 'SELL';
            message = `Closing long position (${execQty} of ${currentNetQty})`;
          } else if (currentNetQty < 0) {
            // Short position, don't add to it - this is a no-op
            execQty = 0;
            execAction = null;
            message = `Cannot SELL - currently short (${currentNetQty}). Use COVER to close short.`;
          } else {
            // No position, this would open a short - not allowed for SELL action
            execQty = 0;
            execAction = null;
            message = `Cannot SELL - no position. Use SHORT to open short position.`;
          }
          break;

        case 'SHORT':
          // Target: -roundedQuantity
          targetNetQty = -roundedQuantity;
          execQty = targetNetQty - currentNetQty;
          execAction = execQty < 0 ? 'SELL' : execQty > 0 ? 'BUY' : null;
          message = execQty < 0 ? `Adding to short position` : execQty > 0 ? `Reducing long position` : `No action needed`;
          break;

        case 'COVER':
          // Target: 0 (close short position)
          targetNetQty = 0;
          if (currentNetQty < 0) {
            // Short position, close it
            execQty = -currentNetQty; // Buy back to close
            execAction = 'BUY';
            message = `Covering short position (${execQty})`;
          } else if (currentNetQty > 0) {
            // Long position, don't add to it - this is a no-op
            execQty = 0;
            execAction = null;
            message = `Cannot COVER - currently long (${currentNetQty}). Use SELL to close long.`;
          } else {
            // No position
            execQty = 0;
            execAction = null;
            message = `No position to cover`;
          }
          break;

        default:
          throw new Error(`Invalid action: ${action}`);
      }

      return {
        action: execAction,
        quantity: Math.abs(execQty),
        currentNetQty,
        targetNetQty,
        execQty,
        lotSize,
        isPositionChange: execQty !== 0,
        message
      };
    } catch (error) {
      console.error('Error calculating position-aware order:', error);
      // Fallback to simple order (no position awareness)
      return {
        action,
        quantity: requestedQuantity,
        currentNetQty: 0,
        targetNetQty: action === 'SHORT' ? -requestedQuantity : action === 'BUY' ? requestedQuantity : 0,
        execQty: requestedQuantity,
        lotSize: 75,
        isPositionChange: true,
        message: 'Position fetch failed, executing direct order'
      };
    }
  }

  /**
   * Generate idempotent client_order_id
   */
  generateClientOrderId(symbol, action, userId, timestamp) {
    const hash = crypto.createHash('sha256')
      .update(`${symbol}_${action}_${userId}_${timestamp}`)
      .digest('hex')
      .substring(0, 16);
    return `scalper_${hash}`;
  }

  /**
   * Check if order already exists (idempotency check)
   */
  async checkDuplicateOrder(clientOrderId, instanceId) {
    try {
      const order = await this.dbAsync.get(
        'SELECT * FROM orders_audit WHERE client_order_id = ? AND instance_id = ?',
        [clientOrderId, instanceId]
      );
      return order;
    } catch (error) {
      console.error('Error checking duplicate order:', error);
      return null;
    }
  }

  /**
   * Place order with comprehensive validation and error handling
   */
  async placeOrder(options) {
    const {
      instance,
      symbol,
      exchange,
      action,
      product = 'MIS',
      pricetype = 'MARKET',
      quantity,
      price,
      trigger_price,
      client_order_id,
      user_id
    } = options;

    try {
      // Validate inputs
      if (!symbol || !action || !quantity || !client_order_id) {
        throw new Error('Missing required fields: symbol, action, quantity, client_order_id');
      }

      // Validate tick size
      await this.validateTickSize(symbol, exchange, price, pricetype);

      // Validate lot size
      await this.validateLotSize(symbol, exchange, quantity);

      // Check for duplicate
      const duplicate = await this.checkDuplicateOrder(client_order_id, instance.id);
      if (duplicate) {
        return {
          status: 'duplicate',
          order_id: duplicate.order_id || 'N/A',
          message: 'Order already placed (idempotent)',
          client_order_id
        };
      }

      // Place order via OpenAlgo
      const response = await this.makeOpenAlgoRequest(
        instance,
        'placesmartorder',
        'POST',
        {
          apikey: instance.api_key,
          strategy: 'Scalper Terminal',
          symbol,
          exchange,
          action,
          product,
          pricetype,
          quantity,
          price: pricetype === 'LIMIT' ? price : 0,
          trigger_price: pricetype === 'SL' || pricetype === 'SL-M' ? trigger_price : 0,
          client_order_id
        }
      );

      // Log to audit table
      await this.logOrder({
        instance_id: instance.id,
        symbol,
        action,
        product,
        pricetype,
        qty: quantity,
        side: action,
        client_order_id,
        request: { symbol, exchange, action, product, pricetype, quantity, price, trigger_price },
        response,
        state: response.status === 'success' ? 'SUBMITTED' : 'REJECTED',
        error_message: response.status !== 'success' ? response.message : null
      });

      if (response.status === 'success') {
        return {
          status: 'success',
          order_id: response.orderid,
          client_order_id,
          message: 'Order placed successfully'
        };
      } else {
        return {
          status: 'error',
          error: response.message || 'Order failed',
          client_order_id
        };
      }
    } catch (error) {
      console.error('Error placing order:', error);

      // Log error to audit
      await this.logOrder({
        instance_id: instance.id,
        symbol,
        action,
        product,
        pricetype,
        qty: quantity,
        side: action,
        client_order_id,
        request: { symbol, exchange, action, product, pricetype, quantity, price, trigger_price },
        response: null,
        state: 'REJECTED',
        error_message: error.message
      });

      return {
        status: 'error',
        error: error.message,
        client_order_id
      };
    }
  }

  /**
   * Log order to audit table
   */
  async logOrder(logData) {
    try {
      const {
        instance_id,
        symbol,
        action,
        product,
        pricetype,
        qty,
        side,
        client_order_id,
        request,
        response,
        state,
        error_message
      } = logData;

      await this.dbAsync.run(
        `INSERT INTO orders_audit (
          instance_id, symbol, action, product, pricetype, qty, side, client_order_id,
          request_body, response_body, state, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          instance_id,
          symbol,
          action,
          product,
          pricetype,
          qty,
          side,
          client_order_id,
          JSON.stringify(request),
          JSON.stringify(response),
          state,
          error_message
        ]
      );
    } catch (error) {
      console.error('Error logging order:', error);
    }
  }

  /**
   * Validate tick size
   */
  async validateTickSize(symbol, exchange, price, pricetype) {
    if (pricetype !== 'LIMIT' || !price) {
      return; // No validation needed for MARKET orders or no price
    }

    try {
      // Get symbol details
      const symbolInfo = await this.getSymbolInfo(symbol, exchange);
      if (!symbolInfo || !symbolInfo.tick_size) {
        console.warn('Could not validate tick size: symbol info not found');
        return;
      }

      const tickSize = parseFloat(symbolInfo.tick_size);
      const validPrice = (price / tickSize) % 1 === 0;

      if (!validPrice) {
        throw new Error(
          `Invalid price: must be a multiple of tick size (${tickSize}). Provided: ${price}`
        );
      }
    } catch (error) {
      if (error.message.includes('Invalid price')) {
        throw error;
      }
      console.warn('Tick size validation error:', error.message);
    }
  }

  /**
   * Validate lot size
   */
  async validateLotSize(symbol, exchange, quantity) {
    try {
      const symbolInfo = await this.getSymbolInfo(symbol, exchange);
      if (!symbolInfo || !symbolInfo.lotsize) {
        console.warn('Could not validate lot size: symbol info not found');
        return;
      }

      const lotSize = parseInt(symbolInfo.lotsize);
      if (quantity % lotSize !== 0) {
        throw new Error(
          `Invalid quantity: must be a multiple of lot size (${lotSize}). Provided: ${quantity}`
        );
      }
    } catch (error) {
      if (error.message.includes('Invalid quantity')) {
        throw error;
      }
      console.warn('Lot size validation error:', error.message);
    }
  }

  /**
   * Get symbol information
   */
  async getSymbolInfo(symbol, exchange) {
    try {
      // Check cache first
      const cached = await this.dbAsync.get(
        'SELECT * FROM symbols WHERE symbol = ? AND exchange = ?',
        [symbol, exchange]
      );

      if (cached) {
        return cached;
      }

      // Fallback to OpenAlgo
      const adminInstance = await this.dbAsync.get(
        'SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1'
      );

      if (!adminInstance) {
        throw new Error('No admin instance available');
      }

      const response = await this.makeOpenAlgoRequest(
        adminInstance,
        'quotes',
        'POST',
        {
          apikey: adminInstance.api_key,
          exchange,
          tradingsymbol: symbol
        }
      );

      if (response.status === 'success') {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error('Error getting symbol info:', error);
      return null;
    }
  }

  /**
   * Broadcast order to multiple instances
   */
  async broadcastOrder(orderOptions) {
    const { instance_ids, max_instances = this.maxInstances } = orderOptions;

    if (!Array.isArray(instance_ids) || instance_ids.length === 0) {
      throw new Error('instance_ids must be a non-empty array');
    }

    if (instance_ids.length > max_instances) {
      throw new Error(`Max ${max_instances} instances per broadcast`);
    }

    // Get instances
    const placeholders = instance_ids.map(() => '?').join(',');
    const instances = await this.dbAsync.all(
      `SELECT * FROM instances WHERE id IN (${placeholders}) AND is_active = 1`,
      instance_ids
    );

    if (instances.length === 0) {
      throw new Error('No valid instances found');
    }

    // Filter out RM blocked instances
    const activeInstances = instances.filter(i => i.is_analyzer_mode === 0);
    const blockedInstances = instances.filter(i => i.is_analyzer_mode === 1);

    // Log blocked instances
    for (const instance of blockedInstances) {
      await this.logRiskEvent({
        instance_id: instance.id,
        type: 'RM_BLOCKED',
        state: 'TRIGGERED',
        message: 'Order blocked - instance in analyze mode'
      });
    }

    const results = [];
    const errors = [];

    // Place orders
    for (const instance of activeInstances) {
      try {
        const result = await this.placeOrder({
          ...orderOptions,
          instance
        });

        results.push({
          instance_id: instance.id,
          instance_name: instance.name,
          ...result
        });
      } catch (error) {
        errors.push({
          instance_id: instance.id,
          instance_name: instance.name,
          error: error.message
        });
      }
    }

    return {
      total_requested: instances.length,
      total_successful: results.filter(r => r.status === 'success').length,
      total_failed: errors.length,
      blocked_count: blockedInstances.length,
      results,
      errors,
      blocked: blockedInstances.map(i => ({
        instance_id: i.id,
        instance_name: i.name,
        reason: 'analyze_mode'
      }))
    };
  }

  /**
   * Log risk event
   */
  async logRiskEvent(eventData) {
    try {
      const { instance_id, type, value, threshold, state, message } = eventData;

      await this.dbAsync.run(
        `INSERT INTO risk_events (instance_id, type, value, threshold, state, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [instance_id, type, value, threshold, state, message]
      );
    } catch (error) {
      console.error('Error logging risk event:', error);
    }
  }
}

export default OrderOrchestrator;
