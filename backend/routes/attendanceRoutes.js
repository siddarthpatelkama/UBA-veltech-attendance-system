const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");
const meetingController = require("../controllers/meetingController");
const adminController = require("../controllers/adminController");
const { verifyToken } = require("../middleware/authMiddleware");

console.log("[ROUTES] Syncing All UBA Routes (Master Roster & Offline Sync Enabled)...");

// --- IDENTITY ---
router.get("/whoami", verifyToken, (req, res) => {
  res.json({ 
    role: req.user.role, 
    email: req.user.email, 
    name: req.user.name,
    vtuNumber: req.user.vtuNumber,
    currentDeviceId: req.user.currentDeviceId,     
    registeredDeviceId: req.user.registeredDeviceId 
  });
});

// --- PROFILE & HISTORY ---
router.post("/complete-profile", verifyToken, attendanceController.completeProfile);
router.get("/user-profile", verifyToken, attendanceController.getUserProfile);
router.get("/history", verifyToken, attendanceController.getStudentHistory);

// --- MEETING MANAGEMENT ---
router.get("/meetings", verifyToken, meetingController.getMeetings);
router.post("/meeting/create", verifyToken, meetingController.createMeeting);
router.post("/meeting/close", verifyToken, meetingController.closeAttendance);
router.get("/meeting/stats/:id", verifyToken, meetingController.getLiveStats);

// --- VERIFIABLE EVENT ROUTES & OFFLINE SYNC ---
router.post("/meeting/update-manifest", verifyToken, meetingController.updateManifest);
router.post("/meeting/create-phase", verifyToken, meetingController.createPhase);
router.post("/meeting/close-phase", verifyToken, meetingController.closePhase);

// Endpoint to receive bulk offline scans when Student Coordinators return to Wi-Fi
router.post("/meeting/offline-sync", verifyToken, meetingController.syncOfflineAttendance);

// Emergency Portal batch dump — routes to emergency_meetings & emergency_attendance
router.post("/meeting/emergency-sync", verifyToken, meetingController.syncEmergencyData);

// --- ATTENDANCE ---
router.post("/mark-attendance", verifyToken, attendanceController.markAttendance);

// --- FACULTY COORDINATOR HQ (Admin Only) ---
router.get("/admin/list-coordinators", verifyToken, adminController.listCoordinators);
router.post("/admin/add-coordinator", verifyToken, adminController.addCoordinator);
router.post("/admin/remove-coordinator", verifyToken, adminController.removeCoordinator);
router.get("/admin/all-reports", verifyToken, adminController.getAllReports);
router.get("/admin/emergency-reports", verifyToken, adminController.getEmergencyReports);
router.post("/admin/delete-meeting", verifyToken, adminController.deleteMeeting); 

// NEW: Endpoint for Resetting Student Device Binding
router.post("/admin/reset-device", verifyToken, adminController.resetDeviceLock);

// --- MASTER ROSTER MANAGEMENT ---
router.post("/admin/master-roster/upload", verifyToken, adminController.uploadMasterRoster);
router.post("/admin/master-roster/purge", verifyToken, adminController.purgeMasterRoster);

module.exports = router;