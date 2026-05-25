const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const rebaitController = require('../controllers/Rebait')

// Create rebait - allow authenticated users or admins
router.post('/addRebait', verifyToken,requireRole(["RESIDENT"]), rebaitController.createRebait);

module.exports = router
