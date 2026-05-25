const express = require('express')
const { registerUser, loginUser, logoutUser } = require('../controllers/auth')
const { getUserDetails,getUnverifiedUsers,verifyUser } = require('../controllers/User')

const {verifyToken , requireRole} = require("../middleware/auth");

const router = express.Router();

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/logout', logoutUser)

// Admin work
router.get('/getUserDetails',verifyToken,requireRole(["ADMIN"]),getUserDetails);
router.get('/getPendingUser',verifyToken,requireRole(["ADMIN"]),getUnverifiedUsers);
router.patch('/verifyUser/:id',verifyToken,requireRole(["ADMIN"]),verifyUser);


module.exports = router