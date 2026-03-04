const admin = require("../firebaseAdmin");
const db = require("../config/firebase");

// --- SESSION CREATION ---
exports.createMeeting = async (req, res) => {
  try {
    // FIX: Added 'student_coordinator' to the VIP list so you don't get 403'd!
    if (req.user.role !== "coordinator" && req.user.role !== "head" && req.user.role !== "student_coordinator") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    let { title, type, isOfflineEnabled } = req.body;
    if (!title) return res.status(400).json({ success: false, message: "Title required" });

    // SMART NAMING
    const existing = await db.collection("meetings")
        .where("title", "==", title)
        .get();
        
    if (!existing.empty) {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
        title = `${title} (${timeStr})`;
    }

    const now = Date.now();
    const isVerifiable = type === 'verifiable';

    const meetingData = {
      title: title,
      type: isVerifiable ? 'verifiable' : 'standard',
      coordinatorId: req.user.email,
      createdByName: req.user.name || req.user.email.split('@')[0],
      status: "active",
      attendanceActive: !isVerifiable,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startTime: now,
      expiresAt: now + (60 * 60 * 1000), 
      isOfflineEnabled: isOfflineEnabled || false, 
      manifest: [], 
      phases: []
    };

    const meetingRef = await db.collection("meetings").add(meetingData);
    return res.status(201).json({ success: true, meetingId: meetingRef.id, title: title });
  } catch (error) {
    console.error("Create Meeting Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// --- MANIFEST UPDATER ---
exports.updateManifest = async (req, res) => {
  try {
    const { meetingId, action, students, vtu } = req.body;
    const meetingRef = db.collection("meetings").doc(meetingId);
    
    if (action === 'add_bulk') {
      await meetingRef.update({ manifest: admin.firestore.FieldValue.arrayUnion(...students) });
    } else if (action === 'add') {
      const cleanedVtu = vtu.toUpperCase().replace(/\D/g, '');
      await meetingRef.update({ manifest: admin.firestore.FieldValue.arrayUnion({ vtu: cleanedVtu, name: 'Manually Added', phone: '' }) });

      // Also write to attendance collection so live dashboard count increases
      const attendanceDocId = `${meetingId}_${cleanedVtu}`;
      await db.collection("attendance").doc(attendanceDocId).set({
        meetingId,
        vtuNumber: cleanedVtu,
        studentName: 'Manually Added',
        isOverride: true,
        enteredBy: req.user ? req.user.email : 'unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        dateString: new Date().toLocaleString(),
        phaseId: req.body.phaseId || 'none'
      }, { merge: true });
    } else if (action === 'remove') {
      const doc = await meetingRef.get();
      const newManifest = doc.data().manifest.filter(m => m.vtu !== vtu.toUpperCase());
      await meetingRef.update({ manifest: newManifest });
    }
    
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

// --- PHASE MANAGEMENT ---
exports.createPhase = async (req, res) => {
  try {
    const { meetingId, phaseTitle } = req.body;
    const now = Date.now();
    const newPhase = {
      id: "phase_" + now,
      title: phaseTitle,
      status: "active",
      startTime: now,
      endTime: now + (15 * 60 * 1000)
    };

    const meetingRef = db.collection("meetings").doc(meetingId);
    const doc = await meetingRef.get();
    const updatedPhases = (doc.data().phases || []).map(p => ({ ...p, status: 'closed' }));
    updatedPhases.push(newPhase);

    await meetingRef.update({ 
      phases: updatedPhases,
      attendanceActive: true
    });
    
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

exports.closePhase = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meetingRef = db.collection("meetings").doc(meetingId);
    const doc = await meetingRef.get();
    const updatedPhases = (doc.data().phases || []).map(p => ({ ...p, status: 'closed' }));
    
    await meetingRef.update({ phases: updatedPhases, attendanceActive: false });
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

// --- GLOBAL SESSION FETCHING ---
exports.getMeetings = async (req, res) => {
  try {
    const snapshot = await db.collection("meetings")
      .orderBy("createdAt", "desc")
      .limit(30) 
      .get();
      
    const meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const [attSnap, suspSnap, usersSnap, masterSnap, tempSnap] = await Promise.all([
      db.collection("attendance").get(),
      db.collection("suspiciousLogs").get(),
      db.collection("users").get(),
      db.collection("master_roster").get(),
      db.collection("temporary_roster").get()
    ]);

    // Merge all known identities: master roster, temporary roster, and users collection
    const mergedIdentitiesMap = new Map();

    masterSnap.docs.forEach(doc => {
      const data = doc.data();
      const vtuNumber = data.vtuNumber || doc.id;
      mergedIdentitiesMap.set(vtuNumber, { ...data, vtuNumber });
    });

    tempSnap.docs.forEach(doc => {
      const data = doc.data();
      const vtuNumber = data.vtuNumber || doc.id;
      if (!mergedIdentitiesMap.has(vtuNumber)) {
        mergedIdentitiesMap.set(vtuNumber, { ...data, vtuNumber });
      }
    });

    usersSnap.docs.forEach(doc => {
      const data = doc.data();
      const vtuNumber = data.vtuNumber || (data.email ? data.email.split('@')[0].replace(/\D/g, '') : undefined);
      if (vtuNumber && !mergedIdentitiesMap.has(vtuNumber)) {
        mergedIdentitiesMap.set(vtuNumber, { ...data, vtuNumber });
      }
    });

    const mergedUsers = Array.from(mergedIdentitiesMap.values());

    return res.json({ 
      success: true, 
      meetings, 
      attendance: attSnap.docs.map(doc => doc.data()), 
      suspiciousLogs: suspSnap.docs.map(doc => doc.data()), 
      users: mergedUsers
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching sessions" });
  }
};

// --- SEVERED-CONNECTION SYNC (with Emergency Routing) ---
exports.syncOfflineAttendance = async (req, res) => {
  try {
    const { scans } = req.body;

    if (!scans || !Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({ error: "No scans provided for sync" });
    }

    const batch = db.batch();

    for (const scan of scans) {
      if (scan.isEmergency) {
        // 🚨 EMERGENCY ROUTING: Send to completely separate tables

        // 1. Create/Merge Emergency Meeting Record
        const emergencyMeetingRef = db.collection('emergency_meetings').doc(scan.meetingId);
        batch.set(emergencyMeetingRef, {
          id: scan.meetingId,
          title: scan.meetingTitle || 'Emergency Offline Session',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isEmergency: true,
          coordinatorId: scan.enteredBy || 'Offline_Coord'
        }, { merge: true });

        // 2. Log Student in Emergency Attendance
        const emergencyAttendanceRef = db.collection('emergency_attendance').doc(`${scan.meetingId}_${scan.vtu}`);
        batch.set(emergencyAttendanceRef, {
          meetingId: scan.meetingId,
          vtuNumber: scan.vtu,
          studentName: scan.studentName || 'Unknown',
          timestamp: scan.timestamp || Date.now(),
          phaseId: scan.phaseId || 'none',
          isOverride: scan.isOverride || false,
          enteredBy: scan.enteredBy || 'Offline_Coord',
          emergencyDeviceId: scan.emergencyDeviceId || 'N/A',
          isEmergency: true
        }, { merge: true });

      } else {
        // 🟢 STANDARD ROUTING: Normal offline vault logic

        // 1. Update standard meeting timestamp
        const meetingRef = db.collection('meetings').doc(scan.meetingId);
        batch.set(meetingRef, {
          lastOfflineSync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. Log Student in Standard Attendance
        const attendanceRef = db.collection('attendance').doc(`${scan.meetingId}_${scan.vtu}_${scan.phaseId || 'none'}`);
        batch.set(attendanceRef, {
          meetingId: scan.meetingId,
          vtuNumber: scan.vtu,
          studentName: scan.studentName || 'Unknown',
          timestamp: scan.timestamp || Date.now(),
          phaseId: scan.phaseId || 'none',
          isOverride: scan.isOverride || false,
          enteredBy: scan.enteredBy || 'System'
        }, { merge: true });
      }
    }

    // Commit all writes simultaneously (Costs only 1 network request!)
    await batch.commit();

    res.status(200).json({ message: "Cloud Sync successful, emergency data routed correctly." });

  } catch (error) {
    console.error("Critical Offline Sync Error:", error);
    res.status(500).json({ error: "Failed to sync offline scans." });
  }
};

// --- SESSION CLOSING ---
exports.closeAttendance = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meetingRef = db.collection("meetings").doc(meetingId);
    const doc = await meetingRef.get();
    const updatedPhases = (doc.data().phases || []).map(p => ({ ...p, status: 'closed' }));

    await meetingRef.update({
      status: "closed",
      attendanceActive: false,
      phases: updatedPhases,
      closedBy: req.user.email,
      closedByName: req.user.name || req.user.email.split('@')[0],
      closedAt: Date.now()
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
};

// --- LIVE STATS ---
exports.getLiveStats = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection("attendance").where("meetingId", "==", id).get();
    res.json({ total: snap.size });
  } catch (e) { res.status(500).send(); }
};