const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const expencesController = require('../controllers/Expences')

// Admin/Muneem: trigger daily update
router.post('/daily-update',  async (req, res) => {
  const result = await expencesController.dailyUpdate()
  return res.json(result)
})

module.exports = router
