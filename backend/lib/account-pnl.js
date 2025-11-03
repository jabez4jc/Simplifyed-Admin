import { calculateRealizedPnL, calculateUnrealizedPnL } from './pnl.js';

// getAccountPnL is written as a pure function that depends on a request function
// (dependency injection) so it can be unit-tested without network calls.
export async function getAccountPnL(instance, makeRequest) {
  try {
    // Get tradebook data for realized P&L
    const tradesResp = await makeRequest(instance, 'tradebook');
    const trades = (tradesResp && tradesResp.status === 'success' && tradesResp.data && tradesResp.data.trades)
      ? tradesResp.data.trades : [];

    // Get positionbook data for unrealized P&L
    const positionsResp = await makeRequest(instance, 'positionbook');
    const positions = (positionsResp && positionsResp.status === 'success' && positionsResp.data && positionsResp.data.positions)
      ? positionsResp.data.positions : [];

    const realized = calculateRealizedPnL(trades);
    const unrealized = calculateUnrealizedPnL(positions);

    const symbols = new Set([...Object.keys(realized), ...Object.keys(unrealized)]);
    const perSymbol = [];
    let totalRealized = 0, totalUnrealized = 0;

    for (let symbol of symbols) {
      const r = realized[symbol] || 0;
      const u = unrealized[symbol] || 0;
      perSymbol.push({ symbol, realized_pnl: r, unrealized_pnl: u, total_pnl: r + u });
      totalRealized += r;
      totalUnrealized += u;
    }

    const accountTotals = {
      realized_pnl: totalRealized,
      unrealized_pnl: totalUnrealized,
      total_pnl: totalRealized + totalUnrealized
    };

    return { perSymbol, accountTotals };
  } catch (error) {
    // Fallback: try getting only positions
    try {
      const positionsResp = await makeRequest(instance, 'positionbook');
      const fallbackPnL = (positionsResp && positionsResp.status === 'success' && positionsResp.data && positionsResp.data.positions)
        ? positionsResp.data.positions.reduce((total, pos) => total + parseFloat(pos.pnl || 0), 0)
        : 0;

      return {
        perSymbol: [],
        accountTotals: {
          realized_pnl: 0,
          unrealized_pnl: fallbackPnL,
          total_pnl: fallbackPnL
        }
      };
    } catch (fallbackError) {
      return {
        perSymbol: [],
        accountTotals: { realized_pnl: 0, unrealized_pnl: 0, total_pnl: 0 }
      };
    }
  }
}

export default getAccountPnL;
