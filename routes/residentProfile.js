const express = require('express')
const router = express.Router()
const { verifyToken } = require('../middleware/auth')
const userController = require('../controllers/User')

// PATCH /resident-profile/:rollNumber -> update roomNumber and/or phoneNumber
router.patch('/resident-profile/:rollNumber', verifyToken, userController.updateResidentProfile)

module.exports = router
