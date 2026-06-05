"use client";
import { useEffect } from "react";
import { messaging, auth } from "@/lib/firebase";
import { getToken, onMessage } from "firebase/messaging";

export default function PushNotifications() {
  useEffect(() => {
    const initFCM = async () => {
      try {
        if (!messaging) {
          console.warn("[FCM] Messaging not available (SSR or unsupported browser).");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          console.warn("[FCM] Notification permission denied.");
          return;
        }

        if (!("serviceWorker" in navigator)) {
          console.warn("[FCM] Service workers are not supported in this browser.");
          return;
        }

        const firebaseConfig = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };

        if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId || !firebaseConfig.appId) {
          console.error("[FCM] Missing Firebase config values. Check NEXT_PUBLIC_FIREBASE_* env vars.");
          return;
        }

        const encodedConfig = encodeURIComponent(JSON.stringify(firebaseConfig));
        const swRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${encodedConfig}`);

        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });

        if (token) {
          // Print token to console for debugging
          console.log("[FCM] YOUR FCM TOKEN:", token);

          if (auth.currentUser) {
            const idToken = await auth.currentUser.getIdToken();
            await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/user/update-fcm-token`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ fcmToken: token }),
              }
            );
            console.log("[FCM] ✅ Token synced to backend.");
          } else {
            console.log("[FCM] Waiting for user to sign in before syncing.");
          }
        }
      } catch (err) {
        console.error("[FCM] Registration Error:", err);
      }
    };

    const unsubscribe = messaging
      ? onMessage(messaging, (payload) => {
          console.log("[FCM] Foreground message:", payload);
          alert(`🔔 ${payload.notification?.title}\n${payload.notification?.body}`);
        })
      : () => {};

    initFCM();
    return () => unsubscribe();
  }, []);

  return null;
}
