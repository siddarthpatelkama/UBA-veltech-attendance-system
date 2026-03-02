const admin = require("../firebaseAdmin");
const db = require("../config/firebase");

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

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    let role = "student"; 
    
    // UNIVERSAL CLEANER: Strip "VTU" and all non-numeric characters
    const vtuNumber = email.split("@")[0].replace(/\D/g, ''); 
    
    let registeredDeviceId = null; 

    if (userDoc.exists) {
      const userData = userDoc.data();
      role = userData.role || "student";
      registeredDeviceId = userData.registeredDeviceId; 
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

    // 1. Define the Admin List (Comma separated in .env)
    const headEmails = (process.env.UBA_HEAD_EMAIL || "").split(",").map(e => e.trim());
    
    // 2. Check if the current user is an Admin
    if (headEmails.includes(email)) {
      role = "head";
    }

    // 3. THE "VIP PASS" DOMAIN LOCK
    // Block the user ONLY if: They are NOT an Admin AND they DON'T have a Veltech email
    const isVeltech = email.endsWith('@veltech.edu.in');
    const isAdmin = (role === "head");

    if (!isVeltech && !isAdmin) {
       console.log(`[AUTH] Blocked unauthorized domain: ${email}`);
       return res.status(403).json({ 
         success: false, 
         message: "Access Denied: Please use your Vel Tech ID or contact the Admin." 
       });
    }

    if (role !== "head" && role !== "admin") {
      if (incomingDeviceId) {
        if (!registeredDeviceId) {
           await userRef.set({ registeredDeviceId: incomingDeviceId }, { merge: true });
           registeredDeviceId = incomingDeviceId;
        }
      }
    }

    req.user = {
      ...decodedToken,
      email: email,
      role: role,
      name: decodedToken.name || email.split("@")[0],
      vtuNumber: vtuNumber, // Pass clean numeric ID to controllers
      currentDeviceId: incomingDeviceId,
      registeredDeviceId: registeredDeviceId 
    };

    next();
  } catch (error) {
    console.error("[AUTH] Token verification failed:", error);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
}

module.exports = { verifyToken };