/**
 * Options Trading Service
 *
 * Provides a higher-level abstraction for options trading operations
 * using OpenAlgo's dedicated options APIs
 */

class OptionsTradingService {
  constructor(dbAsync, makeOpenAlgoRequest) {
    this.dbAsync = dbAsync;
    this.makeOpenAlgoRequest = makeOpenAlgoRequest;
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
   * Get trading instance by ID
   */
  async getTradingInstance(instanceId) {
    return await this.dbAsync.get('SELECT * FROM instances WHERE id = ? AND is_active = 1', [instanceId]);
  }

  /**
   * Determine exchange for underlying symbol
   * Options always use NFO exchange
   */
  getExchangeForUnderlying(underlying) {
    return 'NFO';
  }

  /**
   * Fetch available expiries for an underlying
   *
   * @param {string} underlying - NIFTY, BANKNIFTY, etc.
   * @returns {Promise<Array<string>>} - Array of expiry dates
   */
  async getExpiries(underlying) {
    const adminInstance = await this.getAdminInstance();

    if (!adminInstance) {
      throw new Error('No admin instance available');
    }

    // For OpenAlgo expiry API, NIFTY and BANKNIFTY use NFO exchange
    const getExchangeForUnderlying = (symbol) => {
      if (symbol === 'NIFTY' || symbol === 'BANKNIFTY') {
        return 'NFO';
      }
      return 'NFO';
    };

    const getInstrumentType = (symbol) => {
      if (symbol === 'NIFTY' || symbol === 'BANKNIFTY') {
        return 'options';
      }
      return 'options';
    };

    const exchange = getExchangeForUnderlying(underlying);

    const payload = {
      symbol: underlying,
      instrumenttype: getInstrumentType(underlying),
      exchange: exchange
    };

    const response = await this.makeOpenAlgoRequest(
      adminInstance,
      'expiry',
      'POST',
      payload
    );

    if (response.status === 'success') {
      const expiryList = response.expiry_list || response.data || [];
      if (expiryList.length === 0) {
        throw new Error('No expiries available from OpenAlgo for underlying: ' + underlying);
      }
      return expiryList;
    } else {
      throw new Error(response.message || 'Failed to fetch expiries');
    }
  }

  /**
   * Resolve option symbol using offset from ATM
   *
   * @param {Object} params - Resolution parameters
   * @param {string} params.underlying - Underlying symbol
   * @param {string} params.expiry_date - Expiry date (e.g., '28NOV24')
   * @param {number} params.strike_int - Strike interval (50 for NIFTY, 100 for BANKNIFTY)
   * @param {string} params.offset - Offset from ATM (ATM, ITM1, ITM2, OTM1, OTM2)
   * @param {string} params.option_type - CE or PE
   * @returns {Promise<Object>} - Resolved symbol information
   */
  async resolveOptionSymbol(params) {
    const { underlying, expiry_date, strike_int, offset, option_type } = params;

    if (!underlying || !expiry_date || !strike_int || !offset || !option_type) {
      throw new Error('All parameters are required: underlying, expiry_date, strike_int, offset, option_type');
    }

    const adminInstance = await this.getAdminInstance();

    if (!adminInstance) {
      throw new Error('No admin instance available');
    }

    const exchange = params.exchange || this.getExchangeForUnderlying(underlying);

    const response = await this.makeOpenAlgoRequest(
      adminInstance,
      'optionsymbol',
      'POST',
      {
        underlying,
        exchange,
        expiry_date,
        strike_int,
        offset,
        option_type
      }
    );

    if (response.status === 'success') {
      return {
        symbol: response.symbol,
        exchange: response.exchange,
        lotsize: response.lotsize,
        tick_size: response.tick_size,
        underlying_ltp: response.underlying_ltp
      };
    } else {
      throw new Error(response.message || 'Failed to resolve option symbol');
    }
  }

  /**
   * Place options order using placesmartorder (position-aware)
   *
   * @param {number} instanceId - Trading instance ID
   * @param {Object} params - Order parameters
   * @param {string} params.underlying - Underlying symbol
   * @param {string} params.expiry_date - Expiry date
   * @param {number} params.strike_int - Strike interval
   * @param {string} params.offset - Offset from ATM
   * @param {string} params.option_type - CE or PE
   * @param {string} params.action - BUY or SELL
   * @param {number} params.quantity - Quantity in lots
   * @param {string} params.pricetype - MARKET or LIMIT
   * @param {string} params.product - MIS or NRML
   * @param {number} params.price - Price for LIMIT orders
   * @param {number} params.position_size - Optional target position size
   * @returns {Promise<Object>} - Order placement result
   */
  async placeOptionsOrder(instanceId, params) {
    const {
      underlying,
      expiry_date,
      strike_int,
      offset,
      option_type,
      action,
      quantity,
      pricetype = 'MARKET',
      product = 'MIS',
      price,
      position_size
    } = params;

    if (!instanceId || !underlying || !expiry_date || !strike_int || !offset || !option_type || !action || !quantity) {
      throw new Error('Missing required parameters for options order');
    }

    const instance = await this.getTradingInstance(instanceId);

    if (!instance) {
      throw new Error('Trading instance not found');
    }

    // Step 1: Resolve the option symbol first (for placesmartorder)
    const adminInstance = await this.getAdminInstance();

    if (!adminInstance) {
      throw new Error('No admin instance available for symbol resolution');
    }

    const symbolResponse = await this.makeOpenAlgoRequest(
      adminInstance,
      'optionsymbol',
      'POST',
      {
        underlying,
        exchange: 'NFO',
        expiry_date,
        strike_int,
        offset,
        option_type
      }
    );

    if (symbolResponse.status !== 'success') {
      throw new Error(symbolResponse.message || 'Failed to resolve option symbol');
    }

    const resolvedSymbol = symbolResponse.symbol;
    const lotSize = symbolResponse.lotsize;

    // Step 2: Calculate position_size
    const targetPositionSize = position_size !== undefined
      ? position_size
      : (action === 'BUY' ? quantity : -quantity);

    // Step 3: Use placesmartorder (position-aware API)
    const response = await this.makeOpenAlgoRequest(
      instance,
      'placesmartorder',
      'POST',
      {
        apikey: instance.api_key,
        strategy: 'Options Scalper',
        symbol: resolvedSymbol,
        exchange: 'NFO',
        action: action,
        product: product,
        pricetype: pricetype,
        quantity: quantity * lotSize,
        position_size: targetPositionSize * lotSize,
        price: pricetype === 'LIMIT' ? price : 0
      }
    );

    if (response.status === 'success') {
      return {
        orderid: response.orderid,
        symbol: resolvedSymbol,
        exchange: 'NFO',
        lotsize: lotSize,
        position_size: targetPositionSize,
        message: `${action} order placed successfully for ${resolvedSymbol} (position-aware)`
      };
    } else {
      throw new Error(response.message || 'Failed to place position-aware options order');
    }
  }

  /**
   * Define strategy legs for basket orders
   */
  getStrategyLegs(strategy, params) {
    const { offset } = params;

    if (strategy === 'STRADDLE') {
      // Straddle: Buy both CE and PE at ATM
      return [
        { option_type: 'CE', action: 'BUY', offset: 'ATM' },
        { option_type: 'PE', action: 'BUY', offset: 'ATM' }
      ];
    } else if (strategy === 'STRANGLE') {
      // Strangle: Buy both CE and PE at OTM (same offset)
      return [
        { option_type: 'CE', action: 'BUY', offset: offset || 'OTM1' },
        { option_type: 'PE', action: 'BUY', offset: offset || 'OTM1' }
      ];
    } else {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Place basket order (straddle/strangle)
   *
   * @param {number} instanceId - Trading instance ID
   * @param {string} strategy - STRADDLE or STRANGLE
   * @param {Object} params - Strategy parameters
   * @returns {Promise<Object>} - Basket order result
   */
  async placeBasketOrder(instanceId, strategy, params) {
    const {
      underlying,
      expiry_date,
      strike_int,
      offset,
      quantity,
      pricetype = 'MARKET',
      product = 'MIS',
      price
    } = params;

    if (!instanceId || !strategy || !underlying || !expiry_date || !strike_int || !offset || !quantity) {
      throw new Error('Missing required parameters for basket order');
    }

    const validStrategies = ['STRADDLE', 'STRANGLE'];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`Strategy must be one of: ${validStrategies.join(', ')}`);
    }

    const instance = await this.getTradingInstance(instanceId);

    if (!instance) {
      throw new Error('Trading instance not found');
    }

    const exchange = this.getExchangeForUnderlying(underlying);
    const legs = this.getStrategyLegs(strategy, { offset });

    // Place orders for each leg using placesmartorder (position-aware)
    const orderResults = [];
    const errors = [];

    // Get admin instance for symbol resolution
    const adminInstance = await this.getAdminInstance();

    if (!adminInstance) {
      throw new Error('No admin instance available');
    }

    for (const leg of legs) {
      try {
        // First resolve the symbol for this leg
        const symbolResponse = await this.makeOpenAlgoRequest(
          adminInstance,
          'optionsymbol',
          'POST',
          {
            underlying,
            exchange: 'NFO',
            expiry_date,
            strike_int,
            offset: leg.offset,
            option_type: leg.option_type
          }
        );

        if (symbolResponse.status !== 'success') {
          errors.push({
            leg: leg.option_type,
            error: symbolResponse.message || 'Failed to resolve symbol'
          });
          continue;
        }

        const resolvedSymbol = symbolResponse.symbol;
        const lotSize = symbolResponse.lotsize;

        // For basket orders, we're buying both legs
        const targetPositionSize = quantity;

        // Use placesmartorder (position-aware)
        const response = await this.makeOpenAlgoRequest(
          instance,
          'placesmartorder',
          'POST',
          {
            apikey: instance.api_key,
            strategy: strategy,
            symbol: resolvedSymbol,
            exchange: 'NFO',
            action: leg.action,
            product: product,
            pricetype: pricetype,
            quantity: quantity * lotSize,
            position_size: targetPositionSize * lotSize,
            price: pricetype === 'LIMIT' ? price : 0
          }
        );

        if (response.status === 'success') {
          orderResults.push({
            leg: leg.option_type,
            order_id: response.orderid,
            symbol: resolvedSymbol,
            exchange: 'NFO'
          });
        } else {
          errors.push({
            leg: leg.option_type,
            error: response.message || 'Failed to place order'
          });
        }
      } catch (error) {
        errors.push({
          leg: leg.option_type,
          error: error.message
        });
      }
    }

    // Return results
    if (orderResults.length > 0) {
      return {
        status: orderResults.length === legs.length ? 'success' : 'partial_success',
        strategy,
        orders: orderResults,
        errors: errors.length > 0 ? errors : undefined,
        message: `Basket order placed: ${orderResults.length}/${legs.length} legs successful`
      };
    } else {
      throw new Error('Failed to place basket order', { details: errors });
    }
  }

  /**
   * Calculate pre-configured strikes for a given underlying LTP
   *
   * @param {number} underlyingLTP - Current LTP of underlying
   * @param {number} strikeInt - Strike interval (50 for NIFTY, 100 for BANKNIFTY)
   * @returns {Object} - Object with calculated strikes
   */
  calculateStrikes(underlyingLTP, strikeInt) {
    // Calculate ATM strike
    const atmStrike = Math.round(underlyingLTP / strikeInt) * strikeInt;

    // Calculate all strikes
    const strikes = {
      ITM2: atmStrike + (-2 * strikeInt),
      ITM1: atmStrike + (-1 * strikeInt),
      ATM: atmStrike,
      OTM1: atmStrike + (1 * strikeInt),
      OTM2: atmStrike + (2 * strikeInt)
    };

    return strikes;
  }

  /**
   * Update watchlist symbol with options configuration
   *
   * @param {number} symbolId - Symbol ID
   * @param {Object} optionsConfig - Options configuration
   * @returns {Promise<void>}
   */
  async updateSymbolOptionsConfig(symbolId, optionsConfig) {
    const {
      symbol_type,
      underlying_symbol,
      expiry_date,
      strike_price,
      option_type,
      offset,
      lot_size,
      is_options_buyer,
      is_options_writer,
      default_offset,
      default_strike_int
    } = optionsConfig;

    await this.dbAsync.run(
      `UPDATE watchlist_symbols
       SET symbol_type = ?,
           underlying_symbol = ?,
           expiry_date = ?,
           strike_price = ?,
           option_type = ?,
           offset = ?,
           lot_size = ?,
           is_options_buyer = ?,
           is_options_writer = ?,
           default_offset = ?,
           default_strike_int = ?
       WHERE id = ?`,
      [
        symbol_type || 'EQUITY',
        underlying_symbol,
        expiry_date,
        strike_price,
        option_type,
        offset,
        lot_size,
        is_options_buyer ? 1 : 0,
        is_options_writer ? 1 : 0,
        default_offset || 'ATM',
        default_strike_int,
        symbolId
      ]
    );
  }

  /**
   * Detect symbol type based on exchange and symbol name
   *
   * @param {string} exchange - Exchange
   * @param {string} symbol - Symbol name
   * @returns {string} - Detected symbol type
   */
  detectSymbolType(exchange, symbol) {
    if (exchange === 'NSE_INDEX') {
      return 'INDEX';  // NIFTY, BANKNIFTY - show OPTIONS button
    } else if (symbol.includes('CE') || symbol.includes('PE')) {
      return 'OPTIONS';
    } else if (exchange === 'NFO') {
      return 'FUTURE';
    } else {
      return 'EQUITY';
    }
  }
}

export default OptionsTradingService;
