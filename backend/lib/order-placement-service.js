/**
 * Order Placement Service V2
 * Handles order placement with OpenAlgo instances
 * Integrates QuantityResolverV2 for watchlist-driven quantity sizing
 * Supports BUY, SELL, SHORT, COVER actions with target-based positioning
 */

import QuantityResolverV2 from './quantity-resolver-v2.js';

class OrderPlacementService {
  constructor(dbAsync, rateLimiterManager, alertService, makeOpenAlgoRequest) {
    this.dbAsync = dbAsync;
    this.rateLimiters = rateLimiterManager;
    this.alertService = alertService;
    this.makeOpenAlgoRequest = makeOpenAlgoRequest;
    this.retryQueue = new Map();

    // Initialize Quantity Resolver V2
    this.quantityResolver = new QuantityResolverV2(dbAsync, makeOpenAlgoRequest);

    // Configuration
    this.maxRetries = parseInt(process.env.ORDER_RETRY_MAX_ATTEMPTS || '3');
    this.baseRetryDelay = parseInt(process.env.ORDER_RETRY_BASE_DELAY_MS || '1000');

    // Cache for strike intervals (to avoid repeated API calls)
    this.strikeIntervalCache = new Map();
  }

  /**
   * Get admin instance for API calls
   */
  async getAdminInstance() {
    const adminInstance = await this.dbAsync.get('SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1');
    if (!adminInstance) {
      throw new Error('No admin instance found. Please mark one instance as primary admin in the instance configuration');
    }
    return adminInstance;
  }

  /**
   * Get strike interval for underlying symbol
   * Caches the result to avoid repeated API calls
   */
  async getStrikeInterval(underlying) {
    const cacheKey = underlying.toUpperCase();
    if (this.strikeIntervalCache.has(cacheKey)) {
      return this.strikeIntervalCache.get(cacheKey);
    }

    // Default strike intervals for common symbols
    const defaultIntervals = {
      'NIFTY': 50,
      'BANKNIFTY': 100,
      'SENSEX': 100,
      'FINNIFTY': 25
    };

    const defaultInterval = defaultIntervals[cacheKey] || 100;

    // Try to get actual interval from OpenAlgo expiry API
    try {
      const adminInstance = await this.getAdminInstance();
      const response = await this.makeOpenAlgoRequest(
        adminInstance,
        'expiry',
        'POST',
        {
          symbol: underlying,
          instrumenttype: 'options',
          exchange: 'NFO'
        }
      );

      if (response.status === 'success') {
        const expiryList = response.expiry_list || response.data || [];
        if (expiryList.length > 0) {
          // Cache and return default interval (OpenAlgo API doesn't directly provide this)
          this.strikeIntervalCache.set(cacheKey, defaultInterval);
          return defaultInterval;
        }
      }
    } catch (error) {
      console.log(`[OrderService] Failed to fetch expiry for ${underlying}, using default interval:`, error.message);
    }

    // Cache and return default
    this.strikeIntervalCache.set(cacheKey, defaultInterval);
    return defaultInterval;
  }

  /**
   * Get nearest expiry date for underlying
   */
  async getNearestExpiry(underlying) {
    try {
      const adminInstance = await this.getAdminInstance();
      const response = await this.makeOpenAlgoRequest(
        adminInstance,
        'expiry',
        'POST',
        {
          symbol: underlying,
          instrumenttype: 'options',
          exchange: 'NFO'
        }
      );

      if (response.status === 'success') {
        const expiryList = response.expiry_list || response.data || [];
        if (expiryList.length > 0) {
          return expiryList[0]; // Return nearest expiry
        }
      }
      throw new Error('No expiries found');
    } catch (error) {
      console.log(`[OrderService] Failed to fetch expiry for ${underlying}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate options symbol based on underlying and configuration
   *
   * @param {Object} params - Parameters for options symbol generation
   * @param {string} params.underlying - Underlying symbol (e.g., NIFTY)
   * @param {string} params.option_type - CE or PE
   * @param {string} params.strike_offset - ITM3, ITM2, ITM1, ATM, OTM1, OTM2, OTM3
   * @param {string} params.exchange - Exchange (default: NFO)
   * @returns {Promise<Object>} - Resolved symbol information
   */
  async generateOptionsSymbol(params) {
    const { underlying, option_type, strike_offset, exchange = 'NFO' } = params;

    if (!underlying || !option_type || !strike_offset) {
      throw new Error('underlying, option_type, and strike_offset are required');
    }

    if (!['CE', 'PE'].includes(option_type.toUpperCase())) {
      throw new Error('option_type must be CE or PE');
    }

    const validOffsets = ['ITM3', 'ITM2', 'ITM1', 'ATM', 'OTM1', 'OTM2', 'OTM3'];
    if (!validOffsets.includes(strike_offset)) {
      throw new Error(`strike_offset must be one of: ${validOffsets.join(', ')}`);
    }

    try {
      // Get strike interval
      const strikeInt = await this.getStrikeInterval(underlying);

      // Get nearest expiry
      const expiryDate = await this.getNearestExpiry(underlying);

      // Call OpenAlgo optionsymbol API
      const adminInstance = await this.getAdminInstance();
      const response = await this.makeOpenAlgoRequest(
        adminInstance,
        'optionsymbol',
        'POST',
        {
          underlying: underlying,
          exchange: exchange,
          expiry_date: expiryDate,
          strike_int: strikeInt,
          offset: strike_offset,
          option_type: option_type.toUpperCase()
        }
      );

      if (response.status === 'success') {
        return {
          symbol: response.symbol,
          exchange: response.exchange,
          lotSize: response.lotsize,
          tickSize: response.tick_size,
          underlyingLTP: response.underlying_ltp,
          expiry: expiryDate,
          strike: response.strike || null
        };
      } else {
        throw new Error(response.message || 'Failed to resolve option symbol');
      }
    } catch (error) {
      console.error(`[OrderService] Failed to generate options symbol for ${underlying} ${option_type}:`, error.message);
      throw error;
    }
  }

  /**
   * Close all positions for a symbol (EXIT ALL)
   *
   * @param {number} instanceId - Trading instance ID
   * @param {Object} params - Exit parameters
   * @param {string} params.symbol - Symbol to exit
   * @param {string} params.exchange - Exchange
   * @param {string} params.product - Product type (MIS, CNC, NRML)
   * @returns {Promise<Object>} - Exit result
   */
  async exitAllPositions(instanceId, params) {
    const { symbol, exchange, product = 'MIS' } = params;

    if (!instanceId || !symbol || !exchange) {
      throw new Error('instanceId, symbol, and exchange are required');
    }

    const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Get current position
    const position = await this.getOpenAlgoPosition(instance, symbol, exchange, product);

    if (!position.exists || position.quantity === 0) {
      return {
        success: true,
        message: 'No positions to exit',
        positions_closed: 0
      };
    }

    // Determine action based on position direction
    const action = position.direction === 'LONG' ? 'SELL' : 'COVER';
    const positionSize = 0; // Exit to zero

    // Place exit order
    const result = await this.placeOrder(instanceId, {
      symbol: symbol,
      exchange: exchange,
      action: action,
      quantity: position.quantity,
      position_size: positionSize,
      pricetype: 'MARKET',
      product: product,
      strategy: 'EXIT_ALL'
    }, {
      order_type: 'EXIT',
      exit_reason: 'EXIT_ALL'
    });

    return {
      success: result.success,
      order_id: result.order_id,
      positions_closed: position.quantity,
      direction: position.direction,
      message: `EXIT ALL: ${action} ${position.quantity} ${symbol} to close ${position.direction} position`
    };
  }

  /**
   * Place order with options support
   * Enhanced version that handles option_type parameter
   */
  async placeOrder(instanceId, orderParams, options = {}) {
    let paramsForExecution = orderParams;
    let generatedSymbol = null;

    try {
      // Get instance details
      const instance = await this.dbAsync.get(`
        SELECT * FROM instances WHERE id = ?
      `, [instanceId]);

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      // Handle options trading
      if (orderParams.option_type) {
        // Validate option_type
        if (!['CE', 'PE'].includes(orderParams.option_type.toUpperCase())) {
          throw new Error('option_type must be CE or PE');
        }

        // Get symbol configuration to get strike offset
        let strikeOffset = 'ATM';
        if (options.watchlist_id && options.symbol_id) {
          const config = await this.dbAsync.get(`
            SELECT options_strike_offset
            FROM symbol_configs
            WHERE watchlist_id = ? AND symbol_id = ?
          `, [options.watchlist_id, options.symbol_id]);

          if (config && config.options_strike_offset) {
            strikeOffset = config.options_strike_offset;
          }
        }

        // Generate options symbol
        console.log(`[OrderService] Generating options symbol for ${orderParams.symbol} ${orderParams.option_type} with offset ${strikeOffset}`);
        generatedSymbol = await this.generateOptionsSymbol({
          underlying: orderParams.symbol,
          option_type: orderParams.option_type,
          strike_offset: strikeOffset,
          exchange: 'NFO'
        });

        // Update params to use generated options symbol
        paramsForExecution = {
          ...orderParams,
          symbol: generatedSymbol.symbol,
          exchange: 'NFO', // Options always on NFO
          product: orderParams.product || 'NRML', // Options typically use NRML
          lotSize: generatedSymbol.lotSize
        };

        console.log(`[OrderService] Options symbol generated: ${generatedSymbol.symbol}, Lot Size: ${generatedSymbol.lotSize}`);
      }

      paramsForExecution = await this.applyQuantityRules(paramsForExecution, options);

      // Pre-flight checks
      await this.performPreflightChecks(instance, paramsForExecution);

      const normalized = this.normalizeOrderParams(paramsForExecution, options);

      // Acquire rate limit token
      const rateLimitResult = await this.rateLimiters.acquireToken(
        instanceId,
        'smart_order'  // Smart order API: 2 req/sec
      );

      if (rateLimitResult.waitTime > 0) {
        console.log(`[OrderService] Rate limit wait: ${rateLimitResult.waitTime}ms for instance ${instanceId}`);
      }

      // Call OpenAlgo placesmartorder API
      const response = await this.makeOpenAlgoRequest(instance, 'placesmartorder', 'POST', normalized.payload);

      if (response.status !== 'success') {
        throw new Error(response.message || 'Order placement failed');
      }

      const responseOrderId = response.orderid || response.data?.orderid || response.data?.orderId || null;

      // Log order in database
      const orderRecord = await this.logOrder(instance.id, normalized.metadata, responseOrderId, options, response);

      // Create alert
      await this.alertService.createAlert(
        'ORDER_PLACED',
        'INFO',
        `Order placed: ${normalized.metadata.action} ${normalized.metadata.quantity} ${normalized.metadata.symbol}`,
        {
          order_id: responseOrderId,
          symbol: normalized.metadata.symbol,
          action: normalized.metadata.action,
          quantity: normalized.metadata.quantity,
          instance_id: instance.id
        },
        instance.id
      );

      console.log(`[OrderService] Order placed successfully: ${responseOrderId || 'unknown-id'}`);

      return {
        success: true,
        order_id: responseOrderId,
        order_record_id: orderRecord.id,
        rate_limit_wait: rateLimitResult.waitTime,
        generated_symbol: generatedSymbol // Include generated symbol info
      };

    } catch (error) {
      console.error(`[OrderService] Order placement failed:`, error.message);

      // Handle retryable errors
      const attemptCount = options.attempt ?? 0;
      if (this.isRetryableError(error) && attemptCount < this.maxRetries) {
        return await this.retryOrder(instanceId, orderParams, options, error);
      }

      // Non-retryable or max retries reached
      await this.handleOrderFailure(instanceId, paramsForExecution, error, options);

      throw error;
    }
  }

  async applyQuantityRules(orderParams, options = {}) {
    const params = { ...orderParams };
    params._capitalInfo = null;

    console.log(`\n========== [OrderService] applyQuantityRules START ==========`);
    console.log(`[OrderService] Input params:`, JSON.stringify(params, null, 2));
    console.log(`[OrderService] Options:`, JSON.stringify(options, null, 2));

    const skipSizing = process.env.OPENALGO_SKIP_CAPITAL_SIZING === 'true';
    const orderType = (options.order_type || params.order_type || '').toUpperCase();
    console.log(`[OrderService] skipSizing=${skipSizing}, orderType=${orderType}`);

    if (skipSizing || orderType === 'EXIT') {
      console.log(`[OrderService] ⚠️ Skipping capital calculation - skipSizing=${skipSizing}, orderType=${orderType}`);
      console.log(`========== [OrderService] applyQuantityRules END (skipped) ==========\n`);
      return params;
    }

    const watchlistId = options.watchlist_id || null;
    const symbolId = options.symbol_id || null;
    console.log(`[OrderService] watchlistId=${watchlistId}, symbolId=${symbolId}`);

    if (!watchlistId || !symbolId) {
      console.log(`[OrderService] ⚠️ Missing watchlist_id or symbol_id - returning params unchanged`);
      console.log(`========== [OrderService] applyQuantityRules END (no IDs) ==========\n`);
      return params;
    }

    const config = await this.dbAsync.get(`
      SELECT qty_type, qty_value, qty_mode
      FROM symbol_configs
      WHERE watchlist_id = ? AND symbol_id = ?
    `, [watchlistId, symbolId]);

    console.log(`[OrderService] Retrieved symbol config:`, config);

    // Check both V1 (qty_type) and V2 (qty_mode) fields for capital mode
    const isCapitalMode = (config.qty_type || '').toUpperCase() === 'CAPITAL' ||
                          (config.qty_mode || '').toUpperCase() === 'CAPITAL';

    console.log(`[OrderService] Capital mode check:`);
    console.log(`  qty_type="${config.qty_type}" (upper: "${(config.qty_type || '').toUpperCase()}")`);
    console.log(`  qty_mode="${config.qty_mode}" (upper: "${(config.qty_mode || '').toUpperCase()}")`);
    console.log(`  isCapitalMode=${isCapitalMode}`);

    if (!config) {
      console.log(`[OrderService] ⚠️ No symbol config found for watchlist_id=${watchlistId}, symbol_id=${symbolId}`);
      console.log(`========== [OrderService] applyQuantityRules END (no config) ==========\n`);
      return params;
    }

    if (!isCapitalMode) {
      console.log(`[OrderService] Skipping capital calculation - not capital mode`);
      console.log(`  qty_type=${config.qty_type}, qty_mode=${config.qty_mode}`);
      console.log(`========== [OrderService] applyQuantityRules END (not capital) ==========\n`);
      return params;
    }

    console.log(`[OrderService] ✅ CAPITAL MODE DETECTED - proceeding with calculation`);

    const capital = Number(config.qty_value);
    if (!Number.isFinite(capital) || capital <= 0) {
      throw new Error('Capital-based quantity requires a positive qty_value');
    }

    console.log(`[OrderService] Capital mode detected for ${params.symbol}:`);
    console.log(`  Capital: ₹${capital}`);
    console.log(`  Current quantity: ${params.quantity}`);
    console.log(`  Price candidates being collected...`);

    const priceCandidates = [];

    // Try to get market data from database (WebSocket cached data)
    const marketData = await this.dbAsync.get(`
      SELECT ltp FROM market_data
      WHERE exchange = ? AND symbol = ?
    `, [params.exchange, params.symbol]);

    console.log(`[OrderService] 📊 WebSocket data query:`, marketData);

    const numericLtp = Number(marketData?.ltp);
    if (Number.isFinite(numericLtp) && numericLtp > 0) {
      console.log(`[OrderService] ✅ Using WebSocket LTP: ${numericLtp}`);
      priceCandidates.push({ source: 'LTP', price: numericLtp });
    } else {
      console.log(`[OrderService] ⚠️ WebSocket data unavailable for ${params.symbol} ${params.exchange}, fetching via REST API...`);
      // Fallback: Get LTP from OpenAlgo quotes API if WebSocket data unavailable
      try {
        const adminInstance = await this.dbAsync.get('SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1');
        console.log(`[OrderService] 🏢 Admin instance found:`, adminInstance?.name, adminInstance?.host_url);

        if (!adminInstance) {
          console.log(`[OrderService] ❌ No admin instance found - cannot fetch LTP`);
        } else {
          console.log(`[OrderService] 🔄 Making REST API call to quotes endpoint...`);
          console.log(`[OrderService] 📤 Request: exchange=${params.exchange}, symbol=${params.symbol}`);

          const quotesResponse = await this.makeOpenAlgoRequest(
            adminInstance,
            'quotes',
            'POST',
            {
              exchange: params.exchange,
              symbol: params.symbol
            }
          );

          console.log(`[OrderService] 📥 REST API response:`, JSON.stringify(quotesResponse, null, 2));

          if (quotesResponse.status === 'success' && quotesResponse.data && quotesResponse.data.ltp) {
            const restLtp = Number(quotesResponse.data.ltp);
            if (Number.isFinite(restLtp) && restLtp > 0) {
              console.log(`[OrderService] ✅ Fetched LTP via REST API: ${restLtp}`);
              priceCandidates.push({ source: 'REST_API', price: restLtp });
            } else {
              console.log(`[OrderService] ⚠️ REST API returned invalid LTP: ${restLtp}`);
            }
          } else {
            console.log(`[OrderService] ⚠️ REST API response missing ltp field`);
          }
        }
      } catch (error) {
        console.log(`[OrderService] ❌ Failed to fetch LTP via REST API:`, error.message);
        console.log(`[OrderService] Error stack:`, error.stack);
      }
    }

    const normalizedPrice = Number(params.price);
    if (Number.isFinite(normalizedPrice) && normalizedPrice > 0) {
      priceCandidates.push({ source: 'ORDER_PRICE', price: normalizedPrice });
    }

    const limitPrice = Number(params.limit_price ?? params.limitPrice);
    if (Number.isFinite(limitPrice) && limitPrice > 0) {
      priceCandidates.push({ source: 'LIMIT_PRICE', price: limitPrice });
    }

    const referencePrice = Number(params.reference_price ?? params.referencePrice);
    if (Number.isFinite(referencePrice) && referencePrice > 0) {
      priceCandidates.push({ source: 'REFERENCE_PRICE', price: referencePrice });
    }

    console.log(`[OrderService] All price candidates:`, JSON.stringify(priceCandidates, null, 2));

    const priceCandidate = priceCandidates.find(candidate => candidate.price > 0);
    const price = priceCandidate?.price;
    const priceSource = priceCandidate?.source || null;

    console.log(`[OrderService] Selected price: ${price} from ${priceSource}, Capital: ${capital}`);

    if (!price || !Number.isFinite(price) || price <= 0) {
      console.log(`[OrderService] ❌ Unable to determine price for capital-based quantity calculation`);
      console.log(`  price=${price}, isFinite=${Number.isFinite(price)}, priceCandidate=`, priceCandidate);
      throw new Error('Unable to determine price for capital-based quantity calculation');
    }

    const computedQty = Math.max(1, Math.floor(capital / price));
    console.log(`[OrderService] 💰 Capital calculation complete:`);
    console.log(`  Formula: capital / price = ${capital} / ${price}`);
    console.log(`  Computed quantity: ${computedQty} (min 1, floored)`);
    console.log(`  Old quantity: ${params.quantity} → New quantity: ${computedQty}`);

    if (!Number.isFinite(computedQty) || computedQty <= 0) {
      console.log(`[OrderService] ❌ Invalid computed quantity: ${computedQty}`);
      throw new Error(`Capital ${capital} insufficient for calculated price ${price}`);
    }

    console.log(`[OrderService] ✏️ Updating params.quantity: ${params.quantity} → ${computedQty}`);
    params.quantity = computedQty;
    params.position_size = params.position_size ?? computedQty;

    // Store capital info separately (not in params)
    params._capitalInfo = {
      capital,
      price,
      priceSource,
      computedQty
    };

    console.log(`[OrderService] Final params:`, JSON.stringify(params, null, 2));
    console.log(`========== [OrderService] applyQuantityRules END (success) ==========\n`);

    return params;
  }

  normalizeOrderParams(orderParams, orderOptions = {}) {
    if (!orderParams) {
      throw new Error('Order parameters are required');
    }

    const product = (orderParams.product || 'MIS').toUpperCase();
    const pricetype = (orderParams.pricetype || orderParams.price_type || 'MARKET').toUpperCase();
    const action = (orderParams.action || '').toUpperCase();
    const quantity = Number.parseInt(orderParams.quantity, 10);
    const positionSize = Number.parseInt(orderParams.position_size ?? orderParams.quantity, 10);
    const rawPrice = pricetype === 'LIMIT'
      ? Number(orderParams.price ?? orderParams.limit_price ?? orderParams.limitPrice ?? 0)
      : Number(orderParams.price ?? 0);
    const price = Number.isFinite(rawPrice) ? rawPrice : 0;
    const triggerPrice = Number(orderParams.trigger_price ?? orderParams.stop_price ?? 0);
    const disclosedQuantity = Number(orderParams.disclosed_quantity ?? 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive integer');
    }

    if (!action) {
      throw new Error('Order action is required');
    }

    // Store capital info before creating payload
    const capitalInfo = orderParams._capitalInfo;

    const payload = {
      strategy: orderParams.strategy || 'Watchlist',
      exchange: orderParams.exchange,
      symbol: orderParams.symbol,
      action,
      product,
      pricetype,
      quantity: quantity.toString(),
      position_size: (Number.isFinite(positionSize) ? positionSize : quantity).toString(),
      price: price.toString(),
      trigger_price: (Number.isFinite(triggerPrice) ? triggerPrice : 0).toString(),
      disclosed_quantity: (Number.isFinite(disclosedQuantity) ? disclosedQuantity : 0).toString()
    };

    return {
      payload,
      metadata: {
        exchange: orderParams.exchange,
        symbol: orderParams.symbol,
        action,
        quantity,
        order_type: (orderOptions.order_type || orderParams.order_type || 'ENTRY').toUpperCase(),
        price,
        product_type: product,
        pricetype,
        trigger_price: Number.isFinite(triggerPrice) ? triggerPrice : 0,
        capital_exposure: capitalInfo?.capital ?? null,
        capital_price: capitalInfo?.price ?? null,
        capital_price_source: capitalInfo?.priceSource ?? null
      }
    };
  }

  /**
   * Place order with full flow (pre-flight, rate limit, API call, logging)
   */
  async placeOrder(instanceId, orderParams, options = {}) {
    let paramsForExecution = orderParams;
    try {
      // Get instance details
      const instance = await this.dbAsync.get(`
        SELECT * FROM instances WHERE id = ?
      `, [instanceId]);

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      paramsForExecution = await this.applyQuantityRules(orderParams, options);

      // Pre-flight checks
      await this.performPreflightChecks(instance, paramsForExecution);

      const normalized = this.normalizeOrderParams(paramsForExecution, options);

      // Acquire rate limit token
      const rateLimitResult = await this.rateLimiters.acquireToken(
        instanceId,
        'smart_order'  // Smart order API: 2 req/sec
      );

      if (rateLimitResult.waitTime > 0) {
        console.log(`[OrderService] Rate limit wait: ${rateLimitResult.waitTime}ms for instance ${instanceId}`);
      }

      // Call OpenAlgo placesmartorder API
      const response = await this.makeOpenAlgoRequest(instance, 'placesmartorder', 'POST', normalized.payload);

      if (response.status !== 'success') {
        throw new Error(response.message || 'Order placement failed');
      }

      const responseOrderId = response.orderid || response.data?.orderid || response.data?.orderId || null;

      // Log order in database
      const orderRecord = await this.logOrder(instance.id, normalized.metadata, responseOrderId, options, response);

      // Create alert
      await this.alertService.createAlert(
        'ORDER_PLACED',
        'INFO',
        `Order placed: ${normalized.metadata.action} ${normalized.metadata.quantity} ${normalized.metadata.symbol}`,
        {
          order_id: responseOrderId,
          symbol: normalized.metadata.symbol,
          action: normalized.metadata.action,
          quantity: normalized.metadata.quantity,
          instance_id: instance.id
        },
        instance.id
      );

      console.log(`[OrderService] Order placed successfully: ${responseOrderId || 'unknown-id'}`);

      return {
        success: true,
        order_id: responseOrderId,
        order_record_id: orderRecord.id,
        rate_limit_wait: rateLimitResult.waitTime
      };

    } catch (error) {
      console.error(`[OrderService] Order placement failed:`, error.message);

      // Handle retryable errors
      const attemptCount = options.attempt ?? 0;
      if (this.isRetryableError(error) && attemptCount < this.maxRetries) {
        return await this.retryOrder(instanceId, orderParams, options, error);
      }

      // Non-retryable or max retries reached
      await this.handleOrderFailure(instanceId, paramsForExecution, error, options);

      throw error;
    }
  }

  /**
   * Fetch current position from OpenAlgo instance
   */
  async getOpenAlgoPosition(instance, symbol, exchange, product = 'MIS') {
    try {
      const response = await this.makeOpenAlgoRequest(instance, 'openposition', 'POST', {
        strategy: 'Watchlist',
        symbol,
        exchange,
        product
      });

      if (response.status === 'success' && response.data) {
        const qty = parseInt(response.data.quantity) || 0;
        const direction = qty > 0 ? 'LONG' : qty < 0 ? 'SHORT' : 'NONE';
        return {
          exists: true,
          quantity: Math.abs(qty),
          direction,
          rawQuantity: qty
        };
      }

      return { exists: false, quantity: 0, direction: 'NONE', rawQuantity: 0 };
    } catch (error) {
      console.log(`[OrderService] Failed to fetch position for ${symbol}:`, error.message);
      return { exists: false, quantity: 0, direction: 'NONE', rawQuantity: 0 };
    }
  }

  /**
   * Resolve quantity and calculate target using QuantityResolverV2
   * Then place the order with target-based positioning
   *
   * @param {Object} instance - OpenAlgo instance
   * @param {Object} wlConfig - Watchlist symbol configuration
   * @param {number} currentPos - Current position (signed)
   * @param {string} action - BUY|SELL|SHORT|COVER
   * @param {Object} orderOptions - Additional options
   * @returns {Object} Order result
   */
  async resolveAndPlaceOrderV2(instance, wlConfig, currentPos, action, orderOptions = {}) {
    try {
      // Use QuantityResolverV2 to resolve quantity and target
      const resolution = await this.quantityResolver.resolve(
        instance,
        wlConfig,
        currentPos,
        action
      );

      console.log(`[OrderService] V2 Resolution for ${wlConfig.symbol}:`);
      console.log(`  Action: ${action}, Current Pos: ${currentPos}`);
      console.log(`  LTP: ${resolution.ltp} (${resolution.ltpSource})`);
      console.log(`  Resolved Qty: ${resolution.resolvedQty}`);
      console.log(`  Target Pos: ${resolution.targetPos}`);
      console.log(`  Qty Mode: ${resolution.qtyMode}`);

      // If target equals current position, it's a no-op
      if (resolution.targetPos === currentPos) {
        console.log(`[OrderService] No-op: target (${resolution.targetPos}) equals current (${currentPos})`);
        return {
          success: true,
          order_id: null,
          no_action: true,
          target_pos: resolution.targetPos,
          current_pos: currentPos
        };
      }

      // Determine quantity and position_size based on action
      let quantity, positionSize;

      // For SELL/COVER (exit actions), send current position as position_size
      if (action.toUpperCase() === 'SELL' || action.toUpperCase() === 'COVER') {
        // Exit actions: quantity = current position, position_size = current position (signed)
        quantity = Math.abs(currentPos);
        positionSize = currentPos;  // Signed: +100 for LONG, -100 for SHORT

        console.log(`[OrderService] Exit order: qty=${quantity}, pos_size=${positionSize} (close to 0)`);
      } else {
        // For BUY/SHORT (entry actions), use resolved quantity and target position
        quantity = resolution.resolvedQty;
        positionSize = resolution.targetPos;

        console.log(`[OrderService] Entry order: qty=${quantity}, pos_size=${positionSize}`);
      }

      // Place order
      return await this.placeOrder(instance.id, {
        symbol: wlConfig.symbol,
        exchange: wlConfig.exchange,
        action: action.toUpperCase(),
        quantity: quantity,
        position_size: positionSize,  // Target position for BUY/SHORT, current position for SELL/COVER
        pricetype: wlConfig.order_type || 'MARKET',
        product: wlConfig.product_type || 'MIS',
        strategy: orderOptions.strategy || 'WatchlistV2'
      }, {
        watchlist_id: wlConfig.watchlist_id,
        symbol_id: wlConfig.symbol_id,
        position_id: orderOptions.position_id,
        order_type: orderOptions.order_type || 'ENTRY',
        attempt: orderOptions.attempt || 0,
        // Pass resolution info for logging
        _resolution: resolution
      });

    } catch (error) {
      console.error(`[OrderService] V2 resolution failed:`, error.message);
      throw error;
    }
  }

  /**
   * Place entry order using QuantityResolverV2
   * Supports BUY and SHORT actions with target-based positioning
   */
  async placeEntryOrder(instance, position, symbolConfig) {
    // Determine action based on direction
    const action = position.direction === 'LONG' ? 'BUY' : 'SHORT';

    // Fetch watchlist config
    const wlConfig = await this.dbAsync.get(`
      SELECT
        sc.*,
        ws.symbol,
        ws.exchange,
        ws.id as symbol_id,
        ws.watchlist_id
      FROM symbol_configs sc
      JOIN watchlist_symbols ws ON ws.id = sc.symbol_id
      WHERE ws.id = ?
    `, [symbolConfig.symbol_id || position.symbol_id]);

    if (!wlConfig) {
      throw new Error(`Watchlist config not found for symbol ${position.symbol}`);
    }

    // Get current position from OpenAlgo
    const currentPosition = await this.getOpenAlgoPosition(
      instance,
      position.symbol,
      position.exchange,
      position.product_type || 'MIS'
    );

    console.log(`[OrderService] Entry order: ${action} ${position.symbol}, current: ${currentPosition.rawQuantity}`);

    // Use V2 resolver for quantity and target
    return await this.resolveAndPlaceOrderV2(
      instance,
      wlConfig,
      currentPosition.rawQuantity,
      action,
      {
        position_id: position.id,
        order_type: 'ENTRY',
        strategy: 'Watchlist'
      }
    );
  }

  /**
   * Place exit order using QuantityResolverV2
   * Supports SELL and COVER actions (both target position 0)
   */
  async placeExitOrder(instance, position, exitReason) {
    // Determine action based on direction
    const action = position.direction === 'LONG' ? 'SELL' : 'COVER';

    // Fetch watchlist config
    const wlConfig = await this.dbAsync.get(`
      SELECT
        sc.*,
        ws.symbol,
        ws.exchange,
        ws.id as symbol_id,
        ws.watchlist_id
      FROM symbol_configs sc
      JOIN watchlist_symbols ws ON ws.id = sc.symbol_id
      WHERE ws.id = ?
    `, [symbolConfig.symbol_id || position.symbol_id]);

    if (!wlConfig) {
      throw new Error(`Watchlist config not found for symbol ${position.symbol}`);
    }

    // Get current position from OpenAlgo
    const currentPosition = await this.getOpenAlgoPosition(
      instance,
      position.symbol,
      position.exchange,
      position.product_type || 'MIS'
    );

    console.log(`[OrderService] Exit order: ${action} ${position.symbol}, current: ${currentPosition.rawQuantity}`);

    // Use V2 resolver for quantity and target (exit always targets 0)
    return await this.resolveAndPlaceOrderV2(
      instance,
      wlConfig,
      currentPosition.rawQuantity,
      action,
      {
        position_id: position.id,
        order_type: 'EXIT',
        exit_reason: exitReason,
        strategy: 'Watchlist'
      }
    );
  }

  /**
   * Perform pre-flight checks before placing order
   */
  async performPreflightChecks(instance, orderParams) {
    // Check 1: Instance is active
    if (!instance.is_active) {
      throw new Error('Instance is not active');
    }

    // Check 2: Order placement enabled
    if (!instance.order_placement_enabled) {
      throw new Error('Order placement is disabled for this instance');
    }

    // Check 3: Instance health
    if (instance.health_status === 'error') {
      throw new Error('Instance health check failed');
    }

    // Check 4: Required parameters
    if (!orderParams.symbol || !orderParams.action || !orderParams.exchange || !orderParams.quantity) {
      throw new Error('Missing required order parameters');
    }

    // Check 5: Valid action (UI supports SHORT/COVER, translate to BUY/SELL)
    const action = (orderParams.action || '').toUpperCase();
    const validActions = ['BUY', 'SELL', 'SHORT', 'COVER'];
    if (!validActions.includes(action)) {
      throw new Error('Invalid order action. Must be BUY, SELL, SHORT, or COVER');
    }

    // Check 6: Valid quantity
    if (parseInt(orderParams.quantity) <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    return true;
  }

  /**
   * Log order to database
   */
  async logOrder(instanceId, metadata, orderId, options = {}, response = null) {
    const orderType = (options.order_type || metadata.order_type || 'ENTRY').toUpperCase();
    const exchange = metadata.exchange;
    const symbol = metadata.symbol;
    const action = metadata.action;
    const quantity = metadata.quantity;
    const productType = metadata.product_type;
    const priceType = metadata.pricetype;
    const price = metadata.price ?? 0;
    const triggerPrice = metadata.trigger_price ?? 0;

    const result = await this.dbAsync.run(`
      INSERT INTO watchlist_orders (
        instance_id,
        watchlist_id,
        symbol_id,
        position_id,
        order_id,
        orderid,
        exchange,
        symbol,
        action,
        quantity,
        order_type,
        price,
        product_type,
        pricetype,
        status,
        trigger_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      instanceId,
      options.watchlist_id || null,
      options.symbol_id || null,
      options.position_id || null,
      orderId,
      orderId,
      exchange,
      symbol,
      action,
      quantity,
      orderType,
      price,
      productType,
      priceType,
      'pending',
      triggerPrice
    ]);

    if (response) {
      await this.dbAsync.run(`
        UPDATE watchlist_orders
        SET response_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [JSON.stringify(response), result.lastID]);
    }

    return {
      id: result.lastID,
      order_id: orderId
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableMessages = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'NETWORK',
      'timeout',
      'rate limit',
      'too many requests'
    ];

    const errorMessage = error.message.toLowerCase();

    return retryableMessages.some(msg => errorMessage.includes(msg.toLowerCase()));
  }

  /**
   * Retry order with exponential backoff
   */
  async retryOrder(instanceId, orderParams, options, originalError) {
    const attempt = (options.attempt || 0) + 1;
    const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);

    console.log(`[OrderService] Retrying order (attempt ${attempt}/${this.maxRetries}) after ${delay}ms`);

    // Wait with exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry
    return await this.placeOrder(instanceId, orderParams, {
      ...options,
      attempt
    });
  }

  /**
   * Handle order failure (max retries or non-retryable error)
   */
  async handleOrderFailure(instanceId, orderParams, error, options) {
    // Log failure
    console.error(`[OrderService] Order failed permanently:`, error.message);

    // Create error alert
    await this.alertService.createAlert(
      'ORDER_FAILED',
      'ERROR',
      `Order placement failed: ${error.message}`,
      {
        symbol: orderParams.symbol,
        action: orderParams.action,
        quantity: orderParams.quantity,
        instance_id: instanceId,
        error: error.message,
        attempts: options.attempt || 0
      },
      instanceId
    );

    // If this was for a position, mark position as FAILED
    if (options.position_id) {
      try {
        await this.dbAsync.run(`
          UPDATE watchlist_positions
          SET status = 'FAILED', exit_reason = ?
          WHERE id = ?
        `, [`ORDER_FAILED: ${error.message}`, options.position_id]);
      } catch (dbError) {
        console.error(`[OrderService] Failed to update position status:`, dbError);
      }
    }
  }

  /**
   * Broadcast order to all instances assigned to a watchlist
   */
  async broadcastOrderToWatchlist(watchlistId, symbolId, orderParams, options = {}) {
    if (!watchlistId) {
      throw new Error('watchlistId is required for broadcast orders');
    }

    const instances = await this.dbAsync.all(`
      SELECT i.*
      FROM watchlist_instances wi
      JOIN instances i ON i.id = wi.instance_id
      WHERE wi.watchlist_id = ?
        AND i.is_active = 1
        AND i.order_placement_enabled = 1
    `, [watchlistId]);

    if (!instances || instances.length === 0) {
      throw new Error('No active instances with order placement enabled for this watchlist');
    }

    const results = [];

    for (const instance of instances) {
      try {
        const result = await this.placeOrder(instance.id, orderParams, {
          ...options,
          watchlist_id: watchlistId,
          symbol_id: symbolId,
          order_type: options.order_type || options.order_side || 'ENTRY'
        });

        results.push({
          instance_id: instance.id,
          success: true,
          order_id: result.order_id,
          order_record_id: result.order_record_id
        });
      } catch (error) {
        console.error(`[OrderService] Broadcast order failed for instance ${instance.id}:`, error.message);
        results.push({
          instance_id: instance.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Cancel order
   */
  async cancelOrder(instanceId, orderId) {
    const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Acquire rate limit token
    await this.rateLimiters.acquireToken(instanceId, 'order_api');

    // Call OpenAlgo cancelorder API
    const response = await this.makeOpenAlgoRequest(instance, 'cancelorder', 'POST', {
      orderid: orderId
    });

    if (response.status !== 'success') {
      throw new Error(response.message || 'Order cancellation failed');
    }

    // Update order in database
    await this.dbAsync.run(`
      UPDATE watchlist_orders
      SET
        status = 'cancelled',
        cancelled_at = datetime('now'),
        cancelled_by = 'SYSTEM'
      WHERE order_id = ?
    `, [orderId]);

    // Create alert
    await this.alertService.createAlert(
      'ORDER_CANCELLED',
      'WARNING',
      `Order cancelled: ${orderId}`,
      { order_id: orderId, instance_id: instanceId },
      instanceId
    );

    console.log(`[OrderService] Order cancelled: ${orderId}`);

    return { success: true, order_id: orderId };
  }

  /**
   * Cancel all orders for instance
   */
  async cancelAllOrders(instanceId) {
    const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Acquire rate limit token
    await this.rateLimiters.acquireToken(instanceId, 'order_api');

    // Call OpenAlgo cancelallorder API
    const response = await this.makeOpenAlgoRequest(instance, 'cancelallorder', 'POST', {});

    if (response.status !== 'success') {
      throw new Error(response.message || 'Cancel all orders failed');
    }

    // Update all pending orders in database
    const result = await this.dbAsync.run(`
      UPDATE watchlist_orders
      SET
        status = 'cancelled',
        cancelled_at = datetime('now'),
        cancelled_by = 'SYSTEM'
      WHERE instance_id = ? AND status IN ('pending', 'open')
    `, [instanceId]);

    // Create alert
    await this.alertService.createAlert(
      'ALL_ORDERS_CANCELLED',
      'WARNING',
      `All orders cancelled for instance ${instance.name}`,
      { instance_id: instanceId, cancelled_count: result.changes },
      instanceId
    );

    console.log(`[OrderService] All orders cancelled for instance ${instanceId}: ${result.changes} orders`);

    return {
      success: true,
      cancelled_count: result.changes
    };
  }

  /**
   * Get order details from OpenAlgo
   */
  async getOrderDetails(instanceId, orderId) {
    const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Acquire rate limit token
    await this.rateLimiters.acquireToken(instanceId, 'general_api');

    // Call OpenAlgo orderbook API
    const response = await this.makeOpenAlgoRequest(instance, 'orderbook', 'POST', {});

    if (response.status !== 'success') {
      throw new Error(response.message || 'Failed to fetch order book');
    }

    // Find specific order
    const order = response.data.find(o => o.orderid === orderId);

    if (!order) {
      return null;
    }

    return {
      order_id: order.orderid,
      symbol: order.symbol,
      status: order.status,
      filled_quantity: order.fillshares,
      average_price: order.avgprice,
      order_time: order.ordertime,
      exchange_time: order.exchtime
    };
  }

  /**
   * Get all orders for instance
   */
  async getOrderBook(instanceId) {
    const instance = await this.dbAsync.get('SELECT * FROM instances WHERE id = ?', [instanceId]);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Acquire rate limit token
    await this.rateLimiters.acquireToken(instanceId, 'general_api');

    // Call OpenAlgo orderbook API
    const response = await this.makeOpenAlgoRequest(instance, 'orderbook', 'POST', {});

    if (response.status !== 'success') {
      throw new Error(response.message || 'Failed to fetch order book');
    }

    // Handle different response formats
    const data = response.data;

    // If it's already an array, return it
    if (Array.isArray(data)) {
      return data;
    }

    // If it's an object with 'orders' property, extract the array
    if (data && typeof data === 'object' && Array.isArray(data.orders)) {
      return data.orders;
    }

    // Log the unexpected format and return empty array
    console.warn(`[OrderPlacementService] getOrderBook returned unexpected format for instance ${instanceId}:`, typeof data, data);
    return [];
  }
}

export default OrderPlacementService;
