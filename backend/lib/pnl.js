// Pure P&L helper functions extracted from server.js
// Keep these functions free of side-effects so they are easy to unit-test.

export function calculateRealizedPnL(trades) {
  const grouped = {};

  for (let trade of trades) {
    const { symbol, action, price, quantity } = trade;
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantity);

    if (!grouped[symbol]) {
      grouped[symbol] = { buyQty: 0, buySum: 0, sellQty: 0, sellSum: 0 };
    }

    if (action === 'BUY') {
      grouped[symbol].buyQty += parsedQuantity;
      grouped[symbol].buySum += parsedPrice * parsedQuantity;
    } else if (action === 'SELL') {
      grouped[symbol].sellQty += parsedQuantity;
      grouped[symbol].sellSum += parsedPrice * parsedQuantity;
    }
  }

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

export function calculateUnrealizedPnL(positions) {
  const unrealizedPnL = {};
  for (let position of positions) {
    unrealizedPnL[position.symbol] = parseFloat(position.pnl || 0);
  }
  return unrealizedPnL;
}
