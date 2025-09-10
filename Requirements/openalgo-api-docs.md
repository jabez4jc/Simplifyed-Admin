# OpenAlgo API Documentation

## Overview

OpenAlgo is a trading API platform that provides endpoints for account management, order execution, market data, and real-time websocket connections. This documentation covers all available API endpoints with complete request/response examples.

## Base Configuration

### API Endpoints

OpenAlgo can be accessed through multiple methods:

- **Local Host**: `http://127.0.0.1:5000`
- **Ngrok Domain**: `https://<your-ngrok-domain>.ngrok-free.app`
- **Custom Domain**: `https://<your-custom-domain>`

### WebSocket Endpoints

- **Local WebSocket**: `ws://127.0.0.1:8765`
- **Ngrok WebSocket**: `wss://<your-ngrok-domain>.ngrok-free.app/ws`
- **Custom Domain WebSocket**: `wss://<your-custom-domain>/ws`

### Configuration
- **Authentication**: API Key based authentication
- **Content-Type**: `application/json`
- **Default Port**: 5000 (REST API), 8765 (WebSocket) # Only for localhost instances of OpenAlgo

## Example - Base Configuration

- **Base URL**: `https://angelone.simplifyed.in`
- **WebSocket URL**: `wss://angelone.simplifyed.in/ws`
- **Authentication**: API Key based authentication
- **Content-Type**: `application/json`

## Authentication

All API endpoints require an API key to be included in the request body:

```json
{
    "apikey": "your-api-key-here"
}
```

---

## Account APIs

### 1. Get Funds

Retrieves account fund details including available balance and margins.

**Endpoint**: `POST /api/v1/funds`


**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "data": {
        "availablecash": "100.00",
        "collateral": "0.00",
        "m2mrealized": "0.00",
        "m2munrealized": "0.00",
        "utiliseddebits": "0.00"
    },
    "status": "success"
}
```

**Response Fields**:
- `availablecash`: Available cash balance for trading
- `collateral`: Collateral margin from holdings
- `m2mrealized`: Realized Mark-to-Market profit/loss
- `m2munrealized`: Unrealized Mark-to-Market profit/loss
- `utiliseddebits`: Used margin/debits

---

### 2. Get Orderbook

Retrieves all orders placed during the current trading session.

**Endpoint**: `POST /api/v1/orderbook`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "orders": [
            {
                "orderid": "123456789",
                "symbol": "SBIN",
                "exchange": "NSE",
                "action": "BUY",
                "quantity": "10",
                "price": "500.00",
                "status": "complete",
                "ordertype": "LIMIT",
                "product": "MIS",
                "filledquantity": "10",
                "averageprice": "499.95",
                "timestamp": "2024-12-18 10:30:45",
                "strategy": "Test Strategy"
            }
        ],
        "statistics": {
            "total_buy_orders": 5.0,
            "total_sell_orders": 3.0,
            "total_completed_orders": 6.0,
            "total_open_orders": 1.0,
            "total_rejected_orders": 1.0
        }
    }
}
```

**Response Fields**:
- `orders`: Array of all orders with complete details
- `statistics`: Summary statistics of orders by type and status

---

### 3. Get Tradebook

Retrieves all executed trades for the current trading session.

**Endpoint**: `POST /api/v1/tradebook`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "trades": [
            {
                "tradeid": "987654321",
                "orderid": "123456789",
                "symbol": "SBIN",
                "exchange": "NSE",
                "action": "BUY",
                "quantity": "10",
                "price": "499.95",
                "value": "4999.50",
                "timestamp": "2024-12-18 10:30:45",
                "product": "MIS"
            }
        ]
    }
}
```

**Response Fields**:
- `trades`: Array of executed trades
- Each trade includes symbol, action, quantity, average price, trade value, timestamp, and order ID

---

### 4. Get Positionbook

Retrieves all open positions across different segments.

**Endpoint**: `POST /api/v1/positionbook`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "positions": [
            {
                "symbol": "SBIN",
                "exchange": "NSE",
                "product": "MIS",
                "quantity": "10",
                "averageprice": "499.95",
                "currentprice": "502.00",
                "pnl": "20.50",
                "pnlpercentage": "0.41"
            }
        ]
    }
}
```

**Response Fields**:
- `positions`: Array of open positions
- Each position includes symbol, exchange, product, quantity, average price, current price, and P&L

**Note for Simplifyed Admin Integration**:
- Tradebook data is used to calculate **Realized P&L** from completed trades
- Positionbook data is used to calculate **Unrealized P&L** from open positions
- Combined together, they provide **Total P&L** = Realized P&L + Unrealized P&L
- Simplifyed Admin polls both endpoints every 30 seconds for comprehensive P&L tracking

---

### 5. Get Holdings

Retrieves long-term holdings in the demat account.

**Endpoint**: `POST /api/v1/holdings`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "holdings": [
            {
                "symbol": "RELIANCE",
                "exchange": "NSE",
                "quantity": "50",
                "averageprice": "2400.00",
                "currentprice": "2450.00",
                "value": "122500.00",
                "pnl": "2500.00",
                "pnlpercentage": "2.08"
            }
        ],
        "statistics": {
            "totalholdingvalue": "245000.00",
            "totalinvvalue": "240000.00",
            "totalprofitandloss": "5000.00",
            "totalpnlpercentage": "2.08"
        }
    }
}
```

**Response Fields**:
- `holdings`: Array of holdings with quantity, average price, current value, and P&L
- `statistics`: Summary of total holding value, investment, and overall P&L

---

### 6. Get Analyzer Status

Retrieves the current status of the trade analyzer.

**Endpoint**: `POST /api/v1/analyzer`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "analyzer_status": "enabled",
        "mode": "analyze",
        "last_update": "2024-12-18 10:30:45"
    }
}
```

**Response Fields**:
- `analyzer_status`: Current status (enabled/disabled)
- `mode`: Current mode (analyze/live)
- `last_update`: Last status update timestamp

---

### 7. Toggle Analyzer

Enables or disables the trade analyzer.

**Endpoint**: `POST /api/v1/analyzer/toggle`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "mode": true  // true to enable, false to disable
}
```

**Response**:
```json
{
    "data": {
        "analyze_mode": true,
        "message": "Analyzer mode switched to analyze",
        "mode": "analyze",
        "total_logs": 0
    },
    "status": "success"
}
```

---

### 8. Ping

This API Function checks connectivity and validates the API key authentication with the OpenAlgo platform

**Endpoint**: `POST /api/v1/ping`

**Request Body**:
```json
{ 
"apikey": "your-api-key" 
}
```

**Response**:
```json
{
  "data": {
    "broker": "upstox",
    "message": "pong"
  },
  "status": "success"
}
```

---

## Comprehensive P&L Calculation for Simplifyed Admin

### Overview

The Simplifyed Admin Dashboard uses a comprehensive P&L tracking system that combines data from multiple OpenAlgo endpoints to provide complete profit and loss visibility. This system calculates both **Realized P&L** (from completed trades) and **Unrealized P&L** (from open positions).

### P&L Components

1. **Realized P&L**: Calculated from completed trades using `/api/v1/tradebook`
2. **Unrealized P&L**: Calculated from open positions using `/api/v1/positionbook`  
3. **Total P&L**: Sum of Realized P&L + Unrealized P&L

### Implementation Logic

#### Step 1: Fetch Tradebook Data
```json
POST /api/v1/tradebook
{
    "apikey": "your-api-key"
}
```

#### Step 2: Calculate Realized P&L
```javascript
// Group trades by symbol and calculate realized P&L
function calculateRealizedPnL(trades) {
  const grouped = {};
  
  // Group by symbol
  for (let trade of trades) {
    const { symbol, action, price, quantity } = trade;
    if (!grouped[symbol]) {
      grouped[symbol] = { buyQty: 0, buySum: 0, sellQty: 0, sellSum: 0 };
    }

    if (action === "BUY") {
      grouped[symbol].buyQty += parseInt(quantity);
      grouped[symbol].buySum += parseFloat(price) * parseInt(quantity);
    } else if (action === "SELL") {
      grouped[symbol].sellQty += parseInt(quantity);
      grouped[symbol].sellSum += parseFloat(price) * parseInt(quantity);
    }
  }

  // Calculate realized P&L per symbol
  const realizedPnL = {};
  for (let symbol in grouped) {
    const g = grouped[symbol];
    const avgBuy = g.buyQty ? g.buySum / g.buyQty : 0;
    const avgSell = g.sellQty ? g.sellSum / g.sellQty : 0;
    const closedQty = Math.min(g.buyQty, g.sellQty);
    
    realizedPnL[symbol] = (avgSell - avgBuy) * closedQty;
  }
  
  return realizedPnL;
}
```

#### Step 3: Fetch Positionbook Data
```json
POST /api/v1/positionbook
{
    "apikey": "your-api-key"
}
```

#### Step 4: Calculate Unrealized P&L
```javascript
// Extract unrealized P&L from position data
function calculateUnrealizedPnL(positions) {
  const unrealizedPnL = {};
  
  for (let position of positions) {
    const pnl = parseFloat(position.pnl) || 0;
    unrealizedPnL[position.symbol] = pnl;
  }
  
  return unrealizedPnL;
}
```

#### Step 5: Combine for Total P&L
```javascript
// Calculate comprehensive P&L
const realizedTotal = Object.values(realizedPnL).reduce((sum, pnl) => sum + pnl, 0);
const unrealizedTotal = Object.values(unrealizedPnL).reduce((sum, pnl) => sum + pnl, 0);
const totalPnL = realizedTotal + unrealizedTotal;

// Final result
const comprehensivePnL = {
  realized_pnl: realizedTotal,     // ₹2,500.00 (from completed trades)
  unrealized_pnl: unrealizedTotal, // ₹1,250.00 (from open positions)
  total_pnl: totalPnL              // ₹3,750.00 (combined)
};
```

### Dashboard Display Format

In the Simplifyed Admin Dashboard, this data is displayed as:

- **Total P&L Card**: Shows total with breakdown
  ```
  +₹3,750
  R: +₹2,500 | U: +₹1,250
  ```

- **Individual Instance**: Shows per-instance P&L breakdown
- **Filtered View**: Shows cumulative P&L for currently displayed instances
- **Auto-switching**: Uses total P&L for profit/loss target triggers

### Polling Strategy

- **Frequency**: Every 30 seconds
- **Endpoints**: Both `/tradebook` and `/positionbook`
- **Fallback**: If tradebook fails, falls back to positionbook-only P&L
- **Storage**: Results stored in database with separate columns for realized, unrealized, and total P&L

### Benefits

1. **Complete Visibility**: See both realized profits and unrealized potential
2. **Accurate Targeting**: Auto-switching based on comprehensive P&L
3. **Better Decisions**: Filter instances and see cumulative P&L for manual decisions
4. **Historical Tracking**: Separate tracking of realized vs unrealized performance

---

## Order APIs

### 1. Place Order

Places a regular order in the market.

**Endpoint**: `POST /api/v1/placeorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "exchange": "NSE",
    "symbol": "SBIN",
    "action": "BUY",
    "product": "MIS",
    "pricetype": "MARKET",
    "quantity": "10",
    "price": "0",
    "trigger_price": "0",
    "disclosed_quantity": "0"
}
```

**Parameters**:
- `strategy`: Name of the trading strategy (required for tracking)
- `exchange`: Exchange segment (NSE, BSE, NFO, MCX, CDS)
- `symbol`: Trading symbol as per exchange format
- `action`: BUY or SELL
- `product`: Product type
  - `CNC`: Cash and Carry (Delivery)
  - `MIS`: Margin Intraday Square Off
  - `NRML`: Normal (F&O)
- `pricetype`: Order type
  - `MARKET`: Market order
  - `LIMIT`: Limit order
  - `SL`: Stop Loss order
  - `SL-M`: Stop Loss Market order
- `quantity`: Order quantity
- `price`: Limit price (0 for market orders)
- `trigger_price`: Trigger price for stop-loss orders
- `disclosed_quantity`: Disclosed quantity (0 for full disclosure)

**Response**:
```json
{
    "status": "success",
    "orderid": "123456789"
}
```

**Error Response**:
```json
{
    "status": "error",
    "message": "Invalid symbol or exchange"
}
```

---

### 2. Place Smart Order

Places an intelligent order that manages position sizing automatically. Smart orders check existing positions and adjust order quantity accordingly.

**Endpoint**: `POST /api/v1/placesmartorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "exchange": "NSE",
    "symbol": "YESBANK",
    "action": "BUY",
    "product": "MIS",
    "pricetype": "MARKET",
    "quantity": "10",
    "price": "0",
    "trigger_price": "0",
    "disclosed_quantity": "0",
    "position_size": "10"
}
```

**Additional Parameters**:
- `position_size`: Desired position size for smart order execution
- Smart order will check existing positions and adjust quantity to maintain the specified position size

**Response**:
```json
{
    "status": "success",
    "orderid": "123456789"
}
```

---

### 3. Place Basket Order

Places multiple orders simultaneously as a basket. Buy orders are executed before sell orders to manage margins effectively.

**Endpoint**: `POST /api/v1/basketorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "orders": [
        {
            "symbol": "RELIANCE",
            "exchange": "NSE",
            "action": "BUY",
            "quantity": "1",
            "pricetype": "MARKET",
            "product": "MIS",
            "price": "0",
            "trigger_price": "0"
        },
        {
            "symbol": "INFY",
            "exchange": "NSE",
            "action": "SELL",
            "quantity": "1",
            "pricetype": "MARKET",
            "product": "MIS",
            "price": "0",
            "trigger_price": "0"
        }
    ]
}
```

**Response**:
```json
{
    "results": [
        {
            "orderid": "0721594cd608AO",
            "status": "success",
            "symbol": "RELIANCE"
        },
        {
            "orderid": "0721814b604aAO",
            "status": "success",
            "symbol": "INFY"
        }
    ],
    "status": "success"
}
```

**Note**: Buy orders are prioritized over sell orders to help manage hedged trades and margins.

---

### 4. Place Split Order

Splits a large order into smaller chunks for better execution and to avoid market impact.

**Endpoint**: `POST /api/v1/splitorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "exchange": "NSE",
    "symbol": "YESBANK",
    "action": "SELL",
    "quantity": "105",
    "splitsize": "20",
    "pricetype": "MARKET",
    "product": "MIS",
    "price": "0",
    "trigger_price": "0"
}
```

**Additional Parameters**:
- `splitsize`: Maximum quantity per individual order
- `quantity`: Total quantity to be split

**Response**:
```json
{
    "results": [
        {
            "order_num": 1,
            "orderid": "0721311ab759AO",
            "quantity": 20,
            "status": "success"
        },
        {
            "order_num": 2,
            "orderid": "072164d8099bAO",
            "quantity": 20,
            "status": "success"
        },
        {
            "order_num": 3,
            "orderid": "0721c7baab38AO",
            "quantity": 20,
            "status": "success"
        },
        {
            "order_num": 4,
            "orderid": "0721db153fe3AO",
            "quantity": 20,
            "status": "success"
        },
        {
            "order_num": 5,
            "orderid": "07217e80d074AO",
            "quantity": 20,
            "status": "success"
        },
        {
            "order_num": 6,
            "orderid": "0721c5ab99b0AO",
            "quantity": 5,
            "status": "success"
        }
    ],
    "split_size": 20,
    "status": "success",
    "total_quantity": 105
}
```

**Note**: The last order will contain the remaining quantity if total is not evenly divisible by split size.

---

### 5. Modify Order

Modifies an existing pending order.

**Endpoint**: `POST /api/v1/modifyorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "symbol": "SBIN",
    "action": "BUY",
    "exchange": "NSE",
    "orderid": "123456789",
    "product": "MIS",
    "pricetype": "LIMIT",
    "price": "500",
    "quantity": "10",
    "disclosed_quantity": "0",
    "trigger_price": "0"
}
```

**Required Parameters**:
- `orderid`: The order ID to modify
- All original order parameters with modified values

**Response**:
```json
{
    "status": "success",
    "orderid": "123456789"
}
```

---

### 6. Cancel Order

Cancels a specific pending order.

**Endpoint**: `POST /api/v1/cancelorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "orderid": "123456789"
}
```

**Response**:
```json
{
    "status": "success",
    "orderid": "123456789"
}
```

---

### 7. Cancel All Orders

Cancels all pending orders for a specific strategy.

**Endpoint**: `POST /api/v1/cancelallorder`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name"
}
```

**Response**:
```json
{
    "canceled_orders": [
        "0721fa1fd9a0AO",
        "072189b980bdAO",
        "0721594cd608AO",
        "0721814b604aAO",
        "0721311ab759AO",
        "07217e80d074AO",
        "0721db153fe3AO",
        "0721c7baab38AO",
        "0721c5ab99b0AO",
        "072164d8099bAO"
    ],
    "failed_cancellations": [
        "072153dcf551AO",
        "0721f2c87f5aAO"
    ],
    "message": "Canceled 12 orders. Failed to cancel 2 orders.",
    "status": "success"
}
```

---

### 8. Close Position

Closes all open positions for a specific strategy.

**Endpoint**: `POST /api/v1/closeposition`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name"
}
```

**Response**:
```json
{
    "message": "All Open Positions Squared Off",
    "status": "success"
}
```

---

### 9. Get Order Status

Retrieves the current status of a specific order.

**Endpoint**: `POST /api/v1/orderstatus`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "orderid": "072153dcf551AO"
}
```

**Response**:
```json
{
    "data": {
        "action": "BUY",
        "exchange": "NSE",
        "order_status": "cancelled",
        "orderid": "072153dcf551AO",
        "price": 0.0,
        "pricetype": "MARKET",
        "product": "MIS",
        "quantity": "100",
        "symbol": "RELIANCE",
        "timestamp": "21-Jul-2025 23:53:48",
        "trigger_price": 0.0
    },
    "status": "success"
}
```

**Order Status Values**:
- `pending`: Order received but not yet processed
- `open`: Order is active (partial fill possible)
- `complete`: Order fully executed
- `cancelled`: Order cancelled by user
- `rejected`: Order rejected by exchange/RMS
- `trigger_pending`: Stop order waiting for trigger price

---

### 10. Get Open Position

Retrieves open position details for a specific symbol.

**Endpoint**: `POST /api/v1/openposition`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "strategy": "Strategy Name",
    "symbol": "YESBANK",
    "exchange": "NSE",
    "product": "CNC"
}
```

**Response**:
```json
{
    "status": "success",
    "data": {
        "symbol": "YESBANK",
        "exchange": "NSE",
        "product": "CNC",
        "quantity": "100",
        "average_buy_price": "24.50",
        "average_sell_price": "0",
        "buy_quantity": "100",
        "sell_quantity": "0",
        "net_quantity": "100",
        "ltp": "25.10",
        "pnl": "60.00",
        "pnl_percentage": "2.45"
    }
}
```

**Response Fields**:
- `net_quantity`: Net position (positive for long, negative for short)
- `average_buy_price`: Average price of all buy trades
- `average_sell_price`: Average price of all sell trades
- `pnl`: Profit/Loss amount
- `pnl_percentage`: P&L as percentage of investment

---

## Data APIs

### 1. Get Quotes

Retrieves real-time quotes for a symbol.

**Endpoint**: `POST /api/v1/quotes`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "symbol": "SBIN",
    "exchange": "NSE"
}
```

**Response**:
```json
{
    "data": {
        "ask": 0.0,
        "bid": 824.2,
        "high": 827.35,
        "low": 817.95,
        "ltp": 824.2,
        "oi": 243636000,
        "open": 823.0,
        "prev_close": 823.35,
        "volume": 8852594
    },
    "status": "success"
}
```

**Response Fields**:
- `ltp`: Last Traded Price
- `open`, `high`, `low`, `close`: OHLC data
- `volume`: Total traded volume
- `bid`, `ask`: Best bid and ask prices
- `bid_qty`, `ask_qty`: Quantities at best bid/ask provided by some brokers
- `oi`: Open Interest (for F&O)
- `change`, `change_percent`: Price change from close provided by some brokers

---

### 2. Get Market Depth

Retrieves order book depth (5 levels of bid/ask).

**Endpoint**: `POST /api/v1/depth`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "symbol": "RELIANCE",
    "exchange": "NSE"
}
```

**Response**:
```json
{
    "data": {
        "asks": [
            {
                "price": 1428.6,
                "quantity": 5791
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            }
        ],
        "bids": [
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            },
            {
                "price": 0.0,
                "quantity": 0
            }
        ],
        "high": 1476.0,
        "low": 1423.1,
        "ltp": 1428.6,
        "ltq": 270,
        "oi": 265076500,
        "open": 1465.0,
        "prev_close": 1476.0,
        "totalbuyqty": 0,
        "totalsellqty": 5791,
        "volume": 22442744
    },
    "status": "success"
}
```

**Response Fields**:
- `buyBook`: 5 levels of bid prices with quantity and order count
- `sellBook`: 5 levels of ask prices with quantity and order count
- `ltp`: Last traded price
- Each level contains price, quantity, and number of orders

---

### 3. Get Historical Data

Retrieves historical price data for backtesting and analysis. Maximum data limit depends on the interval selected.

**Endpoint**: `POST /api/v1/history`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "symbol": "SBIN",
    "exchange": "NSE",
    "interval": "D",
    "start_date": "2025-07-17",
    "end_date": "2025-07-21"
}
```

**Parameters**:
- `interval`: Candle interval
  - Intraday: `1m`, `3m`, `5m`, `10m`, `15m`, `30m`, `1h`, `2h`, `3h`
  - Daily: `1d`, `1w`, `1M`
- `start_date`: Start date in YYYY-MM-DD format
- `end_date`: End date in YYYY-MM-DD format

**Response**:
```json
{
    "data": [
        {
            "close": 829.0,
            "high": 842.5,
            "low": 826.35,
            "oi": 0,
            "open": 838.4,
            "timestamp": 1752710400,
            "volume": 23073718
        },
        {
            "close": 823.35,
            "high": 832.65,
            "low": 820.25,
            "oi": 0,
            "open": 832.0,
            "timestamp": 1752796800,
            "volume": 15387801
        },
        {
            "close": 824.2,
            "high": 827.35,
            "low": 817.95,
            "oi": 0,
            "open": 823.0,
            "timestamp": 1753056000,
            "volume": 8852594
        }
    ],
    "status": "success"
}
```

**Response Fields**:
- Array of OHLCV candles
- Each candle contains timestamp, open, high, low, close, and volume

**Note**: Different brokers support different date ranges. Generally:
- Intraday data: Last 30-60 days
- Daily data: Last 1-2 years

---

### 4. Get Available Intervals

Retrieves list of supported candle intervals.

**Endpoint**: `POST /api/v1/intervals`

**Request Body**:
```json
{
    "apikey": "your-api-key"
}
```

**Response**:
```json
{
    "data": {
        "days": [
            "D"
        ],
        "hours": [
            "1h"
        ],
        "minutes": [
            "10m",
            "15m",
            "1m",
            "30m",
            "3m",
            "5m"
        ],
        "months": [],
        "seconds": [],
        "weeks": []
    },
    "status": "success"
}
```

**Note**: Available intervals may vary by broker.

---

### 5. Get Symbol Details

Retrieves detailed information about a specific symbol.

**Endpoint**: `POST /api/v1/symbol`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "symbol": "SBIN",
    "exchange": "NSE"
}
```

**Response**:
```json
{
    "data": {
        "brexchange": "NSE",
        "brsymbol": "SBIN-EQ",
        "exchange": "NSE",
        "expiry": "",
        "id": 2436,
        "instrumenttype": "",
        "lotsize": 1,
        "name": "SBIN",
        "strike": -0.01,
        "symbol": "SBIN",
        "tick_size": 0.05,
        "token": "3045"
    },
    "status": "success"
}
```

**Response Fields**:
- `token`: Exchange token/instrument ID
- `lotsize`: Lot size (1 for equity, varies for F&O)
- `ticksize`: Minimum price movement
- `instrumenttype`: Type of instrument (EQ, FUT, OPT)
- `tradingsymbol`: Broker-specific trading symbol
- `expiry`, `strike`, `optiontype`: Applicable for derivatives

---

### 6. Search Symbols

Searches for symbols based on query string. Useful for finding derivatives or searching across exchanges.

**Endpoint**: `POST /api/v1/search`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "query": "BANKNIFTY",
    "exchange": "NFO"
}
```

**Response**:
```json
{
    "data": [
        {
            "brexchange": "NFO",
            "brsymbol": "BANKNIFTY25SEP25FUT",
            "exchange": "NFO",
            "expiry": "25-SEP-25",
            "instrumenttype": "FUTIDX",
            "lotsize": 35,
            "name": "BANKNIFTY",
            "strike": -0.01,
            "symbol": "BANKNIFTY25SEP25FUT",
            "tick_size": 0.2,
            "token": "52995"
        },
        {
            "brexchange": "NFO",
            "brsymbol": "BANKNIFTY31JUL2548600PE",
            "exchange": "NFO",
            "expiry": "31-JUL-25",
            "instrumenttype": "OPTIDX",
            "lotsize": 35,
            "name": "BANKNIFTY",
            "strike": 48600.0,
            "symbol": "BANKNIFTY31JUL2548600PE",
            "tick_size": 0.05,
            "token": "53780"
        },
        {
            "brexchange": "NFO",
            "brsymbol": "BANKNIFTY31JUL2549800PE",
            "exchange": "NFO",
            "expiry": "31-JUL-25",
            "instrumenttype": "OPTIDX",
            "lotsize": 35,
            "name": "BANKNIFTY",
            "strike": 49800.0,
            "symbol": "BANKNIFTY31JUL2549800PE",
            "tick_size": 0.05,
            "token": "53854"
        },
        .
        .
        .
        .
        .
        {
            "brexchange": "NFO",
            "brsymbol": "BANKNIFTY25SEP2555800PE",
            "exchange": "NFO",
            "expiry": "25-SEP-25",
            "instrumenttype": "OPTIDX",
            "lotsize": 35,
            "name": "BANKNIFTY",
            "strike": 55800.0,
            "symbol": "BANKNIFTY25SEP2555800PE",
            "tick_size": 0.05,
            "token": "55006"
        }
    ],
    "message": "Found 50 matching symbols",
    "status": "success"
}
```

**Response Fields**:
- If the exchange is not provided, all exchanges will be searched.
- Array of matching symbols with complete details
- Includes derivatives information like expiry, strike, and option type

---

### 7. Get Expiry Dates

Retrieves available expiry dates for derivatives.

**Endpoint**: `POST /api/v1/expiry`

**Request Body**:
```json
{
    "apikey": "your-api-key",
    "symbol": "BANKNIFTY",
    "exchange": "NFO",
    "instrumenttype": "options"
}
```

**Parameters**:
- `instrumenttype`: Type of instrument (`options` or `futures`)

**Response**:
```json
{
    "data": [
        "24-JUL-25",
        "31-JUL-25",
        "07-AUG-25",
        "14-AUG-25",
        "21-AUG-25",
        "28-AUG-25",
        "25-SEP-25",
        "24-DEC-25",
        "26-MAR-26",
        "25-JUN-26",
        "31-DEC-26",
        "24-JUN-27",
        "30-DEC-27",
        "29-JUN-28",
        "28-DEC-28",
        "28-JUN-29",
        "27-DEC-29",
        "25-JUN-30"
    ],
    "message": "Found 18 expiry dates for NIFTY options in NFO",
    "status": "success"
}
```

**Note**: Expiry dates are returned in YYYY-MM-DD format and sorted chronologically.

---

## WebSocket API

The WebSocket API provides real-time market data streaming with low latency.

### Connection

WebSocket endpoints vary based on your deployment:

- **Local**: `ws://127.0.0.1:8765`
- **Ngrok**: `wss://<your-ngrok-domain>.ngrok-free.app/ws`
- **Custom Domain**: `wss://<your-custom-domain>/ws`

### Connection Flow

1. **Establish WebSocket Connection**
2. **Send Authentication Message**
3. **Subscribe to Instruments**
4. **Receive Real-time Updates**
5. **Handle Disconnections with Auto-reconnect**

### Authentication

Send authentication message immediately after connection:

```json
{
    "action": "authenticate",
    "api_key": "your-api-key"
}
```

**Authentication Response**:
```json
{
    "type": "auth",
    "status": "success",
    "message": "Authentication successful",
    "broker": "angel",
    "user_id": "jabez4jc",
    "supported_features": {
        "ltp": true,
        "quote": true,
        "depth": true
    }
}
```

### Subscription Modes

1. **LTP (Last Traded Price) - Mode 1**
   
   Subscribe:
   ```json
   {
       "action": "subscribe",
       "symbol": "RELIANCE",
       "exchange": "NSE",
       "mode": 1
   }
   ```

    **Subscription Response**:
    ```json
    {
        "type": "subscribe",
        "status": "success",
        "subscriptions": [
            {
                "symbol": "RELIANCE",
                "exchange": "NSE",
                "status": "success",
                "mode": 1,
                "depth": 5,
                "broker": "angel"
            }
        ],
        "message": "Subscription processing complete",
        "broker": "angel"
    }
    ```

   **Data Format**:
   ```json
    {
        "type": "market_data",
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "mode": 1,
        "broker": "angel",
        "data": {
            "ltp": 1428.6,
            "ltt": 1753094266000,
            "symbol": "RELIANCE",
            "exchange": "NSE",
            "mode": 1,
            "timestamp": 1753128420862
        }
    }
   ```

2. **Quotes - Mode 2**
   
   Subscribe:
   ```json
   {
       "action": "subscribe",
       "symbol": "SBIN",
       "exchange": "NSE",
       "mode": 2
   }
   ```
   
   Data Format:
   ```json
    {
        "type": "market_data",
        "symbol": "SBIN",
        "exchange": "NSE",
        "mode": 2,
        "broker": "angel",
        "data": {
            "ltp": 824.2,
            "ltt": 1753094266000,
            "volume": 8852594,
            "open": 823.0,
            "high": 827.35,
            "low": 817.95,
            "close": 823.35,
            "last_quantity": 1,
            "average_price": 823.65,
            "total_buy_quantity": 340.0,
            "total_sell_quantity": 0.0,
            "symbol": "SBIN",
            "exchange": "NSE",
            "mode": 2,
            "timestamp": 1753128844442
        }
    }
   ```

3. **Market Depth - Mode 3**
   
   Subscribe:
   ```json
   {
       "action": "subscribe",
       "symbol": "RELIANCE",
       "exchange": "NSE",
       "mode": 3,
       "depth_level": 5
   }
   ```
   
   Data Format:
   ```json
    {
        "type": "market_data",
        "symbol": "HDFCBANK",
        "exchange": "NSE",
        "mode": 3,
        "broker": "angel",
        "data": {
            "ltp": 2000.5,
            "ltt": 1753094266000,
            "volume": 11154539,
            "open": 0.0,
            "high": 0.0,
            "low": 0.0,
            "close": 0.0,
            "oi": 167598750,
            "upper_circuit": 2153.1,
            "lower_circuit": 1761.7,
            "depth": {
                "buy": [
                    {
                        "price": 2000.5,
                        "quantity": 1120,
                        "orders": 36
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    }
                ],
                "sell": [
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    },
                    {
                        "price": 0,
                        "quantity": 0,
                        "orders": 0
                    }
                ]
            },
            "symbol": "HDFCBANK",
            "exchange": "NSE",
            "mode": 3,
            "timestamp": 1753128828842
        }
    }
   ```

### Unsubscribe

To unsubscribe from any stream:

```json
{
    "action": "unsubscribe",
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "mode": 1
}
```

Unsubscription Response:
```json
{
    "type": "unsubscribe",
    "status": "success",
    "message": "Unsubscription processing complete",
    "successful": [
        {
            "symbol": "RELIANCE",
            "exchange": "NSE",
            "status": "success",
            "broker": "angel"
        }
    ],
    "failed": [],
    "broker": "angel"
}
```

### Error Handling

WebSocket errors are sent in this format:

```json
{
    "type": "error",
    "code": "INVALID_SYMBOL",
    "message": "Symbol not found"
}
```

### Heartbeat

Send periodic ping messages to keep connection alive:

```json
{
    "action": "ping"
}
```

Response:
```json
{
    "type": "pong",
    "timestamp": 1640995200000
}
```

### Connection Best Practices

1. **Implement Auto-reconnect**: Handle disconnections gracefully
2. **Batch Subscriptions**: Subscribe to multiple symbols in groups
3. **Handle Backpressure**: Process messages efficiently
4. **Monitor Connection Health**: Use heartbeat/ping-pong
5. **Unsubscribe Unused Symbols**: Free up resources

---

## Strategy Management

OpenAlgo provides a powerful Strategy Management Module for automating trading strategies using webhooks.

### Strategy Setup

1. **Create Strategy**: Register your strategy in OpenAlgo dashboard
2. **Get Webhook ID**: Unique ID for your strategy
3. **Configure Parameters**: Set position sizing, timing, and auto square-off rules
4. **Send Signals**: Use webhook endpoint to trigger orders

### Strategy Order Endpoint

**Endpoint**: `POST /strategy/order`

**Headers**:
```json
{
    "Content-Type": "application/json",
    "X-Webhook-ID": "your-webhook-id"
}
```

**Request Body**:
```json
{
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "action": "BUY",
    "quantity": 1,
    "position_size": 10
}
```

**Parameters**:
- `symbol`: Trading symbol
- `exchange`: Exchange (optional if configured in strategy)
- `action`: BUY/SELL
- `quantity`: Order quantity (0 to close position)
- `position_size`: Target position size (for BOTH mode)

### Strategy Modes

1. **LONG Only**: Only takes long positions
2. **SHORT Only**: Only takes short positions
3. **BOTH**: Can take both long and short positions

### Position Management

- **Open Position**: Send BUY/SELL with quantity > 0
- **Close Position**: Send opposite action with quantity = 0
- **Smart Sizing**: Automatically adjusts quantity based on existing position

### Auto Square-Off

Configure automatic position closure:
- **Time-based**: Square off at specified time
- **Target/Stoploss**: Exit on profit/loss levels
- **EOD Square-off**: Close all positions before market close

---

## Error Handling

All API endpoints return standard HTTP status codes and consistent error responses:

### HTTP Status Codes

- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (invalid API key)
- `403`: Forbidden (access denied)
- `404`: Not Found (endpoint or resource not found)
- `422`: Unprocessable Entity (validation error)
- `429`: Rate Limit Exceeded
- `500`: Internal Server Error
- `502`: Bad Gateway (broker API error)
- `503`: Service Unavailable

### Error Response Format

```json
{
    "status": "error",
    "message": "Human-readable error message",
    "error_code": "ERROR_CODE",
    "details": {
        "field": "Additional error details if applicable"
    }
}
```

### Common Error Codes

- `INVALID_API_KEY`: API key is invalid or expired
- `INVALID_SYMBOL`: Symbol not found or invalid for exchange
- `INVALID_EXCHANGE`: Exchange code not supported
- `INVALID_ORDER_TYPE`: Invalid price type or product type
- `INSUFFICIENT_FUNDS`: Not enough margin/funds
- `ORDER_NOT_FOUND`: Order ID not found
- `POSITION_NOT_FOUND`: No position exists for symbol
- `MARKET_CLOSED`: Market is closed for trading
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `BROKER_ERROR`: Error from broker API

### Example Error Responses

Invalid API Key:
```json
{
    "status": "error",
    "message": "Invalid API key",
    "error_code": "INVALID_API_KEY"
}
```

Invalid Symbol:
```json
{
    "status": "error",
    "message": "Symbol INVALID not found in NSE",
    "error_code": "INVALID_SYMBOL",
    "details": {
        "symbol": "INVALID",
        "exchange": "NSE"
    }
}
```

---

## Rate Limits

API calls are rate-limited to prevent abuse and ensure fair usage:

### Default Limits

- **API Calls**: 10 requests per second per API key
- **Order Placement**: 10 orders per second
- **Data APIs**: 25 requests per second
- **WebSocket Connections**: 1 connection per API key
- **WebSocket Subscriptions**: 200 symbols per connection

### Rate Limit Headers

All API responses include rate limit information:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 8
X-RateLimit-Reset: 1640995200
```

### Rate Limit Response

When rate limit is exceeded:

```json
{
    "status": "error",
    "message": "Rate limit exceeded. Please try again later.",
    "error_code": "RATE_LIMIT_EXCEEDED",
    "retry_after": 60
}
```

### Best Practices

1. Implement exponential backoff for retries
2. Cache frequently accessed data
3. Use WebSocket for real-time data instead of polling
4. Batch operations where possible (basket orders)
5. Monitor rate limit headers

---

## Advanced Features

### 1. Analyzer Mode

OpenAlgo offers an Analyzer mode for testing strategies without placing real orders:

- **Purpose**: Validate strategy logic before live trading
- **Features**: 
  - Simulates order placement
  - Tracks virtual positions
  - Calculates theoretical P&L
  - Identifies logic errors
- **Usage**: Enable via `/api/v1/analyzer/toggle`

### 2. Multi-Broker Support

OpenAlgo supports multiple Indian brokers:

- **Supported Brokers**:
  - Zerodha
  - Angel One
  - Upstox
  - 5Paisa
  - Fyers
  - ICICI Direct
  - Kotak Securities
  - Dhan
  - Shoonya (Finvasia)
  - Flattrade
  - And more...

- **Unified API**: Same API interface works across all brokers
- **Broker-specific Features**: Automatically handled by OpenAlgo

### 3. Symbol Format

#### ✅ 1. Equity Symbol Format

**Format:**

```
[Base Symbol]
```

**Examples:**

- NSE: `INFY`, `SBIN`, `RELIANCE`
- BSE: `TATAMOTORS`, `HDFCBANK`, `MARUTI`

---

#### ✅ 2. Futures Symbol Format

**Format:**

```
[Base Symbol][DD][MMM][YY]FUT
```

**Recent Examples:**

- NSE Index Future: `NIFTY25JUL24FUT`
- NSE Stock Future: `RELIANCE25JUL24FUT`
- Currency Future: `USDINR30JUL24FUT`
- MCX Commodity Future: `CRUDEOILM20AUG24FUT`
- Bond Future: `726GS203330AUG24FUT`

---

#### ✅ 3. Options Symbol Format

**Format:**

```
[Base Symbol][DD][MMM][YY][Strike][CE|PE]
```

**Recent Examples:**

- NSE Index Option: `BANKNIFTY25JUL2447300CE`
- NSE Stock Option: `TATAMOTORS25JUL24500CE`
- Currency Option: `USDINR30JUL2483.5PE`
- MCX Option: `CRUDEOIL14AUG247100CE`
- Bond Option: `726GS203230AUG2497PE`

---

#### ✅ 4. Common Index Symbols (OpenAlgo Standard)

**NSE\_INDEX:**

- `NIFTY`
- `BANKNIFTY`
- `FINNIFTY`
- `MIDCPNIFTY`
- `NIFTYNXT50`

**BSE\_INDEX:**

- `SENSEX`
- `BANKEX`
- `SENSEX50`

---

#### ✅ 5. Supported Exchange Identifiers

| Exchange Code | Description              |
| ------------- | ------------------------ |
| `NSE`         | NSE Equity               |
| `BSE`         | BSE Equity               |
| `NFO`         | NSE Futures & Options    |
| `BFO`         | BSE Futures & Options    |
| `CDS`         | NSE Currency             |
| `BCD`         | BSE Currency             |
| `MCX`         | Multi Commodity Exchange |
| `NCDEX`       | NCDEX Commodity Exchange |
| `NSE_INDEX`   | NSE Indices              |
| `BSE_INDEX`   | BSE Indices              |

---

### 4. Performance Monitoring

OpenAlgo provides built-in monitoring tools:

**Latency Monitoring** (`/latency`):
- Order execution RTT (Round Trip Time)
- Broker-wise performance comparison
- Time-based analysis

**Traffic Monitoring** (`/traffic`):
- API request statistics
- Endpoint-wise usage
- Error rate tracking
- Success/failure ratios

### 5. Order Validation

Automatic validation before order placement:

- **Symbol Validation**: Checks if symbol exists
- **Price Validation**: Ensures prices are within circuit limits
- **Quantity Validation**: Checks lot sizes and freeze quantities
- **Margin Validation**: Verifies sufficient funds
- **Product Type Validation**: Ensures valid product for segment
- **Time Validation**: Checks market hours

## Security & Authentication

### API Key Management

1. **Generation**: 
   - API keys are auto-generated upon registration
   - Access via OpenAlgo dashboard
   - Keys are encrypted at rest using Fernet encryption

2. **Storage**:
   - Keys are hashed using Argon2 with pepper
   - Original keys shown only once during generation
   - Secure storage in SQLite database

3. **Best Practices**:
   - Rotate API keys regularly
   - Never share API keys publicly
   - Use environment variables for key storage
   - Implement IP whitelisting if available

### Session Security

- **Web Sessions**: Server-side sessions with secure cookies
- **Session Timeout**: Configurable timeout periods
- **CSRF Protection**: Built-in for web interface
- **Password Security**: Argon2 hashing for user passwords

### HTTPS/TLS

- Always use HTTPS in production
- TLS 1.2 or higher recommended
- Valid SSL certificates required for custom domains

---

## Platform Integration Examples

### TradingView Integration

```pinescript
//@version=5
strategy("OpenAlgo Strategy", overlay=true)

// Strategy logic here
if (longCondition)
    strategy.entry("Long", strategy.long)
    alert('{"symbol":"RELIANCE","action":"BUY","quantity":"1"}', alert.freq_once_per_bar)

if (shortCondition)
    strategy.entry("Short", strategy.short)
    alert('{"symbol":"RELIANCE","action":"SELL","quantity":"1"}', alert.freq_once_per_bar)
```

### Python Integration

```python
from openalgo import api

# Initialize client
client = api(api_key='your_api_key', host='http://127.0.0.1:5000')

# Place order
response = client.placeorder(
    strategy="Python Strategy",
    symbol="RELIANCE",
    exchange="NSE",
    action="BUY",
    quantity=1,
    price_type="MARKET",
    product="MIS"
)
```

### Amibroker Integration

```afl
// Amibroker AFL Code
api_url = "http://127.0.0.1:5000/api/v1/placeorder";
api_key = "your_api_key";

if (Buy[BarCount-1])
{
    placeid = InternetOpenURL(api_url + 
        "?apikey=" + api_key +
        "&symbol=" + Name() +
        "&action=BUY" +
        "&quantity=1");
}
```

---

## Best Practices

### 1. Order Management
- **Unique Strategy Names**: Use descriptive names for tracking
- **Position Sizing**: Implement risk management rules
- **Order Validation**: Always validate before submission
- **Error Recovery**: Handle failures gracefully

### 2. Data Handling
- **Cache Static Data**: Symbol details, intervals
- **Use WebSocket**: For real-time data needs
- **Batch Operations**: Use basket orders for multiple trades
- **Respect Rate Limits**: Monitor API usage

### 3. System Design
- **Modular Architecture**: Separate strategy logic from execution
- **Logging**: Comprehensive logging for debugging
- **Monitoring**: Track system health and performance
- **Backup Plans**: Have fallback mechanisms

### 4. Risk Management
- **Stop Loss**: Always use stop-loss orders
- **Position Limits**: Set maximum position sizes
- **Daily Limits**: Implement daily loss limits
- **Circuit Breakers**: Auto-halt on unusual activity

---

## Troubleshooting

### Common Issues

1. **Invalid API Key**
   - Verify key is correct
   - Check if key is active
   - Ensure proper formatting

2. **Symbol Not Found**
   - Use correct exchange format
   - Check symbol spelling
   - Verify symbol is tradeable

3. **Insufficient Funds**
   - Check available margin
   - Verify product type
   - Consider order value

4. **WebSocket Disconnection**
   - Implement auto-reconnect
   - Check network stability
   - Monitor heartbeat

### Debug Tips

1. Enable verbose logging
2. Use Analyzer mode for testing
3. Check broker-specific requirements
4. Monitor rate limit headers
5. Validate all parameters

---