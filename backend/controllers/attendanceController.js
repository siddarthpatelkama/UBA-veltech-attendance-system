const admin = require("../firebaseAdmin");
const db = require("../config/firebase");
const crypto = require("crypto");

/**
 * MARK ATTENDANCE
 * Fixed: Uses clean numeric VTU for security logs and document IDs
 */
exports.markAttendance = async (req, res) => {
  try {
    const { qrData, deviceId } = req.body;
    // CLEANER: Ensure student ID is numeric
    const studentVtu = req.user.vtuNumber.toString().replace(/\D/g, '');

    const decoded = JSON.parse(Buffer.from(qrData, 'base64').toString());
    const { meetingId, coordinatorEmail, timeSlot, token, phaseId } = decoded;

    const now = Date.now();
    const currentTimeSlot = Math.floor(now / 11000); 
    
    if (Math.abs(currentTimeSlot - timeSlot) > 1) {
      return res.status(401).json({ success: false, message: "QR Code Expired. Please scan fresh code." });
    }

    // This checks both possible names AND the hardcoded backup to match the frontend perfectly
    const secret = process.env.QR_SECRET || process.env.SECRET_KEY || 'uba_super_secret_key_123';
    const payloadString = `${meetingId}:${coordinatorEmail}:${timeSlot}${phaseId !== 'none' ? ':' + phaseId : ''}`;
    
    const expectedToken = crypto.createHash('sha256').update(payloadString + secret).digest('hex');

    if (token !== expectedToken) {
      return res.status(403).json({ success: false, message: "Invalid Security Token." });
    }

    const meetingDoc = await db.collection("meetings").doc(meetingId).get();
    if (!meetingDoc.exists || meetingDoc.data().status !== 'active') {
      return res.status(400).json({ success: false, message: "This session is no longer active." });
    }

    const safeDeviceId = deviceId || 'unknown_device';
    if (safeDeviceId !== 'unknown_device') {
       const sameDeviceScans = await db.collection("attendance")
         .where("meetingId", "==", meetingId)
         .where("deviceId", "==", safeDeviceId)
         .get();
       
       if (!sameDeviceScans.empty) {
         const previousScan = sameDeviceScans.docs[0].data();
         if (previousScan.vtuNumber !== studentVtu) {
            await db.collection("suspiciousLogs").add({
               meetingId, 
               meetingTitle: meetingDoc.data().title,
               deviceId: safeDeviceId, 
               proxyVtu: studentVtu, 
               originalVtu: previousScan.vtuNumber, 
               timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.status(403).json({ success: false, message: "PROXY BLOCKED: This phone was already used to scan attendance for someone else." });
         }
       }
    }

    const attendanceDocId = `${meetingId}_${studentVtu}`;
    const existingDoc = await db.collection("attendance").doc(attendanceDocId).get();
    
    if (existingDoc.exists) {
      return res.status(409).json({ success: false, message: "Attendance already recorded for this session." });
    }

    let studentData = null;
    let isGuest = false;

    // Check Master Roster with Clean Numeric ID
    let masterDoc = await db.collection("master_roster").doc(studentVtu).get();
    
    if (masterDoc.exists) {
      studentData = masterDoc.data();
    } else {
      const tempDoc = await db.collection("temporary_roster").doc(studentVtu).get();
      if (tempDoc.exists) {
        studentData = tempDoc.data();
        isGuest = true;
      } else {
        return res.status(403).json({ requiresSetup: true, message: "Unregistered VTU. Please complete your guest profile." });
      }
    }

    await db.collection("attendance").doc(attendanceDocId).set({
      meetingId,
      vtuNumber: studentVtu,
      studentName: studentData.name || req.user.name,
      dept: studentData.dept || 'N/A',
      year: studentData.year || 'N/A',
      isGuest: isGuest,
      deviceId: safeDeviceId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dateString: new Date().toLocaleString(),
      phaseId: phaseId || 'none'
    });

    return res.json({ success: true, message: "Attendance Verified Successfully! 🧡" });

  } catch (error) {
    console.error("Attendance Error:", error);
    return res.status(500).json({ success: false, message: "Verification system error." });
  }
};

/**
 * COMPLETE PROFILE
 */
exports.completeProfile = async (req, res) => {
  try {
    // FIX: Extract 'name' from req.body sent by the updated frontend
    const { name, dept, year, gender, phone } = req.body;
    const vtu = req.user.vtuNumber.toString().replace(/\D/g, '');

    const profileData = {
      vtuNumber: vtu,
      name: name || req.user.name, // Will use their preferred name, fallback to Google name if empty
      email: req.user.email,
      dept,
      year,
      gender,
      phone,
      isGuest: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("temporary_roster").doc(vtu).set(profileData, { merge: true });
    await db.collection("users").doc(req.user.email).set({ ...profileData, profileCompleted: true }, { merge: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).send();
  }
};

/**
 * GET USER PROFILE
 */
exports.getUserProfile = async (req, res) => {
  try {
    const email = req.user.email;
    const vtuFromToken = req.user.vtuNumber ? req.user.vtuNumber.toString().replace(/\D/g, '') : '';
    const vtuFromEmail = email.split('@')[0].replace(/\D/g, '');
    const vtu = vtuFromToken || vtuFromEmail;
    
    // 1. Check Master Roster
    let masterDoc = await db.collection("master_roster").doc(vtu).get();
    if (masterDoc.exists) return res.json(masterDoc.data());

    // 2. Check Temporary Roster
    const tempDoc = await db.collection("temporary_roster").doc(vtu).get();
    if (tempDoc.exists) return res.json(tempDoc.data());

    // 3. Fallback to Users Collection
    const userDoc = await db.collection("users").doc(email).get();
    if (userDoc.exists) {
        const uData = userDoc.data();
        if (uData.dept && uData.year) return res.json(uData);
    }

    res.json({});
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    res.status(500).send();
  }
};

/**
 * GET STUDENT HISTORY
 */
exports.getStudentHistory = async (req, res) => {
  try {
    const vtu = req.user.vtuNumber.toString().replace(/\D/g, '');
    
    // 1. Get raw attendance logs for this student
    const historySnap = await db.collection("attendance").where("vtuNumber", "==", vtu).get();
    const rawHistory = historySnap.docs.map(doc => doc.data());

    // 2. Fetch corresponding meeting details to get Title and Coordinator Name
    const enrichedHistory = await Promise.all(rawHistory.map(async (record) => {
      let meetingTitle = "Unknown Session";
      let coordinatorName = "Unknown Coordinator";
      
      try {
        const meetingDoc = await db.collection("meetings").doc(record.meetingId).get();
        if (meetingDoc.exists) {
          const mData = meetingDoc.data();
          meetingTitle = mData.title || "Field Session";
          coordinatorName = mData.createdByName || mData.coordinatorId || "Coordinator";
        }
      } catch (err) {}

      return {
        ...record,
        meetingTitle,
        coordinatorName
      };
    }));

    // Sort history newest first
    enrichedHistory.sort((a, b) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp || 0);
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp || 0);
      return timeB - timeA;
    });

    // 3. Generate Leaderboard
    const allAttendance = await db.collection("attendance").get();
    const counts = {};
    allAttendance.docs.forEach(doc => {
      const data = doc.data();
      counts[data.vtuNumber] = (counts[data.vtuNumber] || 0) + 1;
    });

    const leaderboard = Object.keys(counts).map(vtuNum => ({
      vtuNumber: vtuNum,
      count: counts[vtuNum]
    })).sort((a, b) => b.count - a.count);

    res.json({ history: enrichedHistory, leaderboard });
  } catch (error) {
    res.status(500).send();
  }
};