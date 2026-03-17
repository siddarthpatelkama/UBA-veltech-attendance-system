"use client";
import { useEffect, useState } from 'react';
import OneSignalWeb from 'react-onesignal';

interface SubscribeProps {
  vtu: string;
  year: string;
  dept: string;
  role: string;
}

let isOneSignalInit = false;

export default function SubscribeButton({ vtu, year, dept, role }: SubscribeProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('uba_alerts_enabled') === 'true') {
      setIsVisible(false);
      return;
    }

    const startOneSignal = async () => {
      try {
        const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();

        if (!isNative) {
          // 🌐 WEB BROWSER INIT
          if (!isOneSignalInit) {
            await OneSignalWeb.init({
              appId: "19e04964-ec0f-44c4-a1df-e56989f568f8",
              allowLocalhostAsSecureOrigin: true
            });
            isOneSignalInit = true;
          }
        }
      } catch (err) {
        console.warn("OneSignal Init Skipped", err);
      }
    };
    
    startOneSignal();
  }, []);

  const handleSubscribe = async () => {
    try {
      const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();

      if (isNative) {
        // 📱 NATIVE ANDROID/IOS PROMPT
        const OneSignalNative = (window as any).plugins?.OneSignal;
        if (OneSignalNative) {
          const hasPermission = await OneSignalNative.Notifications.requestPermission(true);
          
          if (hasPermission) {
            OneSignalNative.User.addTag("vtu", String(vtu).toUpperCase());
            OneSignalNative.User.addTag("year", String(year));
            OneSignalNative.User.addTag("dept", String(dept).toUpperCase());
            OneSignalNative.User.addTag("role", String(role).toLowerCase());
            
            localStorage.setItem('uba_alerts_enabled', 'true');
            setIsVisible(false);
          }
        }
      } else {
        // 🌐 WEB BROWSER PROMPT
        await OneSignalWeb.Notifications.requestPermission();
        
        // Wait a second for the browser to register the service worker
        setTimeout(() => {
          if (window.Notification && Notification.permission === "granted") {
            OneSignalWeb.User.addTags({
              vtu: String(vtu).toUpperCase(),
              year: String(year),
              dept: String(dept).toUpperCase(),
              role: String(role).toLowerCase()
            });

            localStorage.setItem('uba_alerts_enabled', 'true');
            setIsVisible(false);
          }
        }, 1500);
      }
    } catch (error) {
      console.error(error);
      alert("Could not start notifications. Please check your browser settings.");
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-red-50 p-4 rounded-3xl border-2 border-red-500 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in">
      <div>
        <p className="font-black text-red-600 uppercase tracking-widest text-sm flex items-center gap-2"><span>⚠️</span> Action Required</p>
        <p className="text-xs font-bold text-red-500 mt-1">Enable notifications to receive live updates for tomorrow's village event.</p>
      </div>
      <button 
        onClick={handleSubscribe} 
        className="w-full md:w-auto bg-red-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all active:scale-95 animate-pulse whitespace-nowrap"
      >
        🔔 Turn On Alerts
      </button>
    </div>
  );
}