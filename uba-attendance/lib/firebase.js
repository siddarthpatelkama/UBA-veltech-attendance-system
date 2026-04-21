import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

console.log("[FIREBASE] Loading Firebase config...");
console.log("[FIREBASE] Config:", {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  apiKeyPresent: !!firebaseConfig.apiKey,
});

// Initialize Firebase (Singleton pattern to prevent multiple instances)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (getApps().length === 0) {
    console.log("[FIREBASE] Firebase app initialized successfully");
} else {
    console.log("[FIREBASE] Firebase app already initialized, reusing existing app");
}

// Export Auth instance
export const auth = getAuth(app);
console.log("[FIREBASE] Auth instance created");

// ENFORCE OFFLINE LOGIN CAPABILITY
setPersistence(auth, indexedDBLocalPersistence)
  .then(() => console.log("[FIREBASE] Offline persistence enabled"))
  .catch((error) => console.error("[FIREBASE] Persistence error:", error));

// Export Firestore (db) instance - THIS FIXES THE IMPORT ERROR
export const db = getFirestore(app);
console.log("[FIREBASE] Firestore (db) instance created");

// Export Messaging instance (browser-only guard — SSR safe)
// getMessaging() throws if called on the server, so we only init it in the browser
export const messaging = typeof window !== "undefined" ? getMessaging(app) : null;

export default app;