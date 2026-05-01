const admin = require("../firebaseAdmin");
// --- THE RAM CACHE SHIELD ---
if (!global.ubaCache) {
  global.ubaCache = { meetings: [], attendance: [], suspiciousLogs: [], users: [], lastUpdated: 0 };
}
const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes
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
    if (global.ubaCache) global.ubaCache.lastUpdated = 0; // Spill bucket
    return res.status(201).json({ success: true, meetingId: meetingRef.id, title: title });
  } catch (error) {
    console.error("Create Meeting Error:", error);
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
      
      // 1. Check if they were in the expected CSV Manifest
      const doc = await meetingRef.get();
      const meetingData = doc.data();
      const manifestUser = meetingData.manifest && meetingData.manifest.find(m => String(m.vtu) === cleanedVtu);
      const isWalkIn = !manifestUser;

      // 1.5 Smart Name & Category Resolution
      const masterCheck = await db.collection("master_roster").doc(cleanedVtu).get();
      let autoCategory = req.body.category || 'Guest';
      let autoName = req.body.studentName;

      if (masterCheck.exists) {
         const mData = masterCheck.data();
         autoCategory = mData.isGuest ? 'Guest' : 'UBA Member';
         if (!autoName || autoName.includes('Guest ') || autoName.includes('Scanned: ') || autoName.includes('Manual: ')) {
             autoName = mData.name;
         }
      } else if (manifestUser && manifestUser.name) {
         if (!autoName || autoName.includes('Guest ') || autoName.includes('Scanned: ') || autoName.includes('Manual: ')) {
             autoName = manifestUser.name;
         }
      }
      
      const finalName = autoName || `Guest ${cleanedVtu}`;

      // 2. Write to Attendance
      const attendanceDocId = `${meetingId}_${cleanedVtu}`;
      await db.collection("attendance").doc(attendanceDocId).set({
        meetingId,
        vtuNumber: cleanedVtu,
        studentName: finalName,
        isOverride: req.body.isOverride || false,
        overrideCategory: autoCategory,
        isWalkIn: isWalkIn,
        enteredBy: req.user ? req.user.email : 'unknown',
        timestamp: Date.now(),
        dateString: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        phaseId: req.body.phaseId || 'none'
      }, { merge: true });

      // 3. The Temp Roster Fallback
      if (isWalkIn) {
        if (!masterCheck.exists) {
           await db.collection("temporary_roster").doc(cleanedVtu).set({
               vtuNumber: cleanedVtu,
               name: finalName,
               isGuest: true,
               addedAt: Date.now()
           }, { merge: true });
        }
      }
    } else if (action === 'remove') {
      const doc = await meetingRef.get();
      const newManifest = doc.data().manifest.filter(m => m.vtu !== vtu.toUpperCase());
      await meetingRef.update({ manifest: newManifest });
    }
    
    if (global.ubaCache) global.ubaCache.lastUpdated = 0;
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
    
    // --- SAFE PUSH NOTIFICATION BLOCK ---
    try {
      await admin.messaging().send({
        topic: 'all_students',
        notification: {
          title: `🔴 SESSION LIVE`,
          body: `${phaseTitle} has started! Open your app to scan.`
        },
        data: { type: 'live', meetingId: meetingId, phaseId: String(newPhase.id) }
      });
    } catch (pushError) {
      console.log("⚠️ Phase Live notification failed:", pushError.message);
    }
    // ------------------------------------

    if (global.ubaCache) global.ubaCache.lastUpdated = 0;
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
    if (global.ubaCache) global.ubaCache.lastUpdated = 0;
    return res.json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

// --- GLOBAL SESSION FETCHING ---
exports.getMeetings = async (req, res) => {
  try {
    const now = Date.now();
    const skipRoster = req.query.skipRoster === 'true';

    // 1. 🛡️ CHECK THE BUCKET FIRST (0 BLAZING FAST READS)
    if (global.ubaCache.lastUpdated > 0 && (now - global.ubaCache.lastUpdated < CACHE_DURATION)) {
       console.log("⚡ Serving Dashboard from RAM Cache (0 Firebase Reads!)");
       return res.json({
         success: true,
         meetings: global.ubaCache.meetings,
         attendance: global.ubaCache.attendance,
         suspiciousLogs: global.ubaCache.suspiciousLogs,
         users: skipRoster ? [] : global.ubaCache.users
       });
    }

    console.log("🐢 Cache Empty or Expired. Hitting Firebase (This should only happen once every 15 mins)...");

    // 2. FETCH FROM FIREBASE (Your original logic)
    const snapshot = await db.collection("meetings").orderBy("createdAt", "desc").limit(30).get();
    const meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // ⚡ FIX: Fetch attendance for the 10 most recent meetings (Active OR Closed)
    const recentMeetingIds = meetings.slice(0, 10).map(m => m.id);
    let attendanceDocs = [];
    if (recentMeetingIds.length > 0) {
      const attSnap = await db.collection("attendance").where("meetingId", "in", recentMeetingIds).get();
      attendanceDocs = attSnap.docs.map(doc => doc.data());
    }

    const suspSnap = await db.collection("suspiciousLogs").get();
    const suspiciousLogs = suspSnap.docs.map(doc => doc.data());

    let mergedUsers = [];
    if (!skipRoster) {
      const [usersSnap, masterSnap, tempSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("master_roster").get(),
        db.collection("temporary_roster").get()
      ]);

      const mergedIdentitiesMap = new Map();
      masterSnap.docs.forEach(doc => {
        const data = doc.data();
        mergedIdentitiesMap.set(data.vtuNumber || doc.id, { ...data, vtuNumber: data.vtuNumber || doc.id });
      });
      tempSnap.docs.forEach(doc => {
        const data = doc.data();
        if (!mergedIdentitiesMap.has(data.vtuNumber || doc.id)) mergedIdentitiesMap.set(data.vtuNumber || doc.id, { ...data, vtuNumber: data.vtuNumber || doc.id });
      });
      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        const vtu = data.vtuNumber || (data.email ? data.email.split('@')[0].replace(/\D/g, '') : undefined);
        if (vtu) {
          if (mergedIdentitiesMap.has(vtu)) {
            // MERGE live user data (FCM Tokens, Device IDs) into the Master Roster profile
            mergedIdentitiesMap.set(vtu, { ...mergedIdentitiesMap.get(vtu), ...data, vtuNumber: vtu });
          } else {
            mergedIdentitiesMap.set(vtu, { ...data, vtuNumber: vtu });
          }
        }
      });
      mergedUsers = Array.from(mergedIdentitiesMap.values());
    }

    // 3. 🪣 FILL THE BUCKET FOR THE NEXT PERSON
    global.ubaCache.meetings = meetings;
    global.ubaCache.attendance = attendanceDocs;
    global.ubaCache.suspiciousLogs = suspiciousLogs;
    if (!skipRoster) {
       global.ubaCache.users = mergedUsers;
    }
    global.ubaCache.lastUpdated = now;

    return res.json({ 
      success: true, 
      meetings, 
      attendance: attendanceDocs, 
      suspiciousLogs, 
      users: skipRoster ? [] : global.ubaCache.users
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

// --- SESSION CLOSING & STRIKE ENGINE (FEATURE 3) ---
exports.closeAttendance = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const meetingRef = db.collection("meetings").doc(meetingId);
    const meetingDoc = await meetingRef.get();

    if (!meetingDoc.exists) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    const meetingData = meetingDoc.data();
    const updatedPhases = (meetingData.phases || []).map(p => ({ ...p, status: 'closed' }));

    const batch = db.batch();

    // 1. Close the Meeting
    batch.update(meetingRef, {
      status: "closed",
      attendanceActive: false,
      phases: updatedPhases,
      closedBy: req.user.email,
      closedByName: req.user.name || req.user.email.split('@')[0],
      closedAt: Date.now()
    });

    // 2. STRIKE & DEMOTION PIPELINE (Verifiable Trips Only)
    if (meetingData.type === "verifiable" && meetingData.manifest && meetingData.manifest.length > 0) {

      // Normalize helper: strips all non-digits so "VTU32533" === "32533"
      const norm = (v) => String(v || '').replace(/\D/g, '');

      // Fetch all successful scans and normalize their VTUs
      const attendanceSnap = await db.collection("attendance").where("meetingId", "==", meetingId).get();
      const attendedVtus = new Set(attendanceSnap.docs.map(doc => norm(doc.data().vtuNumber)));

      // Find absences — normalize manifest VTU before comparing
      const missingStudents = meetingData.manifest.filter(m => !attendedVtus.has(norm(m.vtu)));

      for (const student of missingStudents) {
        const cleanVtu = norm(student.vtu);
        if (!cleanVtu) continue; // Skip malformed entries

        const masterRef = db.collection("master_roster").doc(cleanVtu);
        const masterDoc = await masterRef.get();

        if (masterDoc.exists) {
          const userData = masterDoc.data();
          const currentStrikes = (userData.strikes || 0) + 1;

          // Create the Pending Excuse Document (keyed by clean VTU)
          const excuseRef = db.collection("pending_excuses").doc(`${meetingId}_${cleanVtu}`);
          batch.set(excuseRef, {
            vtu: cleanVtu,
            meetingId: meetingId,
            eventTitle: meetingData.title,
            status: 'pending',
            createdAt: Date.now(),
            strikesAdded: 1
          });

          if (currentStrikes >= 3) {
            // Demote to Guest
            const tempRef = db.collection("temporary_roster").doc(cleanVtu);
            batch.set(tempRef, {
              ...userData,
              strikes: currentStrikes,
              isGuest: true,
              demotedAt: Date.now()
            }, { merge: true });
            batch.delete(masterRef);

            // FCM Demotion Alert (best-effort, won't crash close if it fails)
            try {
              await admin.messaging().send({
                topic: `student_${cleanVtu}`,
                notification: {
                  title: `🚨 UBA Account Demoted`,
                  body: `You have missed 3 events and have been removed from the Master Roster.`
                }
              });
            } catch (e) { console.warn(`[FCM] Demotion alert failed for ${cleanVtu}:`, e.message); }

          } else {
            // Update strike count
            batch.update(masterRef, { strikes: currentStrikes });

            // FCM Strike Warning
            try {
              await admin.messaging().send({
                topic: `student_${cleanVtu}`,
                notification: {
                  title: `⚠️ Strike Added (${currentStrikes}/3)`,
                  body: `You missed "${meetingData.title}". Submit an excuse with GPS immediately.`
                }
              });
            } catch (e) { console.warn(`[FCM] Strike alert failed for ${cleanVtu}:`, e.message); }
          }
        }
      }
    }

    await batch.commit();

    // --- FCM Trigger 4: Admin Analytics Summary ---
    if (meetingData.type === "verifiable" && meetingData.manifest) {
        const attendanceSnap2 = await db.collection("attendance").where("meetingId", "==", meetingId).get();
        const attendedCount = attendanceSnap2.size;
        const missingCount = (meetingData.manifest || []).length - attendedCount;
        try {
          await admin.messaging().send({
            topic: 'coordinators',
            notification: {
              title: `📊 Trip Closed: ${meetingData.title}`,
              body: `${attendedCount} Verified. ${missingCount} Missing. Strikes applied.`
            },
            data: { type: 'analytics', meetingId: String(meetingId) }
          });
        } catch (e) { console.log("⚠️ Admin summary push failed:", e.message); }
    }
    // ----------------------------------------------

    return res.json({ success: true, message: "Meeting closed and strike pipeline executed." });
  } catch (error) {
    console.error("Close Meeting Error:", error);
    return res.status(500).json({ success: false, message: "Failed to close session." });
  }
};

// --- EMERGENCY DATA DUMP (Batch Sync from Emergency Portal) ---
exports.syncEmergencyData = async (req, res) => {
  const { scans, sessions } = req.body;
  const batch = db.batch();

  try {
    // 1. Route Sessions to 'emergency_meetings'
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        const sessionRef = db.collection('emergency_meetings').doc(session.meetingId);
        batch.set(sessionRef, {
          ...session,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedBy: req.user.email
        });
      });
    }

    // 2. Route Scans to 'emergency_attendance'
    if (scans && scans.length > 0) {
      scans.forEach(scan => {
        const scanId = `${scan.meetingId}_${scan.vtu}`;
        const scanRef = db.collection('emergency_attendance').doc(scanId);
        batch.set(scanRef, {
          ...scan,
          syncedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    }

    await batch.commit();
    res.status(200).json({ message: "Emergency data dumped successfully" });
  } catch (error) {
    console.error("Emergency Sync Error:", error);
    res.status(500).json({ error: "Failed to sync emergency data" });
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

// --- EVENT SCHEDULING ---
exports.scheduleMeeting = async (req, res) => {
  try {
    if (req.user.role !== "head" && req.user.role !== "coordinator" && req.user.role !== "student_coordinator") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { title, date, time, venue, targetAudience, manifest, type } = req.body;
    if (!title || !date) return res.status(400).json({ success: false, message: "Title and Date required" });

    const meetingData = {
      title: title,
      date: date,
      time: time || "TBA",
      venue: venue || "TBA",
      targetAudience: targetAudience || [], // Array like ["2", "3"]
      manifest: manifest || [], // Expected CSV roster
      status: "scheduled",
      type: type || "standard", // ⚡ NOW GRABS THE TYPE FROM FRONTEND
      attendanceActive: false,
      coordinatorId: req.user.email,
      createdByName: req.user.name || req.user.email.split('@')[0],
      createdAt: Date.now()
    };

    const docRef = await db.collection("meetings").add(meetingData);
    // --- AUTOMATED FCM NOTIFICATION TRIGGER ---
    try {
      const notificationPayload = {
        notification: {
          title: `📅 New Event: ${title}`,
          body: `Scheduled for ${date || 'TBA'} at ${venue || 'TBA'}. Open the app for details!`,
        },
        android: { priority: 'high' },
        webpush: { 
          headers: { Urgency: 'high' }, 
          notification: { 
            icon: '/uba-logo.png',
            badge: '/uba-badge.png'
          } 
        }
      };

      if (!targetAudience || targetAudience.length === 0) {
        // Broadcast to everyone
        await admin.messaging().send({ ...notificationPayload, topic: 'all_students' });
        console.log(`[FCM-AUTO] Global meeting alert sent for: ${title}`);
      } else {
        // Target specific year topics (e.g., year_2, year_3)
        const sendPromises = targetAudience.map(year =>
          admin.messaging().send({ ...notificationPayload, topic: `year_${year}` })
        );
        await Promise.all(sendPromises);
        console.log(`[FCM-AUTO] Targeted alert sent to years: ${targetAudience.join(', ')}`);
      }
    } catch (pushError) {
      console.log("⚠️ FCM notification failed, but meeting was created successfully.", pushError.message);
    }
    // ------------------------------------------
    return res.status(201).json({ success: true, meetingId: docRef.id });
  } catch (error) {
    console.error("Schedule Error:", error);
    return res.status(500).json({ success: false, message: "Failed to schedule event" });
  }
};

// --- EXCUSE ENGINE (FEATURE 4) ---
exports.submitExcuse = async (req, res) => {
  try {
    const { meetingId, vtu, reason, lat, lng } = req.body;
    if (!meetingId || !vtu || !reason) return res.status(400).json({ error: "Missing fields" });

    const excuseId = `${meetingId}_${vtu}`;
    await db.collection("pending_excuses").doc(excuseId).set({
      reason, lat, lng,
      status: 'submitted', // Changes from 'pending' (auto-created) to 'submitted'
      submittedAt: Date.now()
    }, { merge: true });

    res.json({ success: true, message: "Excuse submitted" });
  } catch (error) { res.status(500).json({ error: "Failed to submit excuse" }); }
};

exports.resolveExcuse = async (req, res) => {
  if (req.user.role !== "head" && req.user.role !== "coordinator" && req.user.role !== "student_coordinator") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { excuseId, vtu, action } = req.body; // action: 'accept' or 'reject'
    const excuseRef = db.collection("pending_excuses").doc(excuseId);
    
    const batch = db.batch();
    batch.update(excuseRef, { status: action === 'accept' ? 'accepted' : 'rejected', resolvedAt: Date.now(), resolvedBy: req.user.email });

    if (action === 'accept') {
      const masterRef = db.collection("master_roster").doc(vtu);
      batch.update(masterRef, { strikes: admin.firestore.FieldValue.increment(-1) }); // Wipe the strike
    }

    await batch.commit();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: "Failed to resolve" }); }
};

// --- SECURITY PATCH: ISOLATED EXCUSE FETCHING ---
exports.getExcuses = async (req, res) => {
  try {
    let query = db.collection("pending_excuses").where("status", "in", ["pending", "submitted"]);
    
    // LOOPHOLE CLOSED: If user is a student, STRICTLY limit the query to their own VTU.
    if (req.user.role === "student") {
      const vtu = req.user.email.split('@')[0].toUpperCase().replace(/\D/g, '');
      query = query.where("vtu", "==", vtu);
    }
    
    const snap = await query.get();
    res.json({ success: true, excuses: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch excuses" }); 
  }
};

// --- ACTIVATE SCHEDULED MEETING ---
exports.activateScheduledMeeting = async (req, res) => {
  try {
    const { meetingId } = req.body;
    if (!meetingId) return res.status(400).json({ error: "Missing ID" });

    const meetingRef = db.collection("meetings").doc(meetingId);
    await meetingRef.update({
      status: "active",
      attendanceActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startTime: Date.now()
    });

    // --- SAFE PUSH NOTIFICATION BLOCK ---
    try {
      await admin.messaging().send({
        topic: 'all_students',
        notification: {
          title: `🔴 SESSION ACTIVATED`,
          body: `Session is now live! Open your app to scan the QR code.`
        },
        data: { type: 'activated', meetingId: String(meetingId) }
      });
    } catch (pushError) {
      console.log("⚠️ Activate notification failed:", pushError.message);
    }
    // ------------------------------------
    if (global.ubaCache) global.ubaCache.lastUpdated = 0; // Clear Cache
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Activation failed" }); }
};