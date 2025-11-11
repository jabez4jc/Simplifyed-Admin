/**
 * Watchlist CSV Import/Export Module
 *
 * Handles CSV parsing, serialization, and import/export routes.
 */

import express from 'express';
import { requireAdminAccess } from '../../auth.js';
import { validateOpenAlgoSymbol } from '../../lib/openalgo-search.js';

const router = express.Router();
const csvBodyParser = express.text({ type: ['text/csv', 'text/plain'] });

// CSV Headers (defines the structure of watchlist CSV files)
const CSV_HEADERS = [
  'exchange',
  'symbol',
  'qty_type',
  'qty_value',
  'target_type',
  'target_value',
  'sl_type',
  'sl_value',
  'ts_type',
  'ts_value',
  'product_type',
  'order_type',
  'max_position_size',
  'max_instances',
  'is_enabled'
];

/**
 * Escape CSV value (handles quotes, commas, newlines)
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize single CSV row
 */
function serializeCsvRow(row) {
  return CSV_HEADERS
    .map(header => escapeCsvValue(row[header] ?? ''))
    .join(',');
}

/**
 * Convert array of objects to CSV string
 */
function stringifyCsv(rows) {
  const headerLine = CSV_HEADERS.join(',');
  const lines = rows.map(serializeCsvRow);
  return [headerLine, ...lines].join('\n');
}

/**
 * Parse CSV text into 2D array
 * Handles quoted values, escaped quotes, and newlines within quotes
 */
function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  const rows = [];
  let current = '';
  let row = [];
  let insideQuotes = false;

  const pushValue = () => {
    row.push(current);
    current = '';
  };

  const pushRow = () => {
    if (row.length > 0 || current.length > 0) {
      pushValue();
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      pushValue();
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      pushRow();
    } else {
      current += char;
    }
  }

  if (insideQuotes) {
    throw new Error('Invalid CSV: unmatched quote');
  }

  if (current.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/**
 * Parse CSV text into array of objects
 * First row must be headers matching CSV_HEADERS
 */
function parseCsvToObjects(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0].map(h => h.trim().toLowerCase());
  const missingHeaders = CSV_HEADERS.filter(header => !headerRow.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing CSV columns: ${missingHeaders.join(', ')}`);
  }

  const objects = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every(cell => cell === '')) {
      continue; // Skip empty rows
    }
    const entry = {};
    headerRow.forEach((header, index) => {
      entry[header] = row[index] ?? '';
    });
    objects.push(entry);
  }

  return objects;
}

/**
 * Coerce boolean values from CSV strings
 */
function coerceBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const str = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(str)) return 1;
  if (['0', 'false', 'no', 'n'].includes(str)) return 0;
  return null;
}

/**
 * GET /api/watchlists/:id/export
 * Export watchlist symbols to CSV (Admin only)
 */
router.get('/:id/export', requireAdminAccess, async (req, res) => {
  try {
    const { dbAsync } = req.app.locals;
    const { id } = req.params;

    const watchlist = await dbAsync.get('SELECT id, name FROM watchlists WHERE id = ?', [id]);
    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    const rows = await dbAsync.all(`
      SELECT
        ws.exchange,
        ws.symbol,
        sc.qty_mode,
        sc.qty_type,
        sc.qty_value,
        sc.qty_units,
        sc.lot_size,
        sc.min_qty_per_click,
        sc.max_qty_per_click,
        sc.capital_ceiling_per_trade,
        sc.contract_multiplier,
        sc.rounding,
        sc.target_type,
        sc.target_value,
        sc.sl_type,
        sc.sl_value,
        sc.ts_type,
        sc.ts_value,
        sc.trailing_activation_type,
        sc.trailing_activation_value,
        sc.product_type,
        sc.order_type,
        sc.max_position_size,
        sc.max_instances,
        sc.is_enabled
      FROM watchlist_symbols ws
      LEFT JOIN symbol_configs sc ON sc.watchlist_id = ws.watchlist_id AND sc.symbol_id = ws.id
      WHERE ws.watchlist_id = ?
      ORDER BY ws.display_order, ws.added_at
    `, [id]);

    const csvRows = rows.map(row => ({
      exchange: row.exchange || '',
      symbol: row.symbol || '',
      qty_mode: row.qty_mode || 'fixed',
      qty_type: row.qty_type || 'FIXED',
      qty_value: row.qty_value ?? '',
      qty_units: row.qty_units || 'units',
      lot_size: row.lot_size ?? '',
      min_qty_per_click: row.min_qty_per_click ?? '',
      max_qty_per_click: row.max_qty_per_click ?? '',
      capital_ceiling_per_trade: row.capital_ceiling_per_trade ?? '',
      contract_multiplier: row.contract_multiplier ?? '1.0',
      rounding: row.rounding || 'floor_to_lot',
      target_type: row.target_type ?? '',
      target_value: row.target_value ?? '',
      sl_type: row.sl_type ?? '',
      sl_value: row.sl_value ?? '',
      ts_type: row.ts_type ?? '',
      ts_value: row.ts_value ?? '',
      trailing_activation_type: row.trailing_activation_type ?? '',
      trailing_activation_value: row.trailing_activation_value ?? '',
      product_type: row.product_type || 'MIS',
      order_type: row.order_type || 'MARKET',
      max_position_size: row.max_position_size ?? '',
      max_instances: row.max_instances ?? '',
      is_enabled: row.is_enabled === null || row.is_enabled === undefined ? '1' : Number(row.is_enabled) ? '1' : '0'
    }));

    const csv = stringifyCsv(csvRows);

    const safeName = watchlist.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || `watchlist-${watchlist.id}`;

    res
      .status(200)
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${safeName}.csv"`)
      .send(csv);
  } catch (error) {
    console.error('Error exporting watchlist CSV:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to export watchlist CSV',
      error: error.message
    });
  }
});

/**
 * POST /api/watchlists/:id/import
 * Import watchlist symbols from CSV (Admin only)
 * Query params: ?mode=append|replace (default: append)
 */
router.post('/:id/import', requireAdminAccess, csvBodyParser, async (req, res) => {
  const { dbAsync } = req.app.locals;
  const { id } = req.params;
  const mode = (req.query.mode || 'append').toLowerCase();

  let transactionStarted = false;
  try {
    const watchlist = await dbAsync.get('SELECT id FROM watchlists WHERE id = ?', [id]);
    if (!watchlist) {
      return res.status(404).json({
        status: 'error',
        message: 'Watchlist not found'
      });
    }

    const csvPayload = typeof req.body === 'string'
      ? req.body
      : req.body?.csv;

    if (!csvPayload || typeof csvPayload !== 'string' || csvPayload.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'CSV data is required'
      });
    }

    let entries;
    try {
      entries = parseCsvToObjects(csvPayload);
    } catch (parseError) {
      return res.status(400).json({
        status: 'error',
        message: parseError.message || 'Invalid CSV format'
      });
    }

    if (entries.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'CSV contains no rows'
      });
    }

    // Check for duplicates within CSV
    const csvDuplicateCheck = new Set();
    for (const entry of entries) {
      const exchange = (entry.exchange || '').trim().toUpperCase();
      const symbol = (entry.symbol || '').trim().toUpperCase();
      if (!exchange || !symbol) {
        return res.status(400).json({
          status: 'error',
          message: 'Each row must include exchange and symbol'
        });
      }

      const key = `${exchange}::${symbol}`;
      if (csvDuplicateCheck.has(key)) {
        return res.status(400).json({
          status: 'error',
          message: `Duplicate symbol ${symbol} for exchange ${exchange} detected in CSV`
        });
      }
      csvDuplicateCheck.add(key);
    }

    // Get existing symbols
    const existingSymbols = await dbAsync.all(`
      SELECT exchange, symbol
      FROM watchlist_symbols
      WHERE watchlist_id = ?
    `, [id]);
    const existingSet = new Set(
      existingSymbols.map(row => `${row.exchange.toUpperCase()}::${row.symbol.toUpperCase()}`)
    );

    const shouldValidateSymbol = process.env.OPENALGO_SKIP_SYMBOL_VALIDATION !== 'true';
    const summary = {
      inserted: 0,
      skipped: 0,
      skippedSymbols: []
    };

    await dbAsync.run('BEGIN TRANSACTION');
    transactionStarted = true;

    let displayOrderRow = await dbAsync.get(
      'SELECT COALESCE(MAX(display_order), 0) AS max_order FROM watchlist_symbols WHERE watchlist_id = ?',
      [id]
    );
    let displayOrder = displayOrderRow?.max_order || 0;

    const shouldReplace = mode === 'replace';
    if (shouldReplace) {
      await dbAsync.run('DELETE FROM watchlist_symbols WHERE watchlist_id = ?', [id]);
      existingSet.clear();
      displayOrder = 0;
    }

    // Process each CSV entry
    for (const entry of entries) {
      const exchange = (entry.exchange || '').trim().toUpperCase();
      const symbol = (entry.symbol || '').trim().toUpperCase();

      const key = `${exchange}::${symbol}`;
      if (existingSet.has(key)) {
        summary.skipped += 1;
        summary.skippedSymbols.push({ exchange, symbol, reason: 'Already exists' });
        continue;
      }

      // Validate symbol with OpenAlgo if enabled
      if (shouldValidateSymbol) {
        const validation = await validateOpenAlgoSymbol({ symbol, exchange, dbAsync });
        if (!validation.valid) {
          throw new Error(validation.reason || `Symbol ${symbol} failed OpenAlgo validation`);
        }
      }

      // Insert symbol
      displayOrder += 1;
      const insertSymbol = await dbAsync.run(`
        INSERT INTO watchlist_symbols (watchlist_id, exchange, symbol, display_order)
        VALUES (?, ?, ?, ?)
      `, [id, exchange, symbol, displayOrder]);

      const symbolId = insertSymbol.lastID;
      existingSet.add(key);
      summary.inserted += 1;

      // Parse and validate config fields
      const qtyModeRaw = (entry.qty_mode || 'fixed').trim().toLowerCase();
      const qtyMode = ['fixed', 'capital', 'funds_percent'].includes(qtyModeRaw) ? qtyModeRaw : 'fixed';

      const qtyTypeRaw = (entry.qty_type || (qtyMode === 'capital' ? 'CAPITAL' : 'FIXED')).trim().toUpperCase();
      const qtyType = ['FIXED', 'CAPITAL'].includes(qtyTypeRaw) ? qtyTypeRaw : (qtyMode === 'capital' ? 'CAPITAL' : 'FIXED');

      const qtyUnitsRaw = (entry.qty_units || 'units').trim().toLowerCase();
      const qtyUnits = ['units', 'lots'].includes(qtyUnitsRaw) ? qtyUnitsRaw : (qtyMode === 'fixed' ? 'units' : null);

      const productTypeRaw = (entry.product_type || 'MIS').trim().toUpperCase();
      const productType = ['MIS', 'CNC', 'NRML'].includes(productTypeRaw) ? productTypeRaw : 'MIS';
      const orderTypeRaw = (entry.order_type || 'MARKET').trim().toUpperCase();
      const orderType = ['MARKET', 'LIMIT'].includes(orderTypeRaw) ? orderTypeRaw : 'MARKET';

      const targetTypeRaw = (entry.target_type || '').trim().toUpperCase();
      const targetType = ['NONE', 'POINTS', 'PERCENTAGE'].includes(targetTypeRaw) ? targetTypeRaw : 'NONE';
      const slTypeRaw = (entry.sl_type || '').trim().toUpperCase();
      const slType = ['NONE', 'POINTS', 'PERCENTAGE'].includes(slTypeRaw) ? slTypeRaw : 'NONE';
      const tsTypeRaw = (entry.ts_type || '').trim().toUpperCase();
      const tsType = ['NONE', 'POINTS', 'PERCENTAGE'].includes(tsTypeRaw) ? tsTypeRaw : 'NONE';

      const trailingActivationTypeRaw = (entry.trailing_activation_type || 'IMMEDIATE').trim().toUpperCase();
      const trailingActivationType = ['IMMEDIATE', 'POINTS', 'PERCENTAGE'].includes(trailingActivationTypeRaw)
        ? trailingActivationTypeRaw
        : 'IMMEDIATE';

      const roundingRaw = (entry.rounding || 'floor_to_lot').trim().toLowerCase();
      const rounding = ['floor_to_lot', 'none'].includes(roundingRaw) ? roundingRaw : 'floor_to_lot';

      const qtyValue = entry.qty_value !== '' ? Number(entry.qty_value) : 1;
      const lotSize = entry.lot_size !== '' ? Number(entry.lot_size) : 1;
      const minQtyPerClick = entry.min_qty_per_click !== '' ? Number(entry.min_qty_per_click) : 1;
      const maxQtyPerClick = entry.max_qty_per_click !== '' ? Number(entry.max_qty_per_click) : null;
      const capitalCeilingPerTrade = entry.capital_ceiling_per_trade !== '' ? Number(entry.capital_ceiling_per_trade) : null;
      const contractMultiplier = entry.contract_multiplier !== '' ? Number(entry.contract_multiplier) : 1.0;
      const targetValue = entry.target_value !== '' ? Number(entry.target_value) : null;
      const slValue = entry.sl_value !== '' ? Number(entry.sl_value) : null;
      const tsValue = entry.ts_value !== '' ? Number(entry.ts_value) : null;
      const trailingActivationValue = entry.trailing_activation_value !== '' ? Number(entry.trailing_activation_value) : null;
      const maxPositionSize = entry.max_position_size !== '' ? Number(entry.max_position_size) : null;
      const maxInstances = entry.max_instances !== '' ? Number(entry.max_instances) : null;
      const isEnabled = coerceBoolean(entry.is_enabled);

      // Insert/update symbol config
      await dbAsync.run(`
        INSERT INTO symbol_configs (
          watchlist_id,
          symbol_id,
          qty_mode,
          qty_type,
          qty_value,
          qty_units,
          lot_size,
          min_qty_per_click,
          max_qty_per_click,
          capital_ceiling_per_trade,
          contract_multiplier,
          rounding,
          target_type,
          target_value,
          sl_type,
          sl_value,
          ts_type,
          ts_value,
          trailing_activation_type,
          trailing_activation_value,
          product_type,
          order_type,
          max_position_size,
          max_instances,
          is_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(watchlist_id, symbol_id) DO UPDATE SET
          qty_mode = excluded.qty_mode,
          qty_type = excluded.qty_type,
          qty_value = excluded.qty_value,
          qty_units = excluded.qty_units,
          lot_size = excluded.lot_size,
          min_qty_per_click = excluded.min_qty_per_click,
          max_qty_per_click = excluded.max_qty_per_click,
          capital_ceiling_per_trade = excluded.capital_ceiling_per_trade,
          contract_multiplier = excluded.contract_multiplier,
          rounding = excluded.rounding,
          target_type = excluded.target_type,
          target_value = excluded.target_value,
          sl_type = excluded.sl_type,
          sl_value = excluded.sl_value,
          ts_type = excluded.ts_type,
          ts_value = excluded.ts_value,
          trailing_activation_type = excluded.trailing_activation_type,
          trailing_activation_value = excluded.trailing_activation_value,
          product_type = excluded.product_type,
          order_type = excluded.order_type,
          max_position_size = excluded.max_position_size,
          max_instances = excluded.max_instances,
          is_enabled = excluded.is_enabled,
          updated_at = CURRENT_TIMESTAMP
      `, [
        id,
        symbolId,
        qtyMode,
        qtyType,
        Number.isFinite(qtyValue) ? qtyValue : 1,
        qtyUnits,
        Number.isFinite(lotSize) ? lotSize : 1,
        Number.isFinite(minQtyPerClick) ? minQtyPerClick : 1,
        Number.isFinite(maxQtyPerClick) ? maxQtyPerClick : null,
        Number.isFinite(capitalCeilingPerTrade) ? capitalCeilingPerTrade : null,
        Number.isFinite(contractMultiplier) ? contractMultiplier : 1.0,
        rounding,
        targetType,
        Number.isFinite(targetValue) ? targetValue : null,
        slType,
        Number.isFinite(slValue) ? slValue : null,
        tsType,
        Number.isFinite(tsValue) ? tsValue : null,
        trailingActivationType,
        Number.isFinite(trailingActivationValue) ? trailingActivationValue : null,
        productType,
        orderType,
        Number.isFinite(maxPositionSize) ? maxPositionSize : null,
        Number.isFinite(maxInstances) ? maxInstances : null,
        isEnabled === null ? 1 : isEnabled
      ]);
    }

    await dbAsync.run('COMMIT');

    res.json({
      status: 'success',
      message: `CSV import completed (${summary.inserted} added, ${summary.skipped} skipped)`,
      data: summary
    });
  } catch (error) {
    try {
      if (transactionStarted) {
        await dbAsync.run('ROLLBACK');
      }
    } catch (rollbackError) {
      console.error('Error rolling back CSV import transaction:', rollbackError);
    }

    console.error('Error importing watchlist CSV:', error);
    res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to import watchlist CSV'
    });
  }
});

export default router;
