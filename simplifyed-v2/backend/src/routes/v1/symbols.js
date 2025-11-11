/**
 * Symbol Routes
 * API endpoints for symbol search and market data
 */

import express from 'express';
import instanceService from '../../services/instance.service.js';
import openalgoClient from '../../integrations/openalgo/client.js';
import db from '../../core/database.js';
import { log } from '../../core/logger.js';
import { ValidationError } from '../../core/errors.js';
import { sanitizeString } from '../../utils/sanitizers.js';

const router = express.Router();

/**
 * GET /api/v1/symbols/search
 * Search for symbols using OpenAlgo
 */
router.get('/search', async (req, res, next) => {
  try {
    const { query, instanceId } = req.query;

    if (!query) {
      throw new ValidationError('query parameter is required');
    }

    // Get an instance to use for search
    // Prefer market data instances (primary/secondary) for consistency
    let instance;

    if (instanceId) {
      instance = await instanceService.getInstanceById(parseInt(instanceId, 10));
    } else {
      // Use market data instance (primary or secondary)
      const marketDataInstances = await instanceService.getMarketDataInstances();

      if (marketDataInstances.length === 0) {
        // Fallback to any active instance if no market data instances configured
        // Prefer healthy instances over unhealthy ones
        const instances = await instanceService.getAllInstances({
          is_active: true,
        });

        if (instances.length === 0) {
          throw new ValidationError('No active instances available for search');
        }

        // Filter for healthy instances first
        const healthyInstances = instances.filter(
          (inst) => inst.health_status === 'healthy'
        );

        if (healthyInstances.length > 0) {
          instance = healthyInstances[0];
          log.debug('Using fallback healthy instance for symbol search', {
            instance_id: instance.id,
            health_status: instance.health_status,
          });
        } else {
          // Use any active instance if no healthy instances available
          instance = instances[0];
          log.warn('Using fallback instance with non-healthy status for symbol search', {
            instance_id: instance.id,
            health_status: instance.health_status,
          });
        }
      } else {
        instance = marketDataInstances[0];
        log.debug('Using market data instance for symbol search', {
          instance_id: instance.id,
          market_data_role: instance.market_data_role,
        });
      }
    }

    // Search symbols via OpenAlgo
    const results = await openalgoClient.searchSymbols(instance, query);

    // Cache results in database
    for (const symbol of results) {
      try {
        await db.run(
          `INSERT INTO symbol_search_cache (exchange, symbol, token, name)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(exchange, symbol) DO UPDATE SET
             token = excluded.token,
             name = excluded.name,
             last_searched = CURRENT_TIMESTAMP`,
          [
            symbol.exchange,
            symbol.symbol || symbol.tradingsymbol,
            symbol.token,
            symbol.name || symbol.company_name || null,
          ]
        );
      } catch (error) {
        log.warn('Failed to cache symbol', error, { symbol });
      }
    }

    res.json({
      status: 'success',
      data: results,
      count: results.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols/quotes
 * Get quotes for symbols
 */
router.get('/quotes', async (req, res, next) => {
  try {
    const { symbols, instanceId } = req.query;

    if (!symbols) {
      throw new ValidationError('symbols parameter is required');
    }

    if (!instanceId) {
      throw new ValidationError('instanceId parameter is required');
    }

    const instance = await instanceService.getInstanceById(
      parseInt(instanceId, 10)
    );

    // Get quotes from OpenAlgo
    const quotes = await openalgoClient.getQuotes(instance, symbols);

    res.json({
      status: 'success',
      data: quotes,
      count: quotes.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols/market-data/:exchange/:symbol
 * Get cached market data for a symbol
 */
router.get('/market-data/:exchange/:symbol', async (req, res, next) => {
  try {
    const { exchange, symbol } = req.params;

    const data = await db.get(
      'SELECT * FROM market_data WHERE exchange = ? AND symbol = ?',
      [exchange.toUpperCase(), symbol.toUpperCase()]
    );

    if (!data) {
      res.json({
        status: 'success',
        data: null,
        message: 'No cached data available',
      });
      return;
    }

    res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols/expiry
 * Get expiry dates for options
 */
router.get('/expiry', async (req, res, next) => {
  try {
    const { symbol, exchange, instanceId } = req.query;

    if (!symbol) {
      throw new ValidationError('symbol parameter is required');
    }

    if (!instanceId) {
      throw new ValidationError('instanceId parameter is required');
    }

    const instance = await instanceService.getInstanceById(
      parseInt(instanceId, 10)
    );

    // Get expiry dates from OpenAlgo
    const expiries = await openalgoClient.getExpiry(
      instance,
      symbol,
      exchange || 'NFO'
    );

    res.json({
      status: 'success',
      data: expiries,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/symbols/option-chain
 * Get option chain for a symbol
 */
router.get('/option-chain', async (req, res, next) => {
  try {
    const { symbol, expiry, exchange, instanceId } = req.query;

    if (!symbol) {
      throw new ValidationError('symbol parameter is required');
    }

    if (!expiry) {
      throw new ValidationError('expiry parameter is required');
    }

    if (!instanceId) {
      throw new ValidationError('instanceId parameter is required');
    }

    const instance = await instanceService.getInstanceById(
      parseInt(instanceId, 10)
    );

    // Get option chain from OpenAlgo
    const optionChain = await openalgoClient.getOptionChain(
      instance,
      symbol,
      expiry,
      exchange || 'NFO'
    );

    res.json({
      status: 'success',
      data: optionChain,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
