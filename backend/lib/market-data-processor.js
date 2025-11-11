/**
 * Market Data Processor
 * Batches market data updates to database (runs every 1 second)
 */

class MarketDataProcessor {
  constructor(dbAsync, wsManager) {
    this.dbAsync = dbAsync;
    this.wsManager = wsManager;
    this.updateInterval = null;
    this.batchUpdateIntervalMs = 1000; // 1 second
    this.isRunning = false;
  }

  /**
   * Start the batch processor
   */
  start() {
    if (this.isRunning) {
      console.log('[MarketDataProcessor] Already running');
      return;
    }

    console.log('[MarketDataProcessor] Starting batch processor...');
    this.isRunning = true;

    // Run immediately on start
    this.processBatch();

    // Then run every 1 second
    this.updateInterval = setInterval(() => {
      this.processBatch();
    }, this.batchUpdateIntervalMs);

    console.log('[MarketDataProcessor] Batch processor started');
  }

  /**
   * Stop the batch processor
   */
  stop() {
    if (!this.isRunning) {
      console.log('[MarketDataProcessor] Not running');
      return;
    }

    console.log('[MarketDataProcessor] Stopping batch processor...');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('[MarketDataProcessor] Batch processor stopped');
  }

  /**
   * Process a batch of market data updates
   */
  async processBatch() {
    try {
      if (!this.wsManager || !this.wsManager.marketDataCache) {
        return;
      }

      const cacheSize = this.wsManager.marketDataCache.size;
      if (cacheSize === 0) {
        return; // No data to process
      }

      const updates = [];
      const now = new Date().toISOString();

      // Collect all cache entries
      const toNumber = (value) => {
        if (value === null || value === undefined) {
          return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      for (const [, data] of this.wsManager.marketDataCache.entries()) {
        const {
          exchange,
          symbol,
          token,
          ltp,
          open,
          high,
          low,
          close,
          volume,
          bid_price,
          bid_qty,
          ask_price,
          ask_qty,
          bid,
          ask
        } = data;

        if (!exchange || !symbol) {
          continue;
        }

        const normalizedBidPrice = typeof bid_price !== 'undefined'
          ? toNumber(bid_price)
          : toNumber(bid?.price ?? bid?.ltp);

        const normalizedBidQty = typeof bid_qty !== 'undefined'
          ? toNumber(bid_qty)
          : toNumber(bid?.quantity ?? bid?.qty);

        const normalizedAskPrice = typeof ask_price !== 'undefined'
          ? toNumber(ask_price)
          : toNumber(ask?.price ?? ask?.ltp);

        const normalizedAskQty = typeof ask_qty !== 'undefined'
          ? toNumber(ask_qty)
          : toNumber(ask?.quantity ?? ask?.qty);

        updates.push({
          exchange,
          symbol,
          token: token || null,
          ltp: toNumber(ltp),
          open: toNumber(open),
          high: toNumber(high),
          low: toNumber(low),
          close: toNumber(close),
          volume: toNumber(volume),
          bid_price: normalizedBidPrice,
          bid_qty: normalizedBidQty,
          ask_price: normalizedAskPrice,
          ask_qty: normalizedAskQty,
          last_updated: now,
          data_source: 'WEBSOCKET'
        });
      }

      if (updates.length === 0) {
        return;
      }

      // Batch insert/update into database
      await this.batchUpsertMarketData(updates);

      // Log occasionally (every 10 seconds)
      const currentSecond = new Date().getSeconds();
      if (currentSecond % 10 === 0) {
        console.log(`[MarketDataProcessor] Processed ${updates.length} market data updates`);
      }

    } catch (error) {
      console.error('[MarketDataProcessor] Error processing batch:', error);
    }
  }

  /**
   * Batch upsert market data into database
   * Uses INSERT OR REPLACE for efficient upsert
   */
  async batchUpsertMarketData(updates) {
    try {
      // Begin transaction for batch insert
      await this.dbAsync.run('BEGIN TRANSACTION');

      for (const data of updates) {
        await this.dbAsync.run(`
          INSERT INTO market_data (
            exchange,
            symbol,
            token,
            ltp,
            open,
            high,
            low,
            close,
            volume,
            bid_price,
            bid_qty,
            ask_price,
            ask_qty,
            last_updated,
            data_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(exchange, symbol) DO UPDATE SET
            token = excluded.token,
            ltp = excluded.ltp,
            open = excluded.open,
            high = excluded.high,
            low = excluded.low,
            close = excluded.close,
            volume = excluded.volume,
            bid_price = excluded.bid_price,
            bid_qty = excluded.bid_qty,
            ask_price = excluded.ask_price,
            ask_qty = excluded.ask_qty,
            last_updated = excluded.last_updated,
            data_source = excluded.data_source
        `, [
          data.exchange,
          data.symbol,
          data.token,
          data.ltp,
          data.open,
          data.high,
          data.low,
          data.close,
          data.volume,
          data.bid_price,
          data.bid_qty,
          data.ask_price,
          data.ask_qty,
          data.last_updated,
          data.data_source
        ]);
      }

      await this.dbAsync.run('COMMIT');

    } catch (error) {
      await this.dbAsync.run('ROLLBACK');
      console.error('[MarketDataProcessor] Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Get market data for a specific symbol from database
   */
  async getMarketData(exchange, symbol) {
    try {
      const data = await this.dbAsync.get(`
        SELECT * FROM market_data
        WHERE exchange = ? AND symbol = ?
      `, [exchange, symbol]);

      return data || null;
    } catch (error) {
      console.error('[MarketDataProcessor] Error fetching market data:', error);
      return null;
    }
  }

  /**
   * Get market data for multiple symbols from database
   */
  async getMarketDataBulk(symbols) {
    try {
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return [];
      }

      // Build WHERE clause for multiple symbols
      const conditions = symbols.map(() => '(exchange = ? AND symbol = ?)').join(' OR ');
      const params = symbols.flatMap(s => [s.exchange, s.symbol]);

      const data = await this.dbAsync.all(`
        SELECT * FROM market_data
        WHERE ${conditions}
      `, params);

      return data;
    } catch (error) {
      console.error('[MarketDataProcessor] Error fetching bulk market data:', error);
      return [];
    }
  }

  /**
   * Get all market data from database
   */
  async getAllMarketData() {
    try {
      const data = await this.dbAsync.all(`
        SELECT * FROM market_data
        ORDER BY updated_at DESC
      `);

      return data;
    } catch (error) {
      console.error('[MarketDataProcessor] Error fetching all market data:', error);
      return [];
    }
  }

  /**
   * Clean up stale market data (older than 24 hours)
   */
  async cleanupStaleData(olderThanHours = 24) {
    try {
      const result = await this.dbAsync.run(`
        DELETE FROM market_data
        WHERE updated_at < datetime('now', '-${olderThanHours} hours')
      `);

      console.log(`[MarketDataProcessor] Cleaned up ${result.changes} stale market data entries`);
      return result.changes;
    } catch (error) {
      console.error('[MarketDataProcessor] Error cleaning up stale data:', error);
      return 0;
    }
  }

  /**
   * Get market data statistics
   */
  async getStats() {
    try {
      const stats = await this.dbAsync.get(`
        SELECT
          COUNT(*) as total_symbols,
          COUNT(DISTINCT exchange) as total_exchanges,
          MAX(updated_at) as latest_update,
          MIN(updated_at) as oldest_update
        FROM market_data
      `);

      return stats;
    } catch (error) {
      console.error('[MarketDataProcessor] Error fetching stats:', error);
      return null;
    }
  }
}

export default MarketDataProcessor;
