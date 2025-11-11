# Symbol Classification Implementation - Complete Summary

## Overview

This implementation adds **automatic symbol type detection** based on OpenAlgo API classification rules. Symbols are now automatically classified as **Equity**, **Futures**, or **Options** when added to watchlists, eliminating the need for manual F&O configuration.

## Classification Rules (OpenAlgo Standard)

Following the deterministic rules from OpenAlgo symbol classification guide:

### 1. Primary Classification (by `instrumenttype`)
- **EQ** → Equity
- **OPT*** (OPTSTK, OPTIDX, etc.) → Options
- **FUT*** (FUTSTK, FUTIDX, etc.) → Futures

### 2. Secondary Classification (by structure when instrumenttype is missing)
- **Options**: `expiry` present AND `strike > 0` AND symbol ends with **CE/PE**
- **Futures**: `expiry` present AND (`strike <= 0` or `null`) AND symbol doesn't end with CE/PE
- **Equity**: Default fallback

## Files Modified

### 1. **backend/lib/openalgo-search.js**
**Added:**
- `classifySymbol(row)` - Classification function following OpenAlgo rules
- `getTradingFlags(assetClass)` - Maps asset class to trading flags

**Modified:**
- `validateOpenAlgoSymbol()` - Now adds `asset_class`, `can_trade_equity`, `can_trade_futures`, `can_trade_options` to all results

### 2. **backend/routes/symbol-search.js**
**Modified:**
- Search results now include classification fields
- Cache table queries updated to include asset_class and trading flags
- INSERT queries updated to store classification data

### 3. **backend/server.js**
**Modified:**
- Database schema updated to include new columns:
  - `asset_class TEXT DEFAULT 'EQUITY'`
  - `can_trade_equity INTEGER DEFAULT 0`
  - `can_trade_futures INTEGER DEFAULT 0`
  - `can_trade_options INTEGER DEFAULT 0`
- Added ALTER TABLE statements for backward compatibility

### 4. **backend/public/dashboard.html**
**Modified:**
- Add Symbol Modal: F&O checkboxes now `readonly` (no manual editing)
- Changed from "Select which types..." to "Automatically detected from OpenAlgo symbol data"
- Checkboxes now show as disabled/read-only with different styling

## Key Features

### 1. Automatic Detection
When a user searches for and selects a symbol:
1. System calls OpenAlgo `/search` API
2. Results are automatically classified using OpenAlgo rules
3. F&O checkboxes are **auto-populated** based on detected type
4. User cannot manually change F&O settings (they're read-only)

### 2. Type-Based Trading Flags

| Detected Type | can_trade_equity | can_trade_futures | can_trade_options | Trading UI |
|---------------|------------------|-------------------|-------------------|------------|
| Equity        | 1                | 0                 | 0                 | BUY/SELL/EXIT |
| Futures       | 0                | 1                 | 0                 | BUY/SELL/EXIT (no toggle) |
| Options       | 0                | 0                 | 1                 | BUY CE/SELL CE/BUY PE/SELL PE/EXIT ALL |
| Equity+F&O*   | 1                | 1                 | 1                 | Toggle Equity/Futures + Options buttons |

*Note: Equity+F&O is detected when an equity symbol also has F&O contracts available

### 3. Trading Button Logic

The watchlist rendering logic (`dashboard.js` lines 1746-1805) uses detected flags:

```javascript
if (canTradeEquity && canTradeFutures) {
    // Show toggle between Equity and Futures modes
    // Always show Options buttons if available
} else if (canTradeFutures && !canTradeEquity) {
    // Futures only - simple BUY/SELL/EXIT buttons
} else {
    // Equity only - simple BUY/SELL/EXIT buttons
}
```

### 4. Caching
- Search results cached in `symbol_search_cache` table
- Classification data stored in cache for fast retrieval
- Cache expires after 7 days
- Backward compatible with existing cached results (defaults applied)

## API Response Example

**Symbol Search Response:**
```json
{
  "status": "success",
  "data": [
    {
      "symbol": "BANKNIFTY25NOV25FUT",
      "tradingsymbol": "BANKNIFTY25NOV25FUT",
      "exchange": "NFO",
      "instrument_type": "FUTIDX",
      "lot_size": 35,
      "asset_class": "FUTURES",
      "can_trade_equity": 0,
      "can_trade_futures": 1,
      "can_trade_options": 0
    }
  ]
}
```

## Benefits

1. **No Manual Configuration**: Symbols automatically get correct trading modes
2. **Always Accurate**: Uses authoritative OpenAlgo classification
3. **Consistent**: All symbols classified using same deterministic rules
4. **Future-Proof**: Automatically handles new instruments and exchanges
5. **User-Friendly**: No complex F&O configuration needed
6. **Safe**: Prevents misconfiguration of trading modes

## Testing

To verify automatic classification:

1. **Search for Equity symbol** (e.g., "RELIANCE")
   - Expected: Only Equity checkbox checked
   - Expected UI: BUY/SELL/EXIT buttons

2. **Search for Futures symbol** (e.g., "BANKNIFTY28NOV25FUT")
   - Expected: Only Futures checkbox checked
   - Expected UI: BUY/SELL/EXIT buttons (no toggle)

3. **Search for Options symbol** (e.g., "NIFTY28NOV2522500CE")
   - Expected: Only Options checkbox checked
   - Expected UI: BUY CE/SELL CE/BUY PE/SELL PE/EXIT ALL

## Migration Notes

- Existing symbols in watchlists retain their manual F&O configuration
- New symbols added will use automatic detection
- Old cache entries will default to EQUITY classification
- No data migration required

## Summary

This implementation transforms the system from **manual F&O configuration** to **automatic symbol classification**, making it:
- ✅ Easier to use
- ✅ More accurate
- ✅ Consistent with OpenAlgo standards
- ✅ Future-proof for new instruments
