"use client";
import { useEffect } from 'react';
import OneSignal from 'react-onesignal';

export default function PushNotifications() {
  useEffect(() => {
    const initOneSignal = async () => {
      // @ts-ignore
      if (!window.OneSignal) {
        // @ts-ignore
        window.OneSignal = OneSignal;
      }
      
      await OneSignal.init({
        appId: "19e04964-ec0f-44c4-a1df-e56989f568f8",
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
          enable: true, 
        } as any, // ⚡ The "as any" fixes the red line here!
      });

      // @ts-ignore ⚡ This tells TypeScript to ignore the strict rules
      OneSignal.Slidedown.promptPush(); 
    };

    initOneSignal();
  }, []);

  return null; 
}
