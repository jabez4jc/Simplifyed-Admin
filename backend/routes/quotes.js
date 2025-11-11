import express from 'express';

const router = express.Router();

/**
 * POST /api/quotes
 * Get quote/LTP data for a symbol
 * Body: { exchange: "NSE", symbol: "RELIANCE" }
 */
router.post('/', async (req, res) => {
    try {
        const { exchange, symbol } = req.body;

        if (!exchange || !symbol) {
            return res.status(400).json({
                status: 'error',
                message: 'Exchange and symbol are required'
            });
        }

        // Get instance from query params or use first active instance
        const instanceId = req.query.instance_id;
        const { makeOpenAlgoRequest } = req.app.locals;
        const { dbAsync } = req.app.locals;

        let instance;
        if (instanceId) {
            instance = await dbAsync.get(
                'SELECT * FROM instances WHERE id = ? AND is_active = 1',
                [instanceId]
            );
        }

        if (!instance) {
            instance = await dbAsync.get(
                'SELECT * FROM instances WHERE is_primary_admin = 1 AND is_active = 1 LIMIT 1'
            );
        }

        if (!instance) {
            return res.status(400).json({
                status: 'error',
                message: 'No active trading instance found'
            });
        }

        // Make request to OpenAlgo quotes API
        const response = await makeOpenAlgoRequest(instance, '/quotes', 'POST', {
            exchange,
            symbol
        });

        if (response && response.data) {
            return res.json({
                status: 'success',
                data: {
                    ltp: response.data.ltp,
                    open: response.data.open,
                    high: response.data.high,
                    low: response.data.low,
                    close: response.data.close,
                    volume: response.data.volume,
                    timestamp: response.data.timestamp
                }
            });
        } else {
            return res.status(404).json({
                status: 'error',
                message: 'Quote data not found'
            });
        }
    } catch (error) {
        console.error('Error fetching quote:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch quote data',
            error: error.message
        });
    }
});

export default router;
