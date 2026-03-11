// --- CRM Promotion/Demotion Logic ---
exports.promoteToMember = async (req, res) => {
  const { vtu } = req.body;
  try {
    const tempRef = db.collection("temporary_roster").doc(vtu);
    const tempDoc = await tempRef.get();
    
    if (!tempDoc.exists) return res.status(404).json({ error: "Student not found in temporary list" });
    
    const studentData = tempDoc.data();

    // Move to Master Roster & Set Member status
    await db.collection("master_roster").doc(vtu).set({
      ...studentData,
      isGuest: false,
      promotedAt: Date.now(),
      promotedBy: req.user.email
    });

    await tempRef.delete(); // Remove the old entry
    if (global.ubaCache) global.ubaCache.lastUpdated = 0; // Reset cache to show changes

    res.json({ success: true, message: "Promoted to Member status!" });
  } catch (error) {
    res.status(500).json({ error: "Promotion failed" });
  }
};

exports.demoteToGuest = async (req, res) => {
  const { vtu } = req.body;
  try {
    const masterRef = db.collection("master_roster").doc(vtu);
    const masterDoc = await masterRef.get();
    
    if (!masterDoc.exists) return res.status(404).json({ error: "Student not found in Master Roster" });

    const studentData = masterDoc.data();

    // Back to temporary roster & Set Guest status
    await db.collection("temporary_roster").doc(vtu).set({
      ...studentData,
      isGuest: true,
      demotedAt: Date.now()
    });

    await masterRef.delete();
    if (global.ubaCache) global.ubaCache.lastUpdated = 0;

    res.json({ success: true, message: "Demoted to Guest status" });
  } catch (error) {
    res.status(500).json({ error: "Demotion failed" });
  }
};
// --- ADMIN BROADCAST CENTER & HISTORY ---
const onesignal = require('../utils/onesignal');

exports.sendBroadcast = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  try {
    const { targetTopic, title, body } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: "Title and Body are required." });

    // 1. Fire the push notification via OneSignal
    await onesignal.sendNotification(targetTopic || 'all_students', title, body, { type: 'admin_broadcast' });

    // 2. Save a permanent record to the Database History
    await db.collection("broadcast_history").add({
      title: title,
      body: body,
      targetTopic: targetTopic || 'all_students',
      sentBy: req.user.email,
      sentAt: Date.now()
    });

    return res.json({ success: true, message: "Broadcast sent successfully!" });
  } catch (error) {
    console.error("Broadcast Error:", error);
    return res.status(500).json({ success: false, message: "Failed to send broadcast." });
  }
};

exports.getBroadcastHistory = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ success: false, message: "Forbidden." });
  try {
    const snap = await db.collection("broadcast_history").orderBy("sentAt", "desc").limit(30).get();
    const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch history." });
  }
};
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

    // BASE FETCHES: These run every time.
    // Notice we added the count() aggregation here. It costs 1 read per 1000 users.
    const baseFetches = [
      db.collection("meetings").get(),
      db.collection("attendance").get(),
      db.collection("suspiciousLogs").get(),
      db.collection("users").count().get() 
    ];

    // HEAVY FETCH: Only fetch the full users collection if the frontend actually needs it
    if (!skipRoster) baseFetches.push(db.collection("users").get());

    const results = await Promise.all(baseFetches);
    
    // Unpack the results based on our array order
    const [meetingsSnap, attendanceSnap, suspSnap, usersCountSnap] = results;
    const usersSnap = skipRoster ? null : results[4];
    
    const meetings = meetingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const attendance = attendanceSnap.docs.map(doc => doc.data());
    const suspiciousLogs = suspSnap.docs.map(doc => doc.data());

    res.json({ 
      meetings, 
      attendance, 
      users: usersSnap ? usersSnap.docs.map(doc => doc.data()) : [], 
      suspiciousLogs,
      totalUsersCount: usersCountSnap.data().count, // Pass the cheap count to the frontend
      stats: { 
        totalMeetings: meetings.length, 
        totalAttendance: attendance.length, 
        activeMeetings: meetings.filter(m => m.status === 'active').length, 
        uniqueStudents: new Set(attendance.map(a => a.vtuNumber)).size 
      }
    });
  } catch (error) { 
    console.error("Get All Reports Error:", error);
    res.status(500).send(); 
  }
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

// --- TOMBSTONING & GARBAGE COLLECTION (FEATURE 6) ---

// 1. Soft Delete (Hides data from users, tells caches to erase it)
exports.softDeleteMeeting = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { meetingId, isEmergency } = req.body;
    if (!meetingId) return res.status(400).json({ message: "Meeting ID required" });

    const collectionName = isEmergency ? "emergency_meetings" : "meetings";
    const attCollection = isEmergency ? "emergency_attendance" : "attendance";

    const batch = db.batch();
    const now = Date.now();

    // Tombstone the meeting
    const meetingRef = db.collection(collectionName).doc(meetingId);
    batch.update(meetingRef, { isDeleted: true, updatedAt: now });

    // Tombstone the attendance records
    const attQuery = await db.collection(attCollection).where("meetingId", "==", meetingId).get();
    attQuery.docs.forEach(doc => {
      batch.update(doc.ref, { isDeleted: true, updatedAt: now });
    });

    // Also tombstone pending excuses to clear the inbox
    const excuseQuery = await db.collection("pending_excuses").where("meetingId", "==", meetingId).get();
    excuseQuery.docs.forEach(doc => {
       batch.update(doc.ref, { isDeleted: true, updatedAt: now });
    });

    await batch.commit();
    res.json({ success: true, message: "Meeting archived successfully." });
  } catch (error) {
    console.error("Soft Delete Error:", error);
    res.status(500).json({ error: "Failed to archive session" });
  }
};

// 2. The Garbage Collector (Permanently destroys tombstoned data)
exports.emptyTrash = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const collections = ["meetings", "emergency_meetings", "attendance", "emergency_attendance", "pending_excuses"];
    const batch = db.batch();
    let deleteCount = 0;

    for (const col of collections) {
      const deadDocs = await db.collection(col).where("isDeleted", "==", true).get();
      deadDocs.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleteCount++;
      });
    }

    if (deleteCount === 0) return res.json({ success: true, message: "Trash is already empty." });

    await batch.commit();
    res.json({ success: true, message: `Permanently destroyed ${deleteCount} records.` });
  } catch (error) {
    console.error("Garbage Collection Error:", error);
    res.status(500).json({ error: "Failed to empty trash" });
  }
};

// --- CRM: CLUB MANAGEMENT ---
exports.promoteGuest = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { vtu } = req.body;
    const tempRef = db.collection("temporary_roster").doc(vtu);
    const masterRef = db.collection("master_roster").doc(vtu);
    
    const doc = await tempRef.get();
    if (!doc.exists) return res.status(404).json({ message: "Guest not found" });
    
    const userData = doc.data();
    delete userData.isGuest; // Strip the guest tag
    
    const batch = db.batch();
    batch.set(masterRef, { ...userData, updatedAt: Date.now() }, { merge: true });
    batch.delete(tempRef);
    await batch.commit();
    
    res.json({ success: true, message: "Promoted to Master Roster" });
  } catch (error) { res.status(500).json({ error: "Failed to promote" }); }
};

exports.demoteMember = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { vtu } = req.body;
    const tempRef = db.collection("temporary_roster").doc(vtu);
    const masterRef = db.collection("master_roster").doc(vtu);
    
    const doc = await masterRef.get();
    if (!doc.exists) return res.status(404).json({ message: "Member not found" });
    
    const userData = doc.data();
    
    const batch = db.batch();
    batch.set(tempRef, { ...userData, isGuest: true, updatedAt: Date.now() }, { merge: true });
    batch.delete(masterRef);
    await batch.commit();
    
    res.json({ success: true, message: "Demoted to Temporary Roster" });
  } catch (error) { res.status(500).json({ error: "Failed to demote" }); }
};

exports.addManualMember = async (req, res) => {
  if (req.user.role !== "head") return res.status(403).json({ message: "Forbidden" });
  try {
    const { vtu, name, dept, year, gender, phone } = req.body;
    const cleanVtu = vtu.toUpperCase().replace(/\D/g, '');
    await db.collection("master_roster").doc(cleanVtu).set({
      vtuNumber: cleanVtu, name, dept, year, gender, phone: phone || 'N/A', updatedAt: Date.now()
    }, { merge: true });
    res.json({ success: true, message: "Member Added" });
  } catch (error) { res.status(500).json({ error: "Failed to add member" }); }
};