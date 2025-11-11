/**
 * Request Validation Middleware
 *
 * Uses Joi for schema validation of request body, query, and params.
 * Provides clear error messages for validation failures.
 */

import Joi from 'joi';
import { ValidationError } from './error-handler.js';

/**
 * Validate request against Joi schema
 *
 * @param {Object} schema - Joi schema object with body, query, params
 * @param {Object} options - Joi validation options
 * @returns {Function} Express middleware
 */
export function validate(schema, options = {}) {
  // Default Joi options
  const defaultOptions = {
    abortEarly: false, // Return all errors, not just the first one
    stripUnknown: true, // Remove unknown keys
    ...options
  };

  return (req, res, next) => {
    const toValidate = {};

    // Build object to validate
    if (schema.body && req.body) {
      toValidate.body = req.body;
    }
    if (schema.query && req.query) {
      toValidate.query = req.query;
    }
    if (schema.params && req.params) {
      toValidate.params = req.params;
    }

    // Create combined schema
    const combinedSchema = Joi.object(toValidate);

    // Validate
    const { error, value } = combinedSchema.validate(toValidate, defaultOptions);

    if (error) {
      // Format validation errors
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''), // Remove quotes
        type: detail.type
      }));

      return next(new ValidationError('Validation failed', details));
    }

    // Replace request data with validated/sanitized data
    if (value.body) req.body = value.body;
    if (value.query) req.query = value.query;
    if (value.params) req.params = value.params;

    next();
  };
}

/**
 * Common Joi schemas for reuse
 */
export const schemas = {
  // ID validation
  id: Joi.number().integer().positive(),
  uuid: Joi.string().guid({ version: 'uuidv4' }),

  // Pagination
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('asc', 'desc').default('desc'),
    sortBy: Joi.string()
  },

  // Trading instance
  instance: {
    name: Joi.string().min(1).max(100).required(),
    host_url: Joi.string().uri().required(),
    api_key: Joi.string().min(10).required(),
    strategy_tag: Joi.string().max(50).allow('', null),
    target_profit: Joi.number().positive().default(5000),
    target_loss: Joi.number().positive().default(2000),
    is_active: Joi.boolean().default(true),
    is_analyzer_mode: Joi.boolean().default(false)
  },

  // Watchlist
  watchlist: {
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).allow('', null),
    is_active: Joi.boolean().default(true)
  },

  // Watchlist symbol
  watchlistSymbol: {
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'MCX').required(),
    symbol: Joi.string().min(1).max(50).required(),
    token: Joi.string().allow('', null),
    lot_size: Joi.number().integer().positive().default(1),
    qty_type: Joi.string().valid('FIXED', 'CAPITAL', 'LOTS').default('FIXED'),
    qty_value: Joi.number().positive().required(),
    product_type: Joi.string().valid('MIS', 'CNC', 'NRML').default('MIS'),
    order_type: Joi.string().valid('MARKET', 'LIMIT', 'SL', 'SL-M').default('MARKET'),
    target_type: Joi.string().valid('NONE', 'POINTS', 'PERCENTAGE').default('NONE'),
    target_value: Joi.number().positive().allow(null),
    sl_type: Joi.string().valid('NONE', 'POINTS', 'PERCENTAGE').default('NONE'),
    sl_value: Joi.number().positive().allow(null),
    is_enabled: Joi.boolean().default(true)
  },

  // Order placement
  order: {
    symbol: Joi.string().required(),
    exchange: Joi.string().valid('NSE', 'BSE', 'NFO', 'BFO', 'MCX').required(),
    action: Joi.string().valid('BUY', 'SELL').required(),
    quantity: Joi.number().integer().positive().required(),
    product: Joi.string().valid('MIS', 'CNC', 'NRML').required(),
    order_type: Joi.string().valid('MARKET', 'LIMIT', 'SL', 'SL-M').required(),
    price: Joi.number().positive().when('order_type', {
      is: Joi.string().valid('LIMIT', 'SL'),
      then: Joi.required(),
      otherwise: Joi.allow(null)
    }),
    trigger_price: Joi.number().positive().when('order_type', {
      is: Joi.string().valid('SL', 'SL-M'),
      then: Joi.required(),
      otherwise: Joi.allow(null)
    })
  },

  // Email
  email: Joi.string().email().lowercase().required(),

  // Date range
  dateRange: {
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso().min(Joi.ref('start_date'))
  }
};

/**
 * Pre-built validators for common operations
 */
export const validators = {
  // Instance validators
  createInstance: validate({
    body: Joi.object(schemas.instance)
  }),

  updateInstance: validate({
    params: Joi.object({
      id: schemas.id.required()
    }),
    body: Joi.object({
      name: schemas.instance.name.optional(),
      strategy_tag: schemas.instance.strategy_tag.optional(),
      target_profit: schemas.instance.target_profit.optional(),
      target_loss: schemas.instance.target_loss.optional(),
      is_active: schemas.instance.is_active.optional(),
      is_analyzer_mode: schemas.instance.is_analyzer_mode.optional()
    }).min(1) // At least one field required
  }),

  getInstance: validate({
    params: Joi.object({
      id: schemas.id.required()
    })
  }),

  // Watchlist validators
  createWatchlist: validate({
    body: Joi.object(schemas.watchlist)
  }),

  updateWatchlist: validate({
    params: Joi.object({
      id: schemas.id.required()
    }),
    body: Joi.object({
      name: schemas.watchlist.name.optional(),
      description: schemas.watchlist.description.optional(),
      is_active: schemas.watchlist.is_active.optional()
    }).min(1)
  }),

  // Symbol validators
  addSymbol: validate({
    params: Joi.object({
      id: schemas.id.required()
    }),
    body: Joi.object(schemas.watchlistSymbol)
  }),

  // Order validators
  placeOrder: validate({
    body: Joi.object(schemas.order)
  }),

  // Pagination
  paginate: validate({
    query: Joi.object(schemas.pagination)
  })
};

export default {
  validate,
  validators,
  schemas
};
