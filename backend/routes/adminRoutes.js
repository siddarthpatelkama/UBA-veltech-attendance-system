const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');

// --- Broadcast Center Routes ---
router.post('/broadcast', verifyToken, adminController.sendBroadcast);
router.get('/broadcast/history', verifyToken, adminController.getBroadcastHistory);

// --- CRM Promotion/Demotion Routes ---
router.post('/crm/promote', verifyToken, adminController.promoteToMember);
router.post('/crm/demote', verifyToken, adminController.demoteToGuest);


// --- Global Device Reset ---
router.post('/global-device-reset', verifyToken, adminController.globalDeviceReset);

// ...other admin routes...

module.exports = router;
