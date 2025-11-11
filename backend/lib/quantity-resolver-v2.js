/**
 * Quantity Resolver V2
 * Watchlist-driven, account-aware quantity sizing
 *
 * Implements three sizing models:
 * 1. fixed - Fixed units/lots per click
 * 2. capital - Capital-based sizing (₹X per trade)
 * 3. funds_percent - Percentage of available funds
 *
 * Calculates target positions for BUY/SELL/SHORT/COVER buttons
 */

class QuantityResolverV2 {
  constructor(dbAsync, makeOpenAlgoRequest) {
    this.dbAsync = dbAsync;
    this.makeOpenAlgoRequest = makeOpenAlgoRequest;
  }

  /**
   * Fetch last traded price (LTP) from cache or REST API
   */
  async getLTP(instance, symbol, exchange) {
    // Try cache first
    const marketData = await this.dbAsync.get(`
      SELECT ltp FROM market_data
      WHERE exchange = ? AND symbol = ?
    `, [exchange, symbol]);

    const cachedLtp = Number(marketData?.ltp);
    if (Number.isFinite(cachedLtp) && cachedLtp > 0) {
      return { ltp: cachedLtp, source: 'CACHE' };
    }

    // Fallback to REST API
    const response = await this.makeOpenAlgoRequest(
      instance,
      'quotes',
      'POST',
      { exchange, symbol }
    );

    if (response.status === 'success' && response.data?.ltp) {
      const restLtp = Number(response.data.ltp);
      if (Number.isFinite(restLtp) && restLtp > 0) {
        return { ltp: restLtp, source: 'REST_API' };
      }
    }

    throw new Error(`Failed to fetch LTP for ${symbol} ${exchange}`);
  }

  /**
   * Fetch available funds from OpenAlgo instance
   */
  async getAvailableFunds(instance) {
    try {
      const response = await this.makeOpenAlgoRequest(
        instance,
        'funds',
        'POST',
        {}
      );

      if (response.status === 'success' && response.data) {
        const available = Number(response.data.available) || 0;
        return { available, source: 'API' };
      }

      return { available: 0, source: 'API_ERROR' };
    } catch (error) {
      console.log(`[QuantityResolver] Failed to fetch funds:`, error.message);
      return { available: 0, source: 'API_ERROR' };
    }
  }

  /**
   * Resolve quantity based on qty_mode and configuration
   *
   * @param {Object} wl - Watchlist symbol configuration
   * @param {number} ltp - Last traded price
   * @param {number} availableFunds - Available funds (for funds_percent mode)
   * @returns {number} Resolved quantity in units
   */
  resolveQuantity(wl, ltp, availableFunds = 0) {
    // Determine qty_mode: use new qty_mode if present, otherwise migrate from qty_type
    const qtyMode = (wl.qty_mode || '').toLowerCase() || this.migrateQtyType(wl.qty_type);
    const qtyUnits = (wl.qty_units || 'units').toLowerCase();
    const lotSize = Math.max(parseInt(wl.lot_size) || 1, 1);
    const multiplier = Math.max(parseFloat(wl.contract_multiplier) || 1.0, 1.0);
    const qtyValue = parseFloat(wl.qty_value) || 1;

    // Calculate raw quantity
    let qRaw = 0;

    if (qtyUnits === 'lots') {
      // Lots mode only allowed for 'fixed'
      if (qtyMode !== 'fixed') {
        throw new Error(`If qty_units == 'lots', qty_mode must be 'fixed'`);
      }
      qRaw = Math.floor(qtyValue) * lotSize;
    } else {
      // Units mode
      if (qtyMode === 'fixed') {
        qRaw = Math.floor(qtyValue);
      } else if (qtyMode === 'capital') {
        const ceiling = wl.capital_ceiling_per_trade ?? Number.POSITIVE_INFINITY;
        const capital = Math.min(qtyValue, ceiling);
        qRaw = Math.floor(capital / (ltp * multiplier));
      } else if (qtyMode === 'funds_percent') {
        if (availableFunds <= 0) {
          throw new Error(`Available funds required for funds_percent mode`);
        }
        const ceiling = wl.capital_ceiling_per_trade ?? Number.POSITIVE_INFINITY;
        const capital = Math.min(
          availableFunds * (qtyValue / 100),
          ceiling
        );
        qRaw = Math.floor(capital / (ltp * multiplier));
      } else {
        throw new Error(`Unsupported qty_mode: ${qtyMode}`);
      }
    }

    // Apply rounding
    let q = qRaw;
    if ((wl.rounding || 'floor_to_lot').toLowerCase() === 'floor_to_lot' && lotSize > 1) {
      q = Math.floor(q / lotSize) * lotSize;
    }

    // Apply guardrails
    const minQty = wl.min_qty_per_click ?? lotSize;
    q = Math.max(q, minQty);

    if (wl.max_qty_per_click && q > wl.max_qty_per_click) {
      q = wl.max_qty_per_click;
    }

    if (q <= 0) {
      throw new Error(`Resolved quantity is below minimum tradable size`);
    }

    return q;
  }

  /**
   * Migrate from old qty_type to new qty_mode
   */
  migrateQtyType(qtyType) {
    const type = (qtyType || '').toUpperCase();
    if (type === 'FIXED') return 'fixed';
    if (type === 'CAPITAL') return 'capital';
    return 'fixed'; // Default fallback
  }

  /**
   * Calculate target position after button action
   *
   * @param {number} currentPos - Current position (signed: +long, -short)
   * @param {number} resolvedQty - Resolved quantity Q
   * @param {Object} wl - Watchlist config
   * @param {string} action - BUY|SELL|SHORT|COVER
   * @returns {number} Target position (signed)
   */
  calculateTargetPosition(currentPos, resolvedQty, wl, action) {
    const maxPosSize = wl.max_position_size ?? 1000000;
    const maxLong = maxPosSize;
    const maxShort = -maxPosSize;

    let target = 0;

    switch (action.toUpperCase()) {
      case 'BUY':
        // Close shorts and build long, or add to long
        target = currentPos < 0 ? resolvedQty : currentPos + resolvedQty;
        target = Math.min(target, maxLong);
        break;

      case 'SHORT':
        // Close longs and build short, or add to short
        target = currentPos > 0 ? -resolvedQty : currentPos - resolvedQty;
        target = Math.max(target, maxShort);
        break;

      case 'SELL':
        // Close longs only
        target = currentPos > 0 ? 0 : currentPos;
        break;

      case 'COVER':
        // Close shorts only
        target = currentPos < 0 ? 0 : currentPos;
        break;

      default:
        throw new Error(`Invalid action: ${action}`);
    }

    return target;
  }

  /**
   * Main entry point: Resolve quantity and calculate target for a symbol
   *
   * @param {Object} instance - OpenAlgo instance
   * @param {Object} wl - Watchlist symbol configuration
   * @param {number} currentPos - Current position (signed)
   * @param {string} action - BUY|SELL|SHORT|COVER
   * @returns {Object} { resolvedQty, targetPos, ltp, availableFunds }
   */
  async resolve(instance, wl, currentPos, action) {
    // Fetch LTP
    const ltpData = await this.getLTP(
      instance,
      wl.symbol || wl.symbol_name,
      wl.exchange
    );

    // Fetch funds for funds_percent mode
    const qtyMode = (wl.qty_mode || '').toLowerCase() || this.migrateQtyType(wl.qty_type);
    const fundsData = qtyMode === 'funds_percent'
      ? await this.getAvailableFunds(instance)
      : { available: 0, source: 'N/A' };

    // Resolve quantity
    const resolvedQty = this.resolveQuantity(
      wl,
      ltpData.ltp,
      fundsData.available
    );

    // Calculate target position
    const targetPos = this.calculateTargetPosition(
      currentPos,
      resolvedQty,
      wl,
      action
    );

    return {
      resolvedQty,
      targetPos,
      ltp: ltpData.ltp,
      ltpSource: ltpData.source,
      availableFunds: fundsData.available,
      fundsSource: fundsData.source,
      qtyMode,
      qtyUnits: wl.qty_units || 'units',
      lotSize: wl.lot_size || 1
    };
  }
}

export default QuantityResolverV2;
