const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const feeController = require('../controllers/FeeConfig')

// Public: list and get
router.get('/fee-configs', feeController.getFeeConfigs)
router.get('/fee-config/:id', feeController.getFeeConfigById)

// Admin-only: create, update, deactivate
router.post('/fee-config', verifyToken, requireRole('ADMIN'), feeController.createFeeConfig)
router.patch('/fee-config/:id', verifyToken, requireRole('ADMIN'), feeController.updateFeeConfig)
router.patch('/fee-config/:id/deactivate', verifyToken, requireRole('ADMIN'), feeController.deactivateFeeConfig)

module.exports = router;