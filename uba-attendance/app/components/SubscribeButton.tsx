"use client";
import { useEffect, useState } from 'react';

interface SubscribeProps {
  vtu: string;
  year: string;
  dept: string;
  role: string;
}

export default function SubscribeButton({ vtu, year, dept, role }: SubscribeProps) {
  // ⚡ FORCE DEFAULT TO TRUE: It will always render unless proven otherwise
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 1. If we know they already did this, hide immediately
    if (localStorage.getItem('uba_alerts_enabled') === 'true') {
      setIsVisible(false);
      return;
    }

    // 2. Setup a loop to watch for OneSignal status changes
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).OneSignal) {
        const optedIn = (window as any).OneSignal.User?.PushSubscription?.optedIn;
        if (optedIn) {
          localStorage.setItem('uba_alerts_enabled', 'true');
          setIsVisible(false); // Hide the button
          clearInterval(interval); // Stop checking
        }
      }
    }, 2000); // Checks every 2 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSubscribe = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).OneSignal) {
        const OneSignal = (window as any).OneSignal;
        
        // 1. Trigger the prompt
        await OneSignal.Slidedown.promptPush();
        
        // 2. Tag them instantly
        OneSignal.User.addTags({
          vtu: String(vtu).toUpperCase(),
          year: String(year),
          dept: String(dept).toUpperCase(),
          role: String(role).toLowerCase()
        });
      }
    } catch (error) {
      console.error("Subscription error:", error);
    }
  };

  // If hidden, render nothing
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
