const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.OPENALGO_SEARCH_TIMEOUT_MS || '5000', 10);

/**
 * Classify a symbol as Equity, Futures, or Options based on OpenAlgo API response
 * Following deterministic rules from OpenAlgo symbol classification guide
 */
function classifySymbol(row) {
  const it = (row.instrumenttype || row.instrument || row.instrument_type || '').toUpperCase();
  const sym = (row.symbol || row.tradingsymbol || '').toUpperCase();
  const expiry = (row.expiry || '').trim();
  const strike = row.strike;

  // Primary: instrumenttype
  if (it === 'EQ') {
    return 'EQUITY';
  }
  if (it.startsWith('OPT')) {
    return 'OPTIONS';
  }
  if (it.startsWith('FUT')) {
    return 'FUTURES';
  }

  // Secondary: structure checks (fallback when instrumenttype is missing)
  if (expiry && typeof strike === 'number' && strike > 0) {
    if (sym.endsWith('CE') || sym.endsWith('PE')) {
      return 'OPTIONS';
    }
  }
  if (expiry && (strike === null || strike === undefined || strike <= 0) && !sym.endsWith('CE') && !sym.endsWith('PE')) {
    return 'FUTURES';
  }

  // Fallback: Equity
  return 'EQUITY';
}

/**
 * Get F&O trading flags based on symbol classification
 */
function getTradingFlags(assetClass) {
  switch (assetClass) {
    case 'EQUITY':
      return {
        can_trade_equity: 1,
        can_trade_futures: 0,
        can_trade_options: 0
      };
    case 'FUTURES':
      return {
        can_trade_equity: 0,
        can_trade_futures: 1,
        can_trade_options: 0
      };
    case 'OPTIONS':
      return {
        can_trade_equity: 0,
        can_trade_futures: 0,
        can_trade_options: 1
      };
    default:
      return {
        can_trade_equity: 1,
        can_trade_futures: 0,
        can_trade_options: 0
      };
  }
}

function buildSearchUrl(instanceHostUrl) {
  // Build URL using the instance's host - POST endpoint, no query params
  return `${instanceHostUrl}/api/v1/search`;
}

function matchesSymbol(entry, symbol, exchange) {
  if (!entry) return false;
  const candidateSymbol = (entry.symbol || entry.tradingsymbol || entry.token || '').toUpperCase();
  const candidateExchange = (entry.exchange || entry.exch || entry.segment || '').toUpperCase();

  if (candidateSymbol !== symbol.toUpperCase()) {
    return false;
  }

  if (exchange && candidateExchange && candidateExchange !== exchange.toUpperCase()) {
    return false;
  }

  return true;
}

/**
 * Get the admin instance to use for symbol validation
 * Priority: Primary Admin > Secondary Admin > Any active instance
 */
async function getAdminInstance(dbAsync) {
  // Try primary admin first
  let instance = await dbAsync.get(
    'SELECT id, host_url, api_key FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1'
  );

  if (instance) {
    return instance;
  }

  // Try secondary admin
  instance = await dbAsync.get(
    'SELECT id, host_url, api_key FROM instances WHERE is_secondary_admin = 1 AND is_active = 1 LIMIT 1'
  );

  if (instance) {
    return instance;
  }

  // Fallback to any active instance
  instance = await dbAsync.get(
    'SELECT id, host_url, api_key FROM instances WHERE is_active = 1 LIMIT 1'
  );

  return instance || null;
}

/**
 * Validate symbol using OpenAlgo search API
 * @param {Object} params - Validation parameters
 * @param {string} params.symbol - Symbol to validate (e.g., "RELIANCE")
 * @param {string} params.exchange - Exchange (e.g., "NSE")
 * @param {Object} params.dbAsync - Database async wrapper
 * @param {boolean} params.requireExactMatch - If true, only return exact symbol matches (default: true)
 * @returns {Promise<{valid: boolean, reason?: string, results?: Array}>}
 */
export async function validateOpenAlgoSymbol({ symbol, exchange, dbAsync, requireExactMatch = true }) {
  if (!symbol) {
    return { valid: false, reason: 'Symbol is required' };
  }

  if (!dbAsync) {
    return { valid: false, reason: 'Database connection not available' };
  }

  // Get admin instance for validation
  const adminInstance = await getAdminInstance(dbAsync);

  if (!adminInstance) {
    return {
      valid: false,
      reason: 'No admin instance available for symbol validation. Please configure a Primary or Secondary Admin instance.'
    };
  }

  const url = buildSearchUrl(adminInstance.host_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Build request body as per OpenAlgo API spec
  const requestBody = {
    apikey: adminInstance.api_key,
    query: symbol.toUpperCase()
  };

  if (exchange) {
    requestBody.exchange = exchange.toUpperCase();
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    // Try to parse JSON even if response is not ok (e.g., 404)
    let payload;
    try {
      payload = await response.json();
    } catch (parseError) {
      // If we can't parse JSON, treat as error
      return {
        valid: false,
        reason: `Invalid JSON response from OpenAlgo API (status ${response.status})`
      };
    }

    // Extract results from various possible response structures
    const results = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.symbols)
          ? payload.symbols
          : [];

    // If API returned 404 but with valid JSON and empty data array,
    // treat it as "no results found" rather than an error
    if (!response.ok && (results.length > 0 || payload?.status === 'error')) {
      return {
        valid: false,
        reason: `Symbol lookup failed with status ${response.status}${payload?.message ? `: ${payload.message}` : ''}`
      };
    }

    // Check if we got results back
    if (results.length === 0) {
      return {
        valid: false,
        reason: `No symbols found for "${symbol.toUpperCase()}"${exchange ? ` on ${exchange.toUpperCase()}` : ''}`
      };
    }

    // If exact matching is required (for validation), filter for exact symbol match
    if (requireExactMatch) {
      const matched = results.some(entry => matchesSymbol(entry, symbol, exchange));

      if (!matched) {
        return {
          valid: false,
          reason: `Symbol ${symbol.toUpperCase()}${exchange ? ` on ${exchange.toUpperCase()}` : ''} not found in OpenAlgo search results`
        };
      }

      // Return the exact matched result(s) with classification
      const exactMatches = results
        .filter(entry => matchesSymbol(entry, symbol, exchange))
        .map(entry => {
          const assetClass = classifySymbol(entry);
          return {
            ...entry,
            asset_class: assetClass,
            ...getTradingFlags(assetClass)
          };
        });
      return { valid: true, results: exactMatches };
    }

    // For search (no exact matching needed), return all results with classification
    const classifiedResults = results.map(entry => {
      const assetClass = classifySymbol(entry);
      return {
        ...entry,
        asset_class: assetClass,
        ...getTradingFlags(assetClass)
      };
    });
    return { valid: true, results: classifiedResults };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { valid: false, reason: 'Symbol lookup timed out' };
    }

    return {
      valid: false,
      reason: `Symbol lookup failed: ${error.message || 'Unknown error'}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default validateOpenAlgoSymbol;
