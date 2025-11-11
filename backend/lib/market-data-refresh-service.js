/**
 * Market Data Refresh Service
 *
 * Periodically fetches LTP (Last Traded Price) for all watchlist symbols
 * and updates the market_data table for real-time price display
 */

class MarketDataRefreshService {
  constructor(dbAsync, makeOpenAlgoRequest, alertService) {
    this.dbAsync = dbAsync;
    this.makeOpenAlgoRequest = makeOpenAlgoRequest;
    this.alertService = alertService;
    this.refreshInterval = parseInt(process.env.LTP_REFRESH_INTERVAL_MS || '30000'); // 30 seconds default
    this.isRunning = false;
    this.refreshTimer = null;
    this.errorCount = 0;
    this.maxErrors = 10;
  }

  /**
   * Start the market data refresh service
   */
  start() {
    if (this.isRunning) {
      console.log('[MarketDataRefresh] Service already running');
      return;
    }

    this.isRunning = true;
    console.log(`[MarketDataRefresh] Starting service (interval: ${this.refreshInterval}ms)`);

    // Initial refresh
    this.refreshAllMarketData().catch(error => {
      console.error('[MarketDataRefresh] Initial refresh failed:', error.message);
    });

    // Schedule periodic refresh
    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAllMarketData();
        this.errorCount = 0; // Reset error count on success
      } catch (error) {
        this.errorCount++;
        console.error(`[MarketDataRefresh] Refresh failed (${this.errorCount}/${this.maxErrors}):`, error.message);

        if (this.errorCount >= this.maxErrors) {
          console.error(`[MarketDataRefresh] Too many errors, stopping service`);
          this.stop();

          // Create alert
          this.alertService.createAlert(
            'MARKET_DATA_REFRESH_FAILED',
            'ERROR',
            `Market data refresh failed ${this.errorCount} times, service stopped`,
            { error_count: this.errorCount, last_error: error.message }
          );
        }
      }
    }, this.refreshInterval);
  }

  /**
   * Stop the market data refresh service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[MarketDataRefresh] Service not running');
      return;
    }

    this.isRunning = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    console.log('[MarketDataRefresh] Service stopped');
  }

  /**
   * Get admin instance for API calls
   */
  async getAdminInstance() {
    const adminInstance = await this.dbAsync.get('SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1');
    if (!adminInstance) {
      throw new Error('No admin instance found. Please mark one instance as primary admin');
    }
    return adminInstance;
  }

  /**
   * Refresh market data for all symbols
   */
  async refreshAllMarketData() {
    const startTime = Date.now();
    console.log(`\n[MarketDataRefresh] Starting refresh at ${new Date().toISOString()}`);

    try {
      // Get all unique symbols from watchlists with their exchange
      const symbols = await this.dbAsync.all(`
        SELECT DISTINCT
          ws.exchange,
          ws.symbol,
          ws.token
        FROM watchlist_symbols ws
        INNER JOIN watchlists w ON ws.watchlist_id = w.id
        WHERE w.is_active = 1
        ORDER BY ws.exchange, ws.symbol
      `);

      if (symbols.length === 0) {
        console.log('[MarketDataRefresh] No symbols to refresh');
        return;
      }

      console.log(`[MarketDataRefresh] Found ${symbols.length} symbols to refresh`);

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Process symbols in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const batchPromises = batch.map(symbol => this.fetchAndUpdateSymbol(symbol));

        const results = await Promise.allSettled(batchPromises);

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value) successCount++;
          } else {
            errorCount++;
            const symbol = batch[index];
            errors.push({
              symbol: symbol.symbol,
              exchange: symbol.exchange,
              error: result.reason?.message || result.reason
            });
          }
        });

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await this.sleep(500);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[MarketDataRefresh] Refresh complete in ${duration}ms:`);
      console.log(`  Success: ${successCount}`);
      console.log(`  Errors: ${errorCount}`);

      if (errors.length > 0 && errorCount < 10) {
        console.log('[MarketDataRefresh] Errors:', errors.slice(0, 5));
      }

      // Update last refresh timestamp
      await this.updateLastRefreshTimestamp();

    } catch (error) {
      console.error('[MarketDataRefresh] Refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch and update market data for a single symbol
   */
  async fetchAndUpdateSymbol(symbol) {
    try {
      // Skip if missing required data
      if (!symbol.symbol || !symbol.exchange) {
        throw new Error('Missing symbol or exchange');
      }

      // Call OpenAlgo quotes API
      const adminInstance = await this.getAdminInstance();
      const response = await this.makeOpenAlgoRequest(
        adminInstance,
        'quotes',
        'POST',
        {
          exchange: symbol.exchange,
          symbol: symbol.symbol
        }
      );

      if (response.status === 'success' && response.data) {
        const data = response.data;

        // Parse price data
        const ltp = Number(data.ltp) || null;
        const open = Number(data.open) || null;
        const high = Number(data.high) || null;
        const low = Number(data.low) || null;
        const close = Number(data.prevclose || data.close) || null;
        const volume = Number(data.volume) || 0;

        // Parse bid/ask if available
        const bidPrice = Number(data.bidprice || data.bid) || null;
        const bidQty = Number(data.bidqty || data.bid_quantity) || 0;
        const askPrice = Number(data.askprice || data.ask) || null;
        const askQty = Number(data.askqty || data.ask_quantity) || 0;

        // Upsert into market_data table
        await this.dbAsync.run(`
          INSERT INTO market_data (
            exchange, symbol, token, ltp, open, high, low, close, volume,
            bid_price, bid_qty, ask_price, ask_qty, last_updated, data_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'API_POLL')
          ON CONFLICT(exchange, symbol) DO UPDATE SET
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
            last_updated = datetime('now'),
            data_source = 'API_POLL'
        `, [
          symbol.exchange,
          symbol.symbol,
          symbol.token,
          ltp,
          open,
          high,
          low,
          close,
          volume,
          bidPrice,
          bidQty,
          askPrice,
          askQty
        ]);

        return true;
      } else {
        throw new Error(response.message || 'API returned failure status');
      }

    } catch (error) {
      console.log(`[MarketDataRefresh] Failed to fetch ${symbol.symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Update last refresh timestamp
   */
  async updateLastRefreshTimestamp() {
    try {
      await this.dbAsync.run(`
        UPDATE system_config
        SET value = datetime('now')
        WHERE key = 'last_market_data_refresh'
      `);

      // If the config doesn't exist, insert it
      if (this.dbAsync.changes === 0) {
        await this.dbAsync.run(`
          INSERT INTO system_config (key, value, updated_at)
          VALUES ('last_market_data_refresh', datetime('now'), datetime('now'))
        `);
      }
    } catch (error) {
      // Ignore if system_config table doesn't exist
    }
  }

  /**
   * Get last refresh timestamp
   */
  async getLastRefreshTimestamp() {
    try {
      const result = await this.dbAsync.get(`
        SELECT value FROM system_config WHERE key = 'last_market_data_refresh'
      `);
      return result?.value || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get market data for a specific symbol
   */
  async getMarketData(exchange, symbol) {
    try {
      return await this.dbAsync.get(`
        SELECT * FROM market_data
        WHERE exchange = ? AND symbol = ?
      `, [exchange, symbol]);
    } catch (error) {
      console.error(`[MarketDataRefresh] Failed to get market data for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get market data for multiple symbols
   */
  async getMultipleMarketData(symbols) {
    try {
      if (symbols.length === 0) {
        return [];
      }

      const placeholders = symbols.map(() => '(?, ?)').join(',');
      const params = symbols.flatMap(s => [s.exchange, s.symbol]);

      return await this.dbAsync.all(`
        SELECT * FROM market_data
        WHERE (exchange, symbol) IN (${placeholders})
      `, params);
    } catch (error) {
      console.error('[MarketDataRefresh] Failed to get multiple market data:', error.message);
      return [];
    }
  }

  /**
   * Utility: Sleep for N milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MarketDataRefreshService;
