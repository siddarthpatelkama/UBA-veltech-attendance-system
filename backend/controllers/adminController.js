const admin = require("../firebaseAdmin");
const db = require("../config/firebase");

/**
 * MASTER ROSTER UPLOAD
 * Fixed: Now automatically strips "VTU" prefix and non-numeric chars from IDs
 */
exports.uploadMasterRoster = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  
  try {
    const { students } = req.body; 
    
    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ error: "Invalid student data format" });
    }

    const batch = db.batch();
    
    students.forEach((student) => {
      // UNIVERSAL CLEANER: "VTU28319" -> "28319"
      const cleanVtu = student.vtuNumber.toString().replace(/\D/g, '').trim();
      if (!cleanVtu) return;

      const studentRef = db.collection("master_roster").doc(cleanVtu);
      
      batch.set(studentRef, {
        ...student,
        vtuNumber: cleanVtu,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
    console.log(`[ADMIN] Master Roster updated with ${students.length} students.`);
    res.json({ success: true, message: `Successfully updated ${students.length} students.` });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Failed to upload master roster" });
  }
};

/**
 * RESET DEVICE LOCK
 * NEW: Allows Admins to wipe a student's phone binding
 */
exports.resetDeviceLock = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Student email required" });

    const userRef = db.collection("users").doc(email.toLowerCase().trim());
    const doc = await userRef.get();

    if (!doc.exists) return res.status(404).json({ message: "User not found" });

    // Wipe the registeredDeviceId field
    await userRef.update({
        registeredDeviceId: admin.firestore.FieldValue.delete()
    });

    console.log(`[ADMIN] Device lock reset for ${email}`);
    res.json({ success: true, message: "Device lock removed successfully." });
  } catch (error) {
    console.error("Reset Device Error:", error);
    res.status(500).json({ error: "Internal server error during reset" });
  }
};

/**
 * YEARLY PURGE
 */
exports.purgeMasterRoster = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  
  try {
    const { year } = req.body;
    const snapshot = await db.collection("master_roster")
      .where("year", "==", year.toString())
      .get();

    if (snapshot.empty) {
      return res.json({ message: `No students found for Year ${year}.` });
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    
    await batch.commit();
    res.json({ success: true, message: `Successfully purged Year ${year} students.` });
  } catch (error) {
    console.error("Purge Error:", error);
    res.status(500).json({ error: "Purge failed" });
  }
};

/**
 * LOW-INTERNET SYNC
 */
exports.syncOfflineAttendance = async (req, res) => {
  try {
    const { scans } = req.body; 
    const results = { success: 0, failed: 0 };

    for (const scan of scans) {
      const meetingDoc = await db.collection("meetings").doc(scan.meetingId).get();
      if (!meetingDoc.exists) {
        results.failed++;
        continue;
      }

      // UNIVERSAL CLEANER for Offline Sync
      const vtuClean = scan.vtu.toString().replace(/\D/g, '').trim();
      const existing = await db.collection("attendance")
        .where("meetingId", "==", scan.meetingId)
        .where("vtuNumber", "==", vtuClean)
        .get();

      if (existing.empty) {
        await db.collection("attendance").add({
          meetingId: scan.meetingId,
          vtuNumber: vtuClean,
          studentName: scan.studentName || "Verified Student",
          timestamp: scan.timestamp, 
          isOfflineSync: true,
          dateString: new Date(scan.timestamp).toLocaleString()
        });
        results.success++;
      }
    }

    res.json({ message: "Sync complete", ...results });
  } catch (error) {
    console.error("Sync Error:", error);
    res.status(500).json({ error: "Sync processing failed" });
  }
};

/**
 * COORDINATOR MANAGEMENT
 */
exports.addCoordinator = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const batch = db.batch();

    batch.set(db.collection("admin").doc("authorized_coordinators"), {
      emails: admin.firestore.FieldValue.arrayUnion(cleanEmail)
    }, { merge: true });

    const coordRef = db.collection("coordinators").doc(cleanEmail);
    batch.set(coordRef, {
        email: cleanEmail,
        addedBy: req.user.email,
        addedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const userQuery = await db.collection("users").where("email", "==", cleanEmail).get();
    
    if (!userQuery.empty) {
      batch.update(userQuery.docs[0].ref, { role: "student_coordinator" });
    } else {
      const newUserRef = db.collection("users").doc(cleanEmail);
      batch.set(newUserRef, { 
        email: cleanEmail, 
        role: "student_coordinator",
        name: cleanEmail.split('@')[0].toUpperCase(),
        promotedBy: req.user.email 
      });
    }

    await batch.commit();
    res.json({ success: true, message: `Access granted to ${cleanEmail}` });
  } catch (error) { 
    console.error("Add Coordinator Error:", error);
    res.status(500).send(); 
  }
};

exports.removeCoordinator = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).send();
  try {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const batch = db.batch();

    batch.update(db.collection("admin").doc("authorized_coordinators"), {
      emails: admin.firestore.FieldValue.arrayRemove(cleanEmail)
    });

    batch.delete(db.collection("coordinators").doc(cleanEmail));

    const userQuery = await db.collection("users").where("email", "==", cleanEmail).get();
    if (!userQuery.empty) batch.update(userQuery.docs[0].ref, { role: "student" });

    await batch.commit();
    res.json({ success: true });
  } catch (error) { res.status(500).send(); }
};

exports.listCoordinators = async (req, res) => {
  try {
    const doc = await db.collection("admin").doc("authorized_coordinators").get();
    if (!doc.exists) return res.json({ coordinators: [] });
    res.json({ coordinators: doc.data()?.emails || [] });
  } catch (error) { res.status(500).send(); }
};

/**
 * REPORTS & ANALYTICS
 */
exports.getAllReports = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).send();
  try {
    const skipRoster = req.query.skipRoster === 'true';

    const baseFetches = [
      db.collection("meetings").get(),
      db.collection("attendance").get(),
      db.collection("suspiciousLogs").get()
    ];

    // Only fetch users collection if roster is needed
    if (!skipRoster) baseFetches.push(db.collection("users").get());

    const results = await Promise.all(baseFetches);
    const [meetingsSnap, attendanceSnap, suspSnap] = results;
    const usersSnap = skipRoster ? null : results[3];
    
    const meetings = meetingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const attendance = attendanceSnap.docs.map(doc => doc.data());
    const suspiciousLogs = suspSnap.docs.map(doc => doc.data());

    res.json({ 
      meetings, 
      attendance, 
      users: usersSnap ? usersSnap.docs.map(doc => doc.data()) : [], 
      suspiciousLogs,
      stats: { 
        totalMeetings: meetings.length, 
        totalAttendance: attendance.length, 
        activeMeetings: meetings.filter(m => m.status === 'active').length, 
        uniqueStudents: new Set(attendance.map(a => a.vtuNumber)).size 
      }
    });
  } catch (error) { res.status(500).send(); }
};

/**
 * EMERGENCY REPORTS — Fetch from emergency_meetings & emergency_attendance
 */
exports.getEmergencyReports = async (req, res) => {
  try {
    const [meetingsSnap, attendanceSnap] = await Promise.all([
      db.collection('emergency_meetings').get(),
      db.collection('emergency_attendance').get()
    ]);
    res.json({
      meetings: meetingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      attendance: attendanceSnap.docs.map(doc => doc.data())
    });
  } catch (error) {
    console.error('Emergency Reports Error:', error);
    res.status(500).json({ error: 'Failed to fetch emergency reports' });
  }
};

/**
 * HARD PURGE MEETING
 */
exports.deleteMeeting = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { meetingId } = req.body;
    if (!meetingId) return res.status(400).json({ message: "Meeting ID required" });

    await db.collection("meetings").doc(meetingId).delete();

    const attQuery = await db.collection("attendance").where("meetingId", "==", meetingId).get();
    const batch = db.batch();
    attQuery.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({ success: true, message: "Purged successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).send();
  }
};