const admin = require("firebase-admin");
require("dotenv").config();

/**
 * UBA ATTENDANCE - SECURE FIREBASE ADMIN CONFIG
 * --------------------------------------------
 * 1. FIXES: "ReferenceError" (Hoisting bug)
 * 2. FIXES: "App already exists" (Duplicate init bug)
 * 3. FIXES: Render gRPC TLS connection drops (REST Mode)
 * 4. SECURITY: Zero hardcoded keys (Environment String only)
 */

const initializeFirebase = () => {
  // Grab the single Master Key string from Render Environment
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountRaw) {
    console.error("❌ CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing from Render Environment!");
    process.exit(1); 
  }

  try {
    // Parse the JSON string into a secure object
    const serviceAccount = JSON.parse(serviceAccountRaw);

    // Initialize only if no apps are currently running
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      // 🔥 THE RENDER STABILITY FIX
      // Force Firestore to use REST instead of gRPC to prevent timeout errors
      const db = admin.firestore();
      db.settings({ preferRest: true });

      console.log(`✅ [FIREBASE_ADMIN] Secured & Connected: ${serviceAccount.project_id}`);
    }
  } catch (error) {
    console.error("❌ CRITICAL: Failed to parse Service Account JSON. Check Render settings.", error);
    process.exit(1);
  }
};

// Fire the boot sequence
initializeFirebase();

module.exports = admin;