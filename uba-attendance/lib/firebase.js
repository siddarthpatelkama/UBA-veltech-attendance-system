import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // Import Firestore

const firebaseConfig = {
  apiKey: "AIzaSyBpdeLuRXxPs8rk11HNlVpSDKTS3BYHlOg",
  authDomain: "uba-attendance-3101.firebaseapp.com",
  projectId: "uba-attendance-3101",
  storageBucket: "uba-attendance-3101.firebasestorage.app",
  messagingSenderId: "414761819857",
  appId: "1:414761819857:web:be3a4fd9e1e8975b15eff0",
  measurementId: "G-6YLNBCXHFT"
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

// Export Firestore (db) instance - THIS FIXES THE IMPORT ERROR
export const db = getFirestore(app);
console.log("[FIREBASE] Firestore (db) instance created");

export default app;