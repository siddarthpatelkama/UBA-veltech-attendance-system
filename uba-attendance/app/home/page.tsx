'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import confetti from 'canvas-confetti';
import QRCode from 'react-qr-code';
import CryptoJS from 'crypto-js';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  
  // --- ORIGINAL CORE STATES ---
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  
  // --- UI NAVIGATION & MODAL STATES ---
  const [activeView, setActiveView] = useState<'home' | 'history' | 'rankings'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);
  
  // --- ORIGINAL SETUP FORM STATE + NEW PREFERRED NAME ---
  const [preferredName, setPreferredName] = useState('');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');

  // --- ORIGINAL OFFLINE SYNC STATES ---
  const [isOffline, setIsOffline] = useState(false);
  const [pendingScans, setPendingScans] = useState<any[]>([]);

  // --- 20-SECOND TOTP & SECURITY STATES ---
  const [totpQrData, setTotpQrData] = useState<string>('');
  const [totpSecondsLeft, setTotpSecondsLeft] = useState<number>(20);
  const [showQR, setShowQR] = useState<boolean>(false); // NEW: QR Toggle State
  
  // --- PERMANENT DEVICE ID STATE ---
  const [deviceId, setDeviceId] = useState<string>('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com";

  // ==========================================
  // 1. DEVICE ID GENERATION & NETWORK LOGIC
  // ==========================================
  useEffect(() => {
    // Zero-Trust Lock: Generate or retrieve Permanent Device ID
    let currentDeviceId = localStorage.getItem('uba_permanent_device_id');
    if (!currentDeviceId) {
       // Create an unguessable hardware string
       currentDeviceId = 'uba_device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
       localStorage.setItem('uba_permanent_device_id', currentDeviceId);
    }
    setDeviceId(currentDeviceId);

    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      setIsOffline(false);
      syncStudentOfflineScans(); 
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const saved = localStorage.getItem('uba_student_vault');
    if (saved) setPendingScans(JSON.parse(saved));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncStudentOfflineScans = async () => {
    const saved = localStorage.getItem('uba_student_vault');
    if (!saved) return;
    const scansToSync = JSON.parse(saved);
    if (scansToSync.length === 0) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/meeting/offline-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scans: scansToSync })
      });

      if (res.ok) {
        localStorage.removeItem('uba_student_vault');
        setPendingScans([]);
        if (auth.currentUser) fetchUserStatus(auth.currentUser); 
      }
    } catch (e) { console.error("Sync Failure"); }
  };

  // ==========================================
  // 2. AUTH & DATA FETCHING
  // ==========================================
  const fetchUserStatus = async (user: any) => {
    // 1. LOAD FROM CACHE IMMEDIATELY (Instant UI)
    const cachedProfile = localStorage.getItem('uba_student_profile');
    const cachedHistory = localStorage.getItem('uba_student_history');
    const cachedLeaderboard = localStorage.getItem('uba_student_leaderboard');

    if (cachedProfile) {
        setUserData(JSON.parse(cachedProfile));
        setHistory(cachedHistory ? JSON.parse(cachedHistory) : []);
        setLeaderboard(cachedLeaderboard ? JSON.parse(cachedLeaderboard) : []);
        setLoading(false); // Stop spinner immediately!
    }

    if (!navigator.onLine) {
        setLoading(false);
        return; // Stop here if totally offline
    }

    // 2. FETCH FRESH DATA IN BACKGROUND
    try {
      const token = await user.getIdToken();
      const headers = {
          Authorization: `Bearer ${token}`,
          'x-device-id': localStorage.getItem('uba_permanent_device_id') || ''
      };

      const res = await fetch(`${API_URL}/whoami`, { headers });
      if (!res.ok) throw new Error("Auth Failure");
      
      const data = await res.json();
      
      if (data.role === 'head' || data.role === 'admin') return router.replace('/admin');
      if (data.role === 'coordinator' || data.role === 'student_coordinator') return router.replace('/coordinator');

      const [profileRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/user-profile`, { headers }),
        fetch(`${API_URL}/history`, { headers })
      ]);

      const profileData = await profileRes.json();
      const historyData = await historyRes.json();

      if (!profileData.dept || !profileData.year || !profileData.gender || !profileData.phone) {
        setNeedsSetup(true);
      }

      const combinedUserData = { ...data, ...profileData, name: profileData.name || user.displayName || data.name };
      
      // 3. UPDATE STATE AND OVERWRITE CACHE
      setUserData(combinedUserData);
      setHistory(historyData.history || []);
      setLeaderboard(historyData.leaderboard || []);
      
      localStorage.setItem('uba_student_profile', JSON.stringify(combinedUserData));
      localStorage.setItem('uba_student_history', JSON.stringify(historyData.history || []));
      localStorage.setItem('uba_student_leaderboard', JSON.stringify(historyData.leaderboard || []));
      
    } catch (err) { 
      console.error("Background Fetch Error:", err);
    } finally { 
      setLoading(false); // Ensure spinner dies no matter what
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace('/login');
      else fetchUserStatus(user);
    });
    return () => unsub();
  }, [isOffline]);

  const handleProfileSubmit = async () => {
    if (!preferredName || !dept || !year || !gender || !phone) return alert("All fields required");
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/complete-profile`, {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId 
      },
      // Passes the specific preferred name to the backend
      body: JSON.stringify({ name: preferredName, dept, year, gender, phone })
    });
    if (res.ok) {
      setNeedsSetup(false);
      if (auth.currentUser) fetchUserStatus(auth.currentUser);
    }
  };

  // ==========================================
  // 3. TOTP GENERATOR (Battery Optimized)
  // ==========================================
  useEffect(() => {
    if (!userData || !userData.vtuNumber || !deviceId) return;

    let interval: NodeJS.Timeout;

    const generateTOTP = () => {
      // BATTERY SAVER: Don't do heavy crypto math if the phone is locked/in pocket
      if (document.visibilityState === 'hidden') return; 

      const now = Date.now();
      const timeSlot = Math.floor(now / 20000); 
      
      const dailySeed = localStorage.getItem('uba_daily_seed') || 'uba_offline_master_secret';
      
      const payloadString = `${userData.vtuNumber}:${timeSlot}:${dailySeed}`;
      const hash = CryptoJS.SHA256(payloadString).toString();
      
      const qrPayload = JSON.stringify({
        vtu: userData.vtuNumber,
        timeSlot: timeSlot,
        hash: hash,
        deviceId: deviceId 
      });

      setTotpQrData(btoa(qrPayload)); 
      
      const secondsPassedInSlot = Math.floor((now % 20000) / 1000);
      setTotpSecondsLeft(20 - secondsPassedInSlot);
    };

    generateTOTP(); 
    interval = setInterval(generateTOTP, 1000); 

    // Instantly generate a fresh QR the exact millisecond they unlock their phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') generateTOTP();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
       clearInterval(interval);
       document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userData, deviceId]);


  // ==========================================
  // 4. RENDER LOGIC
  // ==========================================
  useEffect(() => {
    const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = () => ('standalone' in window.navigator && (window.navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;
    if (isIos() && !isStandalone() && !sessionStorage.getItem('uba_ios_prompt_seen')) {
      setShowIosPrompt(true);
    }
  }, []);

  const dismissIosPrompt = () => {
    setShowIosPrompt(false);
    sessionStorage.setItem('uba_ios_prompt_seen', 'true');
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-12 h-12 border-4 border-orange-100 border-t-[#FF5722] rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#FF5722] animate-pulse">Entering Portal</p>
    </div>
  );

  if (needsSetup) return (
    <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center p-6">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full border-2 border-[#FF5722] animate-in slide-in-from-bottom-4">
        <img src="/uba-logo.png" className="h-16 w-16 mx-auto mb-6" alt="UBA" />
        <h2 className="text-2xl font-black text-gray-900 mb-2 text-center uppercase tracking-tighter">Guest Setup</h2>
        <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8">Unregistered VTU detected. Please identify.</p>
        
        <div className="space-y-4">
          <div className="col-span-2 mb-2">
            <label className="block text-[10px] font-black text-[#FF5722] mb-2 uppercase">What do you want to be called?</label>
            <input type="text" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="Full Name" className="w-full p-4 bg-[#FFF9F5] rounded-2xl outline-none font-bold text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-[#FF5722] mb-2 uppercase">Dept</label>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full p-4 bg-[#FFF9F5] rounded-2xl outline-none font-bold text-sm">
                <option value="">Select</option><option value="CSE">CSE</option><option value="AIDS">AIDS</option><option value="AIML">AIML</option><option value="ECE">ECE</option><option value="MECH">MECH</option><option value="CIVIL">CIVIL</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#FF5722] mb-2 uppercase">Year</label>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full p-4 bg-[#FFF9F5] rounded-2xl outline-none font-bold text-sm">
                <option value="">Select</option><option value="1">1st Yr</option><option value="2">2nd Yr</option><option value="3">3rd Yr</option><option value="4">4th Yr</option>
              </select>
            </div>
          </div>
          
          <div>
              <label className="block text-[10px] font-black text-[#FF5722] mb-2 uppercase">Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full p-4 bg-[#FFF9F5] rounded-2xl outline-none font-bold text-sm">
                <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
              </select>
          </div>

          <div>
              <label className="block text-[10px] font-black text-[#FF5722] mb-2 uppercase">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" className="w-full p-4 bg-[#FFF9F5] rounded-2xl outline-none font-bold text-sm" />
          </div>

          <button onClick={handleProfileSubmit} className="w-full bg-[#FF5722] text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest mt-4 shadow-xl hover:scale-[1.02] transition-transform">Enlist & Enter</button>
        </div>
      </div>
    </div>
  );

  // VIP BOUNCER CHECK: Compare current phone against the locked database phone
  const isDeviceAuthorized = !userData?.registeredDeviceId || userData?.currentDeviceId === userData?.registeredDeviceId;

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 flex flex-col">
      
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6" onClick={() => setShowAboutModal(false)}>
            <div className="bg-white rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-2xl border-2 border-[#FF5722]" onClick={e => e.stopPropagation()}>
              <div className="bg-[#FF5722] p-8 text-white flex justify-between items-center">
                 <h2 className="text-2xl font-black uppercase italic tracking-tighter">About UBA Vel Tech</h2>
                 <button onClick={() => setShowAboutModal(false)} className="text-white font-black text-2xl">&times;</button>
              </div>
              <div className="p-10 max-h-[70vh] overflow-y-auto">
                 <p className="text-gray-500 font-medium mb-8 leading-relaxed">UBA Vel Tech drives rural innovation and sustainable farming in local communities.</p>
              </div>
            </div>
        </div>
      )}

      <nav className="p-6 bg-white border-b-2 border-[#FF5722]/10 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
           <div className="flex items-center gap-3">
              <img src="/uba-logo.png" className="h-10 w-10" alt="Logo" />
              <h1 className="text-xl font-black italic tracking-tighter uppercase">Student Portal</h1>
           </div>
           <div className="flex gap-4 items-center">
              {isOffline && <span className="text-[9px] font-black text-red-500 border border-red-500 px-2 py-1 rounded">Offline</span>}
              
              <div className="hidden md:flex gap-6 items-center">
                {['home', 'history', 'rankings'].map((t) => (
                  <button key={t} onClick={() => setActiveView(t as any)} className={`text-[10px] font-black uppercase tracking-widest ${activeView === t ? 'text-[#FF5722]' : 'text-gray-400'}`}>{t}</button>
                ))}
                <button onClick={() => signOut(auth)} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 px-3 py-1 rounded transition-colors">Logout</button>
              </div>

              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 bg-gray-50 rounded-xl">
                 <div className={`w-5 h-0.5 bg-[#FF5722] mb-1.5 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
                 <div className={`w-5 h-0.5 bg-[#FF5722] transition-all ${isMenuOpen ? '-rotate-45 -translate-y-0.5' : ''}`}></div>
              </button>
           </div>
        </div>

        {isMenuOpen && (
          <div className="absolute top-full left-0 w-full bg-white border-b-2 border-[#FF5722] p-6 space-y-6 md:hidden animate-in slide-in-from-top-4">
             {['home', 'history', 'rankings'].map((t) => (
                <button key={t} onClick={() => { setActiveView(t as any); setIsMenuOpen(false); }} className="block w-full text-left font-black uppercase italic text-2xl text-gray-900">{t}</button>
             ))}
             <button onClick={() => signOut(auth)} className="w-full py-4 bg-red-50 text-red-500 font-black rounded-2xl uppercase text-xs">Logout</button>
             <Link href="/emergency" className="flex items-center gap-3 w-full py-4 px-4 bg-red-50 text-red-600 font-black rounded-2xl uppercase text-xs tracking-widest border border-red-200 mt-2 hover:bg-red-100 transition-colors">
               <span className="text-lg">🚨</span>
               <div>
                 <p>Emergency QR</p>
                 <p className="text-[8px] opacity-70">Server Down Override</p>
               </div>
             </Link>
          </div>
        )}
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-10 flex-grow w-full">
        
        {activeView === 'home' && (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in">
            <div className="lg:col-span-4 space-y-8">
               <div className="p-8 rounded-[3rem] bg-[#111827] text-white shadow-2xl relative overflow-hidden">
                  <p className="text-[10px] font-black text-[#FF5722] uppercase tracking-[0.4em] mb-6">{userData?.isGuest ? 'Registered Guest' : 'Verified Member'}</p>
                  
                  {/* FULL NAME FIX: No longer splits to grab surname */}
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-10 break-words">{userData?.name || 'Student'}</h2>
                  
                  <div className="flex justify-between items-end border-t border-white/10 pt-6">
                     <div>
                        <p className="text-[9px] font-black text-gray-500 uppercase">Total Attendance</p>
                        <p className="text-4xl font-black text-[#FF5722]">{history.length}</p>
                     </div>
                     <p className="text-xl font-black italic">Rank #{(leaderboard.findIndex(l => l.vtuNumber === userData?.vtuNumber) + 1) || 'N/A'}</p>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-8 space-y-10">
               <div className="p-10 rounded-[4rem] bg-[#FFF9F5] border-2 border-[#FF5722] text-center shadow-xl">
                  
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2 text-gray-900">Digital ID</h2>
                  <p className="text-[10px] font-bold text-gray-500 mb-8 uppercase tracking-widest">Show this to Coord when offline</p>

                  {/* VIP BOUNCER UI: Hide QR code if wrong device */}
                  {isDeviceAuthorized ? (
                    <div className="bg-white p-8 rounded-[3rem] inline-block shadow-2xl border-4 border-white mb-8 relative min-h-[264px] min-w-[264px] flex items-center justify-center transition-all">
                      
                      {/* NEW: SHOW QR TOGGLE LOGIC */}
                      {!showQR ? (
                         <div className="flex flex-col items-center justify-center animate-in zoom-in">
                            <div className="text-5xl mb-4">🔒</div>
                            <button onClick={() => setShowQR(true)} className="bg-[#111827] text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 transition-transform">
                               Reveal Identity
                            </button>
                            <p className="text-[8px] font-bold text-gray-400 mt-4 uppercase tracking-widest text-center">Only show when near Coord</p>
                         </div>
                      ) : (
                         <div className="animate-in fade-in zoom-in duration-300">
                            <div className="absolute -top-4 -right-4 bg-[#FF5722] text-white h-12 w-12 rounded-full flex items-center justify-center font-black border-4 border-white shadow-lg animate-pulse">
                              {totpSecondsLeft}s
                            </div>
                            {totpQrData ? (
                                <QRCode value={totpQrData} size={200} fgColor="#111827" />
                            ) : (
                                <div className="h-[200px] w-[200px] flex items-center justify-center font-black animate-pulse text-gray-200">WAIT</div>
                            )}
                         </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-red-50 p-8 rounded-[3rem] inline-block shadow-inner border-2 border-red-200 mb-8 relative max-w-[260px]">
                       <div className="text-5xl mb-4 animate-bounce">📱❌</div>
                       <h3 className="font-black text-red-600 uppercase tracking-widest text-sm mb-2">Device Locked</h3>
                       <p className="text-[10px] font-bold text-red-400 uppercase leading-relaxed">Attendance disabled. You are logged into a different phone. Return to your original device to scan.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 max-w-sm mx-auto gap-4 mb-8">
                     <div className="border border-[#FF5722]/20 bg-white rounded-2xl p-4 text-center">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">VTU ID</p>
                        <p className="font-mono font-black text-lg text-gray-900">{userData?.vtuNumber}</p>
                     </div>
                     <div className="border border-[#FF5722]/20 bg-white rounded-2xl p-4 text-center">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                        {isDeviceAuthorized ? (
                           <p className="font-black text-lg text-green-500 uppercase">Active</p>
                        ) : (
                           <p className="font-black text-lg text-red-500 uppercase">Locked</p>
                        )}
                     </div>
                  </div>

                  {pendingScans.length > 0 && (
                    <div className="bg-red-500 text-white p-4 rounded-2xl mb-8 animate-pulse font-black text-[10px] uppercase">
                        ⚠️ {pendingScans.length} Offline Scans Waiting for Wi-Fi Sync
                    </div>
                  )}

                  <div className="grid md:grid-cols-3 gap-6">
                     {['Approach Coord', 'Reveal & Show QR', 'Get Verified'].map((step, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm opacity-60">
                           <span className="text-[9px] font-black text-[#FF5722] mb-1 block uppercase">0{idx+1}</span>
                           <p className="text-[11px] font-black uppercase">{step}</p>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeView === 'history' && (
          <div className="space-y-8 animate-in slide-in-from-right-8">
             <div className="flex justify-between items-end border-b-2 border-gray-100 pb-6">
                <h2 className="text-4xl font-black uppercase italic tracking-tighter">My contibution</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{history.length} Entries</p>
             </div>
             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.map((h, i) => (
                  <div key={i} onClick={() => setSelectedHistoryItem(h)} className="p-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm hover:border-[#FF5722] hover:shadow-lg transition-all cursor-pointer group">
                     <div className="flex justify-between mb-4">
                        <span className={`text-[8px] font-black px-2 py-1 rounded ${h.isOverride ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>{h.isOverride ? 'MANUAL' : 'VERIFIED'}</span>
                        <p className="text-[10px] font-mono text-gray-300">
                          {new Date(h.timestamp).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </p>
                     </div>
                     <h3 className="text-xl font-black uppercase italic tracking-tighter group-hover:text-[#FF5722] transition-colors">{h.meetingTitle || 'Field Session'}</h3>
                     <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">Coord: {h.coordinatorName || 'Unknown'}</p>
                     <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-50">
                        <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">{h.phaseId && h.phaseId !== 'none' ? h.phaseId : 'Standard'}</p>
                        <span className="text-[10px] font-black text-[#FF5722] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Details &rarr;</span>
                     </div>
                  </div>
                ))}
             </div>
             {history.length === 0 && <p className="text-center py-20 opacity-30 font-black uppercase tracking-widest">No field scans recorded</p>}
          </div>
        )}

        {activeView === 'rankings' && (
          <div className="max-w-3xl mx-auto space-y-10 animate-in zoom-in-95">
             <h2 className="text-5xl font-black uppercase italic tracking-tighter text-center">Hall of Fame</h2>
             <div className="bg-white rounded-[4rem] border-2 border-gray-50 shadow-2xl overflow-hidden p-4">
                {leaderboard.map((user, i) => (
                  <div key={i} className={`flex items-center justify-between p-8 ${user.vtuNumber === userData?.vtuNumber ? 'bg-orange-50 rounded-3xl' : ''}`}>
                     <div className="flex items-center gap-8">
                        <span className={`text-4xl font-black italic tracking-tighter ${i < 3 ? 'text-[#FF5722]' : 'text-gray-200'}`}>#{i+1}</span>
                        <div>
                           <p className="text-xl font-black uppercase leading-none mb-1">{user.name}</p>
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{user.dept}</p>
                        </div>
                     </div>
                     <p className="text-3xl font-black text-gray-900 tabular-nums">{user.count}</p>
                  </div>
                ))}
             </div>
          </div>
        )}

      </main>

      <footer className="mt-auto border-t border-gray-50 py-16 bg-white text-center opacity-40">
         <p className="text-[10px] font-black uppercase tracking-[0.3em]">Architected by <span className="text-[#FF5722]">VTU28319</span></p>
      </footer>

      {/* DETAILED STUDENT HISTORY MODAL */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedHistoryItem(null)}>
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-[#FF5722] p-8 text-white relative">
              <button onClick={() => setSelectedHistoryItem(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors font-black">&times;</button>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] opacity-80 mb-2">Scan Dossier</p>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">{selectedHistoryItem.meetingTitle || 'Field Session'}</h2>
            </div>
            {/* Modal Body */}
            <div className="p-8 space-y-5">
              <div className="bg-[#FFF9F5] p-5 rounded-2xl border border-[#FF5722]/10">
                <p className="text-[9px] font-black text-[#FF5722] uppercase tracking-widest mb-1">Session</p>
                <p className="text-lg font-black text-[#111827] uppercase tracking-tight">{selectedHistoryItem.meetingTitle || 'Field Session'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Coordinator</p>
                  <p className="text-sm font-black text-[#111827]">{selectedHistoryItem.coordinatorName || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Time</p>
                  <p className="text-sm font-black text-[#111827]">{selectedHistoryItem.dateString || 'N/A'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Phase</p>
                  <p className="text-sm font-black text-[#111827]">{selectedHistoryItem.phaseId === 'none' || !selectedHistoryItem.phaseId ? 'Standard' : selectedHistoryItem.phaseId}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                  <p className={`text-sm font-black ${selectedHistoryItem.isOverride ? 'text-yellow-600' : 'text-green-600'}`}>{selectedHistoryItem.isOverride ? 'Manually Injected' : 'Verified Scan'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedHistoryItem(null)} className="w-full bg-[#111827] text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest mt-4 hover:bg-black transition-colors shadow-xl">Close Dossier</button>
            </div>
          </div>
        </div>
      )}
      {showIosPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-white p-4 rounded-3xl shadow-2xl border-2 border-gray-100 z-[200] animate-in slide-in-from-bottom-10">
          <button onClick={dismissIosPrompt} className="absolute top-2 right-3 text-gray-400 font-black text-lg">&times;</button>
          <div className="flex items-start gap-4">
             <div className="bg-[#FFF9F5] p-3 rounded-2xl">
               <img src="/uba-logo.png" className="h-8 w-8 object-contain" alt="UBA" />
             </div>
             <div>
               <h3 className="font-black text-sm text-gray-900 uppercase tracking-tight mb-1">Install UBA App</h3>
               <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                 Tap the <span className="inline-block border border-gray-300 px-1 rounded mx-0.5 text-blue-500">Share ⍐</span> icon below, then select <span className="font-black text-gray-900">&quot;Add to Home Screen&quot;</span> for instant offline access.
               </p>
             </div>
          </div>
        </div>
      )}    </div>
  );
}