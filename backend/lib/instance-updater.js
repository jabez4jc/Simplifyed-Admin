import getAccountPnL from './account-pnl.js';

// These functions are dependency-injected: callers must provide `dbAsync` and `makeRequest`.
// This keeps logic pure and easy to unit-test.

export async function autoSwitchToAnalyzer(instance, reason, dbAsync, makeRequest) {
  try {
    // Step 1: Close all open positions
    const closePayload = {};
    if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
      closePayload.strategy = instance.strategy_tag;
    }
    await makeRequest(instance, 'closeposition', 'POST', closePayload);

    // Step 2: Cancel all pending orders
    const cancelPayload = {};
    if (instance.strategy_tag && instance.strategy_tag.trim() !== '') {
      cancelPayload.strategy = instance.strategy_tag;
    }
    await makeRequest(instance, 'cancelallorder', 'POST', cancelPayload);

    // Step 3: Confirm no open positions
    const positionCheck = await makeRequest(instance, 'positionbook');
    if (positionCheck.status === 'success' && positionCheck.data && positionCheck.data.positions) {
      const openPositions = positionCheck.data.positions.filter(pos => parseFloat(pos.netqty || 0) !== 0);
      if (openPositions.length > 0) {
        throw new Error(`${openPositions.length} positions still open after close attempt`);
      }
    }

    // Step 4: Toggle analyzer mode
    const toggleResult = await makeRequest(instance, 'analyzer/toggle', 'POST', { mode: true });
    if (toggleResult.status !== 'success') {
      throw new Error('Failed to enable analyzer mode');
    }

    // Step 5: Verify analyzer mode
    const verifyResult = await makeRequest(instance, 'analyzer');
    if (verifyResult.status !== 'success' || verifyResult.data?.mode !== 'analyze') {
      throw new Error('Failed to verify analyzer mode activation');
    }

    // Update DB
    await dbAsync.run('UPDATE instances SET is_analyzer_mode = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [instance.id]);

    return { success: true, reason };
  } catch (error) {
    console.error(`❌ Auto Safe-Switch failed for instance ${instance.id}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function updateInstancesData(dbAsync, makeRequest) {
  try {
    const instances = await dbAsync.all('SELECT * FROM instances WHERE is_active = 1');

    for (const instance of instances) {
      try {
        const accountInfo = await makeRequest(instance, 'funds');
        if (accountInfo.status === 'success') {
          const balance = parseFloat(accountInfo.data?.availablecash || 0);

          const pnlData = await getAccountPnL(instance, makeRequest);
          const { realized_pnl, unrealized_pnl, total_pnl } = pnlData.accountTotals;

          const targetProfit = parseFloat(instance.target_profit) || 5000;
          const targetLoss = parseFloat(instance.target_loss) || 2000;

          if (total_pnl >= targetProfit && !instance.is_analyzer_mode) {
            await autoSwitchToAnalyzer(instance, 'Target profit reached', dbAsync, makeRequest);
          } else if (total_pnl <= -Math.abs(targetLoss) && !instance.is_analyzer_mode) {
            await autoSwitchToAnalyzer(instance, 'Max loss reached', dbAsync, makeRequest);
          }

          await dbAsync.run(
            'UPDATE instances SET current_balance = ?, current_pnl = ?, realized_pnl = ?, unrealized_pnl = ?, total_pnl = ?, is_active = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            [balance, total_pnl, realized_pnl, unrealized_pnl, total_pnl, instance.id]
          );
        }
      } catch (error) {
        console.error(`❌ Error updating instance ${instance.id}:`, error.message);
        await dbAsync.run('UPDATE instances SET is_active = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [instance.id]);
      }
    }
  } catch (error) {
    console.error('❌ Error in updateInstancesData:', error);
  }
}

export async function performHealthChecks(dbAsync, makeRequest) {
  try {
    const instances = await dbAsync.all('SELECT * FROM instances');
    for (const instance of instances) {
      try {
        const pingResult = await makeRequest(instance, 'ping');
        if (pingResult.status === 'success') {
          await dbAsync.run('UPDATE instances SET is_active = 1, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [instance.id]);
        } else {
          throw new Error('Health check failed - ping unsuccessful');
        }
      } catch (error) {
        console.error(`💔 Health check failed for instance ${instance.id}:`, error.message);
        await dbAsync.run('UPDATE instances SET is_active = 0, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [instance.id]);
      }
    }
  } catch (error) {
    console.error('❌ Error in performHealthChecks:', error);
  }
}

export default updateInstancesData;
