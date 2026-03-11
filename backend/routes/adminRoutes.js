const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');

// --- Broadcast Center Routes ---
router.post('/broadcast', verifyToken, adminController.sendBroadcast);
router.get('/broadcast/history', verifyToken, adminController.getBroadcastHistory);

// ...other admin routes...

module.exports = router;
