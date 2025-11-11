import express from 'express';
import OrderPlacementService from '../lib/order-placement-service.js';

const router = express.Router();

// Initialize the order placement service
const orderPlacementService = new OrderPlacementService();

/**
 * Generate options contract symbol from underlying symbol
 * POST /api/options/generate-symbol
 * Body: { underlying: "NIFTY", option_type: "CE", strike_offset: "ATM", expiry_mode: "AUTO" }
 */
router.post('/generate-symbol', async (req, res) => {
  try {
    const { underlying, option_type, strike_offset, expiry_mode = 'AUTO' } = req.body;

    // Validate required fields
    if (!underlying || !option_type || !strike_offset) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: underlying, option_type, strike_offset'
      });
    }

    // Validate option_type
    if (!['CE', 'PE'].includes(option_type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'option_type must be either CE or PE'
      });
    }

    // Generate options symbol using the service
    const result = await orderPlacementService.generateOptionsSymbol({
      underlying,
      option_type,
      strike_offset,
      expiry_mode
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error generating options symbol:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate options symbol'
    });
  }
});

export default router;
