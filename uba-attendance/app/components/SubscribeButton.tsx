"use client";
import { useEffect, useState } from 'react';
import OneSignal from 'react-onesignal';

// ⚡ We define the exact data OneSignal needs to categorize this user
interface SubscribeProps {
  vtu: string;
  year: string;
  dept: string;
  role: string;
}

export default function SubscribeButton({ vtu, year, dept, role }: SubscribeProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('uba_alerts_enabled') === 'true') return; 

    const checkSub = () => {
      if (typeof window !== 'undefined' && window.OneSignal) {
        const isOptedIn = window.OneSignal.User.PushSubscription.optedIn;
        if (isOptedIn) {
          localStorage.setItem('uba_alerts_enabled', 'true');
          setIsVisible(false);
        } else {
          setIsVisible(true); 
        }
      }
    };
    
    setTimeout(checkSub, 1500);
  }, []);

  const handleSubscribe = async () => {
    try {
      // 1. Ask for Browser Permission
      await OneSignal.Slidedown.promptPush();
      
      // 2. Wait for them to click "Allow", then tag them in OneSignal
      setTimeout(() => {
        if (window.OneSignal && window.OneSignal.User.PushSubscription.optedIn) {
          
          // ⚡ THIS IS THE MAGIC: OneSignal instantly categorizes them based on this data
          window.OneSignal.User.addTags({
            vtu: String(vtu).toUpperCase(),
            year: String(year),
            dept: String(dept).toUpperCase(),
            role: String(role).toLowerCase()
          });

          // Lock the button away forever
          localStorage.setItem('uba_alerts_enabled', 'true'); 
          setIsVisible(false);
        }
      }, 3000);
    } catch (error) {
      console.error("Subscription error:", error);
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
