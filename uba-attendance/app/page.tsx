'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function NetflixStyleSplash() {
  const [phase, setPhase] = useState(0);
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL ||"https://uba-veltech-attendance-backend-system.onrender.com";

  useEffect(() => {
    // 7-Second Animation Timeline
    const timers = [
      setTimeout(() => setPhase(1), 300),   // U
      setTimeout(() => setPhase(2), 600),   // B
      setTimeout(() => setPhase(3), 900),   // A
      setTimeout(() => setPhase(4), 2200),  // Netflix Expansion
      setTimeout(() => setPhase(5), 4500),  // SWAP to Vel Tech
      setTimeout(() => setPhase(6), 5800),  // Show VTU ID
      setTimeout(() => setPhase(7), 7000),  // Finish
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // AUTOMATIC REDIRECT LOGIC
  useEffect(() => {
    if (phase === 7) {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          router.replace('/login');
        } else {
          try {
            const token = await user.getIdToken();
            const res = await fetch(`${API_URL}/whoami`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            // Send to respective dashboards based on role
            if (data.role === 'head') router.replace('/admin');
            else if (data.role === 'coordinator') router.replace('/coordinator');
            else router.replace('/home');
          } catch (e) {
            router.replace('/login');
          }
        }
      });
      return () => unsub();
    }
  }, [phase, router, API_URL]);

  return (
    <div className="relative min-h-screen bg-white overflow-hidden font-sans flex flex-col items-center justify-center">
      {/* Existing CSS Animations from your code here */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes expandText { 0% { letter-spacing: -0.5em; opacity: 0; } 100% { letter-spacing: 0.05em; opacity: 1; } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes typing { from { width: 0; } to { width: 100%; } }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-expand { animation: expandText 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-pop { animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards; }
        .type-effect { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; animation: typing 1s steps(40, end) forwards; }
      `}} />

      <div className="relative flex flex-col items-center justify-center h-64 w-full mb-20">
        {phase > 0 && phase < 5 && (
          <div className="flex flex-col items-center">
             <div className="h-16 w-16 mb-4">
                {phase >= 4 && <img src="/uba-logo.png" className="w-full h-full object-contain animate-pop" alt="UBA" />}
             </div>
             <div className="flex flex-col items-center text-6xl md:text-7xl font-black italic tracking-tighter">
                <div className="flex gap-2">
                  <span className={`${phase >= 1 ? 'animate-slide-up' : 'opacity-0'} ${phase >= 4 ? 'text-[#FF5722]' : 'text-gray-900'}`}>U</span>
                  <span className={`${phase >= 2 ? 'animate-slide-up' : 'opacity-0'} ${phase >= 4 ? 'text-[#FF5722]' : 'text-gray-900'}`}>B</span>
                  <span className={`${phase >= 3 ? 'animate-slide-up' : 'opacity-0'} ${phase >= 4 ? 'text-[#FF5722]' : 'text-gray-900'}`}>A</span>
                </div>
                {phase >= 4 && <p className="text-[10px] md:text-xs font-black uppercase text-gray-500 animate-expand tracking-widest mt-2">Unnat Bharat Abhiyan</p>}
             </div>
          </div>
        )}
        {phase >= 5 && (
          <div className="flex items-center gap-5 animate-pop">
             <img src="/veltech-logo.png" className="w-16 h-16 object-contain rounded-full border border-gray-100 shadow-sm" alt="Vel Tech" />
             <h2 className="text-xl md:text-3xl font-black text-gray-900 uppercase tracking-tighter italic leading-tight">
               Vel Tech <br/> <span className="text-[#FF5722] text-[10px] tracking-[0.4em] block mt-1">University</span>
             </h2>
          </div>
        )}
      </div>

      <div className="absolute bottom-10 left-0 w-full px-12 flex flex-col items-center">
        <div className="font-mono text-left w-full max-w-[280px] border-l border-orange-100 pl-4 py-0.5">
          {phase >= 1 && <p className="text-gray-400 text-[8px] uppercase tracking-widest mb-1 opacity-50"><span className="type-effect">Architectured by:</span></p>}
          {phase >= 5 && <p className="text-gray-600 text-[10px] font-bold tracking-tight mb-0.5"><span className="type-effect" style={{ animationDelay: '0.2s' }}>siddarthpatelkama</span></p>}
          {phase >= 6 && <p className="text-[#FF5722]/80 text-[9px] font-black tracking-[0.2em]"><span className="type-effect" style={{ animationDelay: '0.1s' }}>VTU28319</span></p>}
        </div>
      </div>
      {phase === 7 && <div className="absolute inset-0 bg-white/50 flex items-center justify-center font-black uppercase text-[10px] tracking-[0.3em] text-[#FF5722] animate-pulse">Syncing...</div>}
    </div>
  );
}