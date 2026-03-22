const admin = require("../firebaseAdmin");
const db = require("../config/firebase");
const NodeCache = require("node-cache");

// Initialize memory cache (Data expires after 15 minutes to keep it fresh)
const userCache = new NodeCache({ stdTTL: 900 }); 

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const incomingDeviceId = req.headers['x-device-id']; 

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized: No token" });
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const email = decodedToken.email;

    if (!email) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
    }

    // UNIVERSAL CLEANER: Strip "VTU" and all non-numeric characters
    const vtuNumber = email.split("@")[0].replace(/\D/g, ''); 
    
    // --- 🚀 FAST PATH: Check RAM Cache First ---
    let userData = userCache.get(email);

    // --- 🐢 SLOW PATH: Database Fetch (Only runs if cache is empty) ---
    if (!userData) {
      const userRef = db.collection("users").doc(email);
      const userDoc = await userRef.get();

      let role = "student"; 
      let registeredDeviceId = null; 

      if (userDoc.exists) {
        const dbData = userDoc.data();
        role = dbData.role || "student";
        registeredDeviceId = dbData.registeredDeviceId; 
      } else {
        await userRef.set({
          email: email,
          name: decodedToken.name || vtuNumber,
          vtuNumber: vtuNumber,
          role: "student",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(incomingDeviceId && { registeredDeviceId: incomingDeviceId })
        });
        registeredDeviceId = incomingDeviceId;
      }

      // Check Admin List in .env
      const headEmails = (process.env.UBA_HEAD_EMAIL || "").split(",").map(e => e.trim());
      if (headEmails.includes(email)) role = "head";

      userData = { role, registeredDeviceId };
      
      // Save to RAM cache for 15 minutes
      userCache.set(email, userData);
    }

    // 3. THE "VIP PASS" DOMAIN LOCK
    const isVeltech = email.endsWith('@veltech.edu.in');
    const isAdmin = (userData.role === "head");

    if (!isVeltech && !isAdmin) {
       console.log(`[AUTH] Blocked unauthorized domain: ${email}`);
       return res.status(403).json({ success: false, message: "Access Denied: Please use your Vel Tech ID." });
    }

    // 4. Update Device ID if missing (and not an admin)
    if (userData.role !== "head" && userData.role !== "admin") {
      if (incomingDeviceId && !userData.registeredDeviceId) {
         await db.collection("users").doc(email).set({ registeredDeviceId: incomingDeviceId }, { merge: true });
         userData.registeredDeviceId = incomingDeviceId;
         userCache.set(email, userData); // Update cache
      }
    }

    req.user = {
      ...decodedToken,
      email: email,
      role: userData.role,
      name: decodedToken.name || email.split("@")[0],
      vtuNumber: vtuNumber, 
      currentDeviceId: incomingDeviceId,
      registeredDeviceId: userData.registeredDeviceId 
    };

    next();
  } catch (error) {
    console.error("[AUTH] Token verification failed:", error);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
}

module.exports = { verifyToken };