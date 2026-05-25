const express = require('express')
const router = express.Router()
const { verifyToken, requireRole } = require('../middleware/auth')
const extraController = require('../controllers/ExtraProduct')

// Muneem-only: create an extra product
router.post('/extra-product', verifyToken, requireRole(['MUNEEM']), extraController.createExtraProduct)

// Muneem-only: update an extra product
router.patch('/Update-extra-product/:id', verifyToken, requireRole(['MUNEEM']), extraController.updateExtraProduct)

// get all the extra product which are active
router.get('/getActiveExtraProduct',extraController.getAllActiveExtraProduct);

// User take the extra product via roll Number
router.post('/addExtraProduct', extraController.addExtraProduct);

module.exports = router
