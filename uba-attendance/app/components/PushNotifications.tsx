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

        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
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
