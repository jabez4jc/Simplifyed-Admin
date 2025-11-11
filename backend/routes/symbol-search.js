/**
 * Symbol Search Routes
 * Handles dynamic symbol search with caching from OpenAlgo search API
 */

import express from 'express';
import { validateOpenAlgoSymbol } from '../lib/openalgo-search.js';

const router = express.Router();

/**
 * GET /api/symbols/search
 * Search for symbols using OpenAlgo search API with caching
 * Query params: ?q=RELIANCE
 */
router.get('/search', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { q: query } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required'
      });
    }

    const searchQuery = query.trim().toUpperCase();

    // Check cache first (last 7 days) - check for exact query match
    const cachedResults = await dbAsync.all(
      `SELECT symbol, tradingsymbol, exchange, exchange_segment, instrument_type,
              lot_size, tick_size, name, isin, asset_class, can_trade_equity,
              can_trade_futures, can_trade_options
       FROM symbol_search_cache
       WHERE search_query LIKE ?
       AND created_at > datetime('now', '-7 days')
       ORDER BY created_at DESC
       LIMIT 1000`,
      [`%${searchQuery}%`]
    );

    // If we have fresh cache, return it
    if (cachedResults.length > 0) {
      // Remove duplicates based on symbol + exchange
      const uniqueResults = [];
      const seen = new Set();
      for (const result of cachedResults) {
        const key = `${result.symbol}-${result.exchange}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(result);
        }
      }

      console.log(`✅ Returning ${uniqueResults.length} cached search results for "${searchQuery}"`);
      return res.json({
        status: 'success',
        data: uniqueResults,
        source: 'cache'
      });
    }

    // Call OpenAlgo search API with the original query (no stripping, no exact matching)
    console.log(`🔍 Searching OpenAlgo API for "${searchQuery}"`);
    const validation = await validateOpenAlgoSymbol({
      symbol: searchQuery,
      dbAsync,
      requireExactMatch: false
    });

    if (!validation.valid) {
      return res.status(404).json({
        status: 'error',
        message: `No symbols found for "${searchQuery}". Try searching for just the base symbol (e.g., "RELIANCE" instead of "RELIANCE FUT")`
      });
    }

    // Process and cache the results
    const results = validation.results || [];
    const normalizedResults = results.map(item => ({
      symbol: item.symbol || item.tradingsymbol || '',
      tradingsymbol: item.tradingsymbol || item.symbol || '',
      exchange: item.exchange || item.exch || item.segment || '',
      exchange_segment: item.exchange_segment || item.segment || '',
      instrument_type: item.instrument_type || item.instrument || item.exercise_type || '',
      lot_size: item.lotsize || item.lot_size || item.lotsize || 1,
      tick_size: item.tick_size || item.ticksize || null,
      name: item.name || item.companyname || null,
      isin: item.isin || null,
      asset_class: item.asset_class || 'EQUITY',
      can_trade_equity: item.can_trade_equity || 0,
      can_trade_futures: item.can_trade_futures || 0,
      can_trade_options: item.can_trade_options || 0
    }));

    // Filter out invalid results and cache them
    const validResults = normalizedResults.filter(r =>
      r.symbol && r.exchange && r.symbol !== '' && r.exchange !== ''
    );

    if (validResults.length > 0) {
      for (const result of validResults) {
        try {
          await dbAsync.run(
            `INSERT OR REPLACE INTO symbol_search_cache
             (search_query, symbol, tradingsymbol, exchange, exchange_segment,
              instrument_type, lot_size, tick_size, name, isin, asset_class,
              can_trade_equity, can_trade_futures, can_trade_options)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              searchQuery,
              result.symbol,
              result.tradingsymbol,
              result.exchange,
              result.exchange_segment,
              result.instrument_type,
              result.lot_size,
              result.tick_size,
              result.name,
              result.isin,
              result.asset_class,
              result.can_trade_equity,
              result.can_trade_futures,
              result.can_trade_options
            ]
          );
        } catch (cacheError) {
          console.error('Error caching search result:', cacheError);
        }
      }
      console.log(`💾 Cached ${validResults.length} search results for "${searchQuery}"`);
    }

    // Return ALL results, not limited to 20
    res.json({
      status: 'success',
      data: validResults,
      source: 'api'
    });
  } catch (error) {
    console.error('Error searching symbols:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search symbols',
      error: error.message
    });
  }
});

/**
 * GET /api/symbols/suggestions
 * Get symbol suggestions with type filtering
 * Query params: ?q=RELIANCE
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { q: query } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json({
        status: 'success',
        data: []
      });
    }

    const searchQuery = query.trim().toUpperCase();

    // Get suggestions from cache
    const suggestions = await dbAsync.all(
      `SELECT DISTINCT symbol, tradingsymbol, exchange, instrument_type
       FROM symbol_search_cache
       WHERE search_query LIKE ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [`%${searchQuery}%`]
    );

    res.json({
      status: 'success',
      data: suggestions
    });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get suggestions',
      error: error.message
    });
  }
});

/**
 * GET /api/symbols/exchanges
 * Get available exchanges for a symbol
 * Query params: ?symbol=RELIANCE
 */
router.get('/exchanges', async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { symbol } = req.query;

    if (!symbol || symbol.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Symbol is required'
      });
    }

    const searchSymbol = symbol.trim().toUpperCase();

    // Get exchanges from cache
    const exchanges = await dbAsync.all(
      `SELECT DISTINCT exchange, instrument_type, lot_size
       FROM symbol_search_cache
       WHERE symbol = ?
       ORDER BY exchange, instrument_type`,
      [searchSymbol]
    );

    // Group by symbol to show all available exchanges/types
    const grouped = {};
    for (const ex of exchanges) {
      const key = `${ex.symbol}-${ex.exchange}`;
      if (!grouped[key]) {
        grouped[key] = {
          symbol: searchSymbol,
          exchange: ex.exchange,
          types: []
        };
      }
      grouped[key].types.push({
        instrument_type: ex.instrument_type,
        lot_size: ex.lot_size
      });
    }

    res.json({
      status: 'success',
      data: Object.values(grouped)
    });
  } catch (error) {
    console.error('Error getting exchanges:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get exchanges',
      error: error.message
    });
  }
});

export default router;
