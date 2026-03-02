const admin = require("firebase-admin");
require("dotenv").config();

console.log("[FIREBASE_ADMIN] Initializing Firebase Admin...");
console.log("[FIREBASE_ADMIN] Environment variables loaded");
console.log("[FIREBASE_ADMIN] Project ID:", process.env.FIREBASE_PROJECT_ID);
console.log("[FIREBASE_ADMIN] Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
console.log("[FIREBASE_ADMIN] Private Key present:", !!process.env.FIREBASE_PRIVATE_KEY);
if (process.env.FIREBASE_PRIVATE_KEY) {
  const keyStart = process.env.FIREBASE_PRIVATE_KEY.substring(0, 50);
  console.log("[FIREBASE_ADMIN] Private Key starts with:", keyStart);
}

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
};

console.log("[FIREBASE_ADMIN] Service account object created:", {
  projectId: serviceAccount.projectId,
  clientEmail: serviceAccount.clientEmail,
  privateKeyPresent: !!serviceAccount.privateKey,
});

if (!admin.apps.length) {
  console.log("[FIREBASE_ADMIN] No existing apps, initializing...");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  // ====================================================================
  // CRITICAL FIX: Force Firestore to use REST instead of gRPC.
  // This completely bypasses strict firewalls and TLS connection drops!
  // ====================================================================
  const db = admin.firestore();
  db.settings({ preferRest: true });

  console.log("[FIREBASE_ADMIN] Firebase Admin initialized successfully (REST Mode Enabled)");
} else {
  console.log("[FIREBASE_ADMIN] Firebase Admin already initialized");
}

module.exports = admin;