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
  const [isProcessing, setIsProcessing] = useState(false); // ⚡ Visual feedback state

  useEffect(() => {
    // Hide if already done
    if (localStorage.getItem('uba_alerts_enabled') === 'true') {
      setIsVisible(false);
      return;
    }

    const startOneSignal = async () => {
      try {
        const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();

        // 🌐 Initialize OneSignal quietly in the background for Web
        if (!isNative && !isOneSignalInit) {
          await OneSignalWeb.init({
            appId: "19e04964-ec0f-44c4-a1df-e56989f568f8",
            allowLocalhostAsSecureOrigin: true
          });
          isOneSignalInit = true;
        }
      } catch (err) {
        console.warn("OneSignal init skipped", err);
      }
    };
    
    startOneSignal();
  }, []);

  const handleSubscribe = async () => {
    if (isProcessing) return; // Prevent double clicks
    setIsProcessing(true);    // Instantly change button to "Processing..."

    try {
      const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();

      if (isNative) {
        // 📱 ANDROID APK
        const OneSignalNative = (window as any).plugins?.OneSignal;
        if (OneSignalNative) {
          const hasPerm = await OneSignalNative.Notifications.requestPermission(true);
          if (hasPerm) {
            OneSignalNative.User.addTag("vtu", String(vtu).toUpperCase());
            OneSignalNative.User.addTag("year", String(year));
            OneSignalNative.User.addTag("role", String(role).toLowerCase());
            localStorage.setItem('uba_alerts_enabled', 'true');
            setIsVisible(false);
          } else {
            setIsProcessing(false);
          }
        }
      } else {
        // 🌐 WEB BROWSER
        
        // ⚡ THE FIX: If they already blocked it, tell them!
        if (typeof window.Notification !== 'undefined' && Notification.permission === 'denied') {
          alert("Notifications are blocked! Please click the padlock icon next to your URL bar, allow notifications, and try again.");
          setIsProcessing(false);
          return;
        }

        // Ask the browser directly
        const permission = await window.Notification.requestPermission();
        
        if (permission === 'granted') {
          // Add tags safely to OneSignal
          OneSignalWeb.User.addTags({
            vtu: String(vtu).toUpperCase(),
            year: String(year),
            dept: String(dept).toUpperCase(),
            role: String(role).toLowerCase()
          });

          // Hide the button forever
          localStorage.setItem('uba_alerts_enabled', 'true');
          setIsVisible(false);
        } else {
          // They clicked "Deny" or "X" on the popup, reset the button
          setIsProcessing(false);
        }
      }
    } catch (error) {
      console.error(error);
      setIsProcessing(false);
      alert("Something went wrong. Please check your browser settings.");
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-[#FFF9F5] p-4 rounded-3xl border-2 border-[#FF5722] mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in">
      <div>
        <p className="font-black text-[#FF5722] uppercase tracking-widest text-sm flex items-center gap-2"><span>🔔</span> Action Required</p>
        <p className="text-xs font-bold text-gray-700 mt-1">Enable notifications to receive live updates for tomorrow's village event.</p>
      </div>
      <button 
        onClick={handleSubscribe} 
        disabled={isProcessing}
        className={`w-full md:w-auto text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 whitespace-nowrap ${
          isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#E64A19]'
        }`}
      >
        {isProcessing ? 'Processing...' : 'Turn On Alerts'}
      </button>
    </div>
  );
}