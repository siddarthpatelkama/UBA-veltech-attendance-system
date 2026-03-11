const admin = require("../firebaseAdmin");
// --- THE RAM CACHE SHIELD ---
if (!global.ubaCache) {
  global.ubaCache = { meetings: [], attendance: [], suspiciousLogs: [], users: [], lastUpdated: 0 };
}
const CACHE_DURATION = 15 * 60 * 1000; // 15 Minutes
const db = require("../config/firebase");
const onesignal = require('../utils/onesignal');

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
    
    // --- FCM Trigger 2: Phase Live Broadcast ---
        await onesignal.sendNotification(
      `meeting_${meetingId}`, // Subscribers to this specific event
      `🔴 SESSION LIVE`,
      `${phaseTitle} has started! Open your app to scan the QR code.`,
      { type: 'live', meetingId: meetingId, phaseId: newPhase.id }
    );
    // ---------------------------------------------

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

    const activeMeetings = meetings.filter(m => m.status === 'active').map(m => m.id);
    let attendanceDocs = [];
    if (activeMeetings.length > 0) {
      const safeActive = activeMeetings.slice(0, 10);
      const attSnap = await db.collection("attendance").where("meetingId", "in", safeActive).get();
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
        if (vtu && !mergedIdentitiesMap.has(vtu)) mergedIdentitiesMap.set(vtu, { ...data, vtuNumber: vtu });
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
      
      // Fetch all successful scans for this meeting
      const attendanceSnap = await db.collection("attendance").where("meetingId", "==", meetingId).get();
      const attendedVtus = new Set(attendanceSnap.docs.map(doc => doc.data().vtuNumber));

      // Find who missed the event
      const missingStudents = meetingData.manifest.filter(m => !attendedVtus.has(m.vtu));

      for (const student of missingStudents) {
        const masterRef = db.collection("master_roster").doc(student.vtu);
        const masterDoc = await masterRef.get();

        if (masterDoc.exists) {
          const userData = masterDoc.data();
          const currentStrikes = (userData.strikes || 0) + 1; // Apply +1 Strike immediately

          // Create the Pending Excuse Document
          const excuseRef = db.collection("pending_excuses").doc(`${meetingId}_${student.vtu}`);
          batch.set(excuseRef, {
            vtu: student.vtu,
            meetingId: meetingId,
            eventTitle: meetingData.title,
            status: 'pending',
            createdAt: Date.now(),
            strikesAdded: 1
          });

          // Execute 3-Strike Rule (Demotion)
          if (currentStrikes >= 3) {
            const tempRef = db.collection("temporary_roster").doc(student.vtu);
            batch.set(tempRef, {
              ...userData,
              strikes: currentStrikes,
              isGuest: true,
              demotedAt: Date.now()
            }, { merge: true });
            
            batch.delete(masterRef); // Remove from Club

            // --- FCM Trigger 3A: Account Demotion Alert ---
                await onesignal.sendNotification(
              `student_${student.vtu}`, // Targeted specifically to this student
              `🚨 UBA Account Demoted`,
              `You have missed 3 events. You have been removed from the Master Roster.`,
              { type: 'demotion', vtu: student.vtu }
            );
            // ----------------------------------------------
          } else {
            // Otherwise, just update the strike count in the master roster
            batch.update(masterRef, { strikes: currentStrikes });

            // --- FCM Trigger 3B: Strike Warning Alert ---
                await onesignal.sendNotification(
              `student_${student.vtu}`,
              `⚠️ Strike Added (${currentStrikes}/3)`,
              `You missed ${meetingData.title}. Submit an excuse with GPS immediately to avoid demotion.`,
              { type: 'strike_warning', meetingId: meetingId }
            );
            // ----------------------------------------------
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
          await onesignal.sendNotification(
          'admin',
          `📊 Trip Closed: ${meetingData.title}`,
          `${attendedCount} Verified. ${missingCount} Missing. Strikes applied.`,
          { type: 'analytics', meetingId: meetingId }
        );
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

    const { title, date, time, venue, targetAudience, manifest } = req.body;
    if (!title || !date) return res.status(400).json({ success: false, message: "Title and Date required" });

    const meetingData = {
      title: title,
      date: date,
      time: time || "TBA",
      venue: venue || "TBA",
      targetAudience: targetAudience || [], // Array like ["2", "3"]
      manifest: manifest || [], // Expected CSV roster
      status: "scheduled",
      type: "verifiable",
      attendanceActive: false,
      coordinatorId: req.user.email,
      createdByName: req.user.name || req.user.email.split('@')[0],
      createdAt: Date.now()
    };

    const docRef = await db.collection("meetings").add(meetingData);
    
    // --- FCM Trigger 1: Scheduled Event Broadcast ---
    // If targetAudience is specified, alert those years. Otherwise, alert everyone.
    const targetTopics = (targetAudience && targetAudience.length > 0) ? targetAudience.map(y => `year_${y}`) : ['all_students'];
    
    for (const topic of targetTopics) {
      await fcm.sendNotification(
        topic,
        `🗓️ New Event: ${title}`,
        `Scheduled for ${date} at ${venue || 'TBA'}. Check your app for details.`,
        { type: 'scheduled', meetingId: docRef.id }
      );
    }
    // ------------------------------------------------

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
    if (req.user.role !== "head" && req.user.role !== "coordinator" && req.user.role !== "student_coordinator") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { meetingId } = req.body;
    if (!meetingId) return res.status(400).json({ error: "Missing meeting ID" });

    const meetingRef = db.collection("meetings").doc(meetingId);
    
    // We update the status to active, and reset the createdAt timer so they get the full 30 minutes from RIGHT NOW.
    await meetingRef.update({
      status: "active",
      attendanceActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startTime: Date.now(),
      expiresAt: Date.now() + (60 * 60 * 1000)
    });

    return res.json({ success: true, message: "Scheduled meeting is now live." });
  } catch (error) {
    console.error("Activate Error:", error);
    return res.status(500).json({ success: false, message: "Failed to activate meeting" });
  }
};