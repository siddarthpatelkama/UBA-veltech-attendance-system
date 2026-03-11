"use client";

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
    // --- PREMIUM LOADING UX STATES ---
    const loadingMessages = [
      "Connecting to UBA Servers...",
      "Waking up the database and servers from sleep...",
      "This may take up to a minute...",
      "Fetching secure credentials...",
      "Almost there..."
    ];
    const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

    useEffect(() => {
      if (!loading) return;
      const interval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 5000); // Changes text every 5 seconds
      return () => clearInterval(interval);
    }, [loading]);
  
  // --- UI NAVIGATION & MODAL STATES ---
  const [activeView, setActiveView] = useState<'home' | 'history' | 'rankings' | 'excuses'>('home');
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

  // --- PENDING EXCUSES STATES ---
  const [pendingExcuses, setPendingExcuses] = useState<any[]>([]);
  const [showExcuseModal, setShowExcuseModal] = useState<any>(null);
  const [excuseReason, setExcuseReason] = useState('');
  const [isSubmittingExcuse, setIsSubmittingExcuse] = useState(false);

  // --- UPCOMING EVENTS STATE ---
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

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
  // --- FEATURE 11: ZERO-READ BOOT ARCHITECTURE ---
  const fetchUserStatus = async (user: any, skipNetwork = false) => {
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

    // 🛑 UPDATED LOCK: If they are on the 'home' view, ALWAYS check for live sessions
    // even if we have a cached profile.
    if (skipNetwork && cachedProfile && activeView !== 'home') {
        return; 
    }

    if (!navigator.onLine) {
        setLoading(false);
        return; // Stop here if totally offline
    }

    // 2. FETCH FRESH DATA IN BACKGROUND (Only runs when explicitly called)
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
            // 🚀 ONESIGNAL INIT (NATIVE + WEB TWIST)
            if (typeof window !== 'undefined') {
              if ((window as any).Capacitor?.isNativePlatform()) {
                // 📱 NATIVE APP USERS
                try {
                  const OneSignal = (window as any).plugins?.OneSignal;
                  if (OneSignal) {
                    OneSignal.initialize("19e04964-ec0f-44c4-a1df-e56989f568f8"); 
                    OneSignal.Notifications.requestPermission(true);
                    OneSignal.User.addTag("vtu", combinedUserData.vtuNumber);
                    OneSignal.User.addTag("role", combinedUserData.role || "student");
                    OneSignal.User.addTag("year", combinedUserData.year || "1");
                  }
                } catch (err) { console.log("Native OneSignal skipped"); }
              } else {
                // 💻 THE TWIST: WEB USERS (Only prompt if they DON'T have the mobile app)
                if (!combinedUserData.registeredDeviceId) {
                  // Inject Web SDK
                  const script = document.createElement('script');
                  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
                  script.async = true;
                  document.head.appendChild(script);

                  (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
                  (window as any).OneSignalDeferred.push(function(OneSignal: any) {
                    OneSignal.init({
                      appId: "19e04964-ec0f-44c4-a1df-e56989f568f8",
                    });
                    OneSignal.User.addTag("vtu", combinedUserData.vtuNumber);
                    OneSignal.User.addTag("role", combinedUserData.role || "student");
                    OneSignal.User.addTag("year", combinedUserData.year || "1");
                  });
                }
              }
            }
      localStorage.setItem('uba_student_history', JSON.stringify(historyData.history || []));
      localStorage.setItem('uba_student_leaderboard', JSON.stringify(historyData.leaderboard || []));

      // Fetch pending excuses for this student
      if (combinedUserData.vtuNumber) {
        const excuseRes = await fetch(`${API_URL}/meeting/excuse/list`, { headers });
        if (excuseRes.ok) {
          const d = await excuseRes.json();
          const myExcuses = (d.excuses || []).filter((e: any) => e.vtu === combinedUserData.vtuNumber && e.status === 'pending');
          setPendingExcuses(myExcuses);
        }
      }

      // --- Fetch Upcoming Scheduled Events ---
      const meetRes = await fetch(`${API_URL}/meetings?skipRoster=true`, { headers });
      if (meetRes.ok) {
        const d = await meetRes.json();
        const myYear = combinedUserData.year || '1'; // Fallback
        
        const scheduled = (d.meetings || []).filter((m:any) => {
          if (m.isDeleted) return false; // TOMBSTONE FILTER
          if (m.status !== 'scheduled') return false;
          if (!m.targetAudience || m.targetAudience.length === 0) return true; // Open to all
          return m.targetAudience.includes(myYear.toString()); // Locked to specific year
        });
        setUpcomingEvents(scheduled);
      }
      // -------------------------------------------------------
      
    } catch (err) { 
      console.error("Background Fetch Error:", err);
    } finally { 
      setLoading(false); // Ensure spinner dies no matter what
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace('/login');
      else fetchUserStatus(user, true); // <-- Pass TRUE to block background reads on boot
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
  // 3B. EXCUSE SUBMISSION WITH GEOLOCATION
  // ==========================================
  const handleSubmitExcuse = async (meetingId: string) => {
    setIsSubmittingExcuse(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const token = await user.getIdToken();

      // Ensure we have the student's VTU
      const vtuToSubmit = userData?.vtuNumber || user.email?.split('@')[0].toUpperCase().replace(/\D/g, '');
      if (!vtuToSubmit) throw new Error('VTU ID not found. Setup your profile first.');

      const position: GeolocationPosition = await new Promise((resolve, reject) => 
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      const { latitude, longitude } = position.coords;

      // FIX: Use 'meetingId' consistently
      console.log("Submitting excuse for:", meetingId, "VTU:", vtuToSubmit);

      const res = await fetch(`${API_URL}/meeting/excuse/submit`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          meetingId: meetingId, 
          vtu: vtuToSubmit, 
          reason: excuseReason, 
          lat: latitude, 
          lng: longitude 
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || result.message || 'Failed to submit');

      alert('Excuse submitted! ✅');
      setShowExcuseModal(null);
      setExcuseReason('');
      fetchUserStatus(user, false); 
    } catch (err: any) {
      alert(err.message || 'Could not submit excuse');
    } finally {
      setIsSubmittingExcuse(false);
    }
  };


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
    <div className="min-h-screen bg-white font-sans text-gray-900 flex flex-col relative overflow-hidden">
      {/* SKELETON NAVBAR */}
      <nav className="p-6 bg-white border-b-2 border-gray-50 flex justify-between items-center sticky top-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gray-100 rounded-full animate-pulse"></div>
          <div className="h-6 w-32 bg-gray-100 rounded-md animate-pulse"></div>
        </div>
        <div className="h-8 w-24 bg-gray-100 rounded-md animate-pulse hidden md:block"></div>
      </nav>

      {/* SKELETON MAIN CONTENT */}
      <main className="max-w-6xl mx-auto p-6 md:p-10 flex-grow w-full">
        <div className="grid lg:grid-cols-12 gap-10">
          {/* Profile Card Skeleton */}
          <div className="lg:col-span-4 space-y-8">
            <div className="p-8 rounded-[3rem] bg-gray-50 shadow-sm border border-gray-100 h-[250px] animate-pulse flex flex-col justify-between">
              <div>
                <div className="h-3 w-24 bg-gray-200 rounded mb-6"></div>
                <div className="h-8 w-48 bg-gray-200 rounded"></div>
              </div>
              <div className="flex justify-between items-end border-t border-gray-200 pt-6">
                <div>
                  <div className="h-2 w-16 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 w-12 bg-gray-200 rounded"></div>
                </div>
                <div className="h-6 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
          {/* Digital ID Skeleton */}
          <div className="lg:col-span-8 space-y-10">
            <div className="p-10 rounded-[4rem] bg-gray-50 border border-gray-100 text-center shadow-sm animate-pulse flex flex-col items-center">
              <div className="h-8 w-40 bg-gray-200 rounded mb-4"></div>
              <div className="h-3 w-56 bg-gray-200 rounded mb-8"></div>
              <div className="h-64 w-64 bg-gray-200 rounded-[3rem] mb-8"></div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="h-16 bg-gray-200 rounded-2xl"></div>
                <div className="h-16 bg-gray-200 rounded-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* DYNAMIC LOADING TEXT OVERLAY */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#111827] text-white px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-bottom-10 min-w-[280px] justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-[#FF5722] rounded-full animate-spin shrink-0"></div>
        <p className="text-[10px] font-black uppercase tracking-widest transition-opacity duration-300">
          {loadingMessages[loadingMsgIndex]}
        </p>
      </div>
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
  const isDeviceAuthorized = !userData?.registeredDeviceId || deviceId === userData?.registeredDeviceId;

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

      {/* Excuse Submission Modal */}
      {showExcuseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6" onClick={() => setShowExcuseModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border-2 border-amber-500" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-500 p-6 text-white flex justify-between items-center">
              <h2 className="text-xl font-black uppercase">Submit Excuse</h2>
              <button onClick={() => setShowExcuseModal(null)} className="text-white font-black text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Session: <strong>{showExcuseModal.eventTitle || showExcuseModal.meetingId}</strong></p>
              <p className="text-xs text-gray-500">Your current GPS location will be captured for verification.</p>
              <textarea 
                value={excuseReason} 
                onChange={(e) => setExcuseReason(e.target.value)} 
                placeholder="Explain why you missed this session..." 
                className="w-full p-4 border-2 border-gray-200 rounded-2xl text-sm focus:border-amber-500 outline-none resize-none" 
                rows={4} 
              />
              <button 
                onClick={() => handleSubmitExcuse(showExcuseModal.meetingId)} 
                disabled={isSubmittingExcuse || !excuseReason.trim()} 
                className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl uppercase text-sm disabled:opacity-50 shadow-md hover:bg-amber-600 active:scale-95 transition-all"
              >
                {isSubmittingExcuse ? 'Submitting...' : 'Submit Excuse with GPS'}
              </button>
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
                {['home', 'history', 'rankings', 'excuses'].map((t) => (
                  <button 
                    key={t} 
                    onClick={() => { 
                      setActiveView(t as any); 
                      // If they click history or rankings, FORCE a database sync
                      if (t !== 'home' && auth.currentUser) fetchUserStatus(auth.currentUser, false); 
                    }} 
                    className={`relative text-[10px] font-black uppercase tracking-widest ${activeView === t ? 'text-[#FF5722]' : 'text-gray-400'}`}
                  >
                    {t}
                    {/* Add notification dot if there are pending excuses */}
                    {t === 'excuses' && pendingExcuses.length > 0 && (
                      <span className="absolute -top-2 -right-3 h-2 w-2 bg-red-500 rounded-full animate-ping"></span>
                    )}
                  </button>
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
             {['home', 'history', 'rankings', 'excuses'].map((t) => (
                <button 
                  key={t} 
                  onClick={() => { 
                    setActiveView(t as any); 
                    setIsMenuOpen(false); 
                    // If they click history or rankings, FORCE a database sync
                    if (t !== 'home' && auth.currentUser) fetchUserStatus(auth.currentUser, false);
                  }} 
                  className="relative block w-full text-left font-black uppercase italic text-2xl text-gray-900"
                >
                  {t}
                  {t === 'excuses' && pendingExcuses.length > 0 && (
                    <span className="absolute top-1/2 -translate-y-1/2 ml-3 h-3 w-3 bg-red-500 rounded-full animate-pulse"></span>
                  )}
                </button>
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

               {/* --- UPCOMING EVENTS BOARD --- */}
               <div className="bg-white rounded-[3rem] p-8 shadow-xl border-t-4 border-orange-200 mt-8">
                 <h3 className="font-black text-sm text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                   <span className="text-xl">🗓️</span> Upcoming Trips
                 </h3>
                 
                 {upcomingEvents.length === 0 ? (
                   <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center">
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No events scheduled for your year</p>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {upcomingEvents.map(ev => (
                       <div key={ev.id} className="p-5 border-2 border-orange-100 bg-[#FFF9F5] rounded-3xl hover:border-[#FF5722] transition-colors group cursor-default">
                         <h4 className="font-black text-lg text-gray-900 uppercase tracking-tight group-hover:text-[#FF5722] transition-colors">{ev.title}</h4>
                         <div className="flex flex-wrap gap-3 mt-3">
                           <span className="bg-white px-3 py-1.5 rounded-xl text-[10px] font-black text-orange-600 uppercase tracking-widest shadow-sm">
                             🕒 {ev.date} @ {ev.time}
                           </span>
                           <span className="bg-white px-3 py-1.5 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-widest shadow-sm">
                             📍 {ev.venue}
                           </span>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
               {/* --- END UPCOMING EVENTS BOARD --- */}
            </div>
          </div>
        )}

        {activeView === 'history' && (
          <div className="space-y-8 animate-in slide-in-from-right-8">
             <div className="flex justify-between items-end border-b-2 border-gray-100 pb-6">
                <h2 className="text-4xl font-black uppercase italic tracking-tighter">My Contribution</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{history.length} Entries</p>
             </div>

             {/* Pending Excuses Banner */}
             {pendingExcuses.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 space-y-3">
                <h3 className="font-black uppercase text-amber-700 text-sm">Pending Excuses ({pendingExcuses.length})</h3>
                {pendingExcuses.map((ex, i) => (
                  <div key={i} className="flex justify-between items-center bg-white rounded-2xl p-4 border border-amber-100">
                    <div>
                      <p className="font-bold text-sm">{ex.eventTitle || ex.meetingId}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">{ex.reason}</p>
                    </div>
                     <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-3 py-1 rounded-full uppercase">Awaiting Review</span>
                   </div>
                 ))}
               </div>
             )}

             {/* Strike Alert - Show if user has strikes */}
             {(userData?.strikes || 0) > 0 && (
               <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6">
                 <div className="flex justify-between items-center">
                   <div>
                     <h3 className="font-black uppercase text-red-700 text-sm">Strike Warning</h3>
                     <p className="text-xs text-red-600 mt-1">You have {userData?.strikes}/3 strikes. At 3 strikes you will be auto-demoted.</p>
                   </div>
                   <span className="text-3xl font-black text-red-500">{userData?.strikes}/3</span>
                 </div>
               </div>
             )}
             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.map((h, i) => (
                  <div key={i} onClick={() => setSelectedHistoryItem(h)} className="p-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm hover:border-[#FF5722] hover:shadow-lg transition-all cursor-pointer group">
                     <div className="flex justify-between mb-4">
                        <span className={`text-[8px] font-black px-2 py-1 rounded ${h.isOverride ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>{h.isOverride ? 'MANUAL' : 'VERIFIED'}</span>
                        <p className="text-[10px] font-mono text-gray-300">
                          {(() => {
                            const ts = h.timestamp?.seconds ? h.timestamp.seconds * 1000 : h.timestamp;
                            if (!ts) return h.dateString || 'Time N/A';
                            const d = new Date(ts);
                            return isNaN(d.getTime()) ? (h.dateString || 'Time N/A') : d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
                          })()}
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

        {/* --- DEDICATED EXCUSES TAB --- */}
        {activeView === 'excuses' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-end border-b-2 border-gray-100 pb-6">
                <h2 className="text-4xl font-black uppercase italic tracking-tighter">Pending Excuses</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Missed Trips (24H)</p>
             </div>

             {pendingExcuses.length === 0 ? (
               <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[3rem] p-16 text-center">
                 <span className="text-4xl grayscale opacity-30 mb-4 block">✅</span>
                 <p className="text-gray-400 text-xs font-black uppercase tracking-widest">You have no pending strikes or excuses.</p>
               </div>
             ) : (
               <div className="space-y-4">
                 {pendingExcuses.map((ex, i) => (
                   <div key={i} className="bg-white rounded-[2rem] p-6 border-2 border-amber-200 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group hover:border-amber-400 transition-all">
                     <div>
                       <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-3 py-1 rounded-full uppercase tracking-widest mb-2 inline-block">Action Required</span>
                       <h3 className="font-black text-lg text-gray-900 uppercase tracking-tight">{ex.eventTitle || ex.meetingId}</h3>
                       <p className="text-xs font-bold text-gray-500 mt-1">If you have a valid reason for missing this event, submit it now. GPS verification is required.</p>
                     </div>
                     <button 
                       onClick={() => setShowExcuseModal(ex)} 
                       className="w-full md:w-auto bg-amber-500 text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-600 active:scale-95 transition-all whitespace-nowrap"
                     >
                       Submit Excuse 📍
                     </button>
                   </div>
                 ))}
               </div>
             )}

             {/* Strike Warning Banner */}
             {(userData?.strikes || 0) > 0 && (
               <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 mt-8">
                 <div className="flex justify-between items-center">
                   <div>
                     <h3 className="font-black uppercase text-red-700 text-sm">⚠️ Strike Warning</h3>
                     <p className="text-xs text-red-600 mt-1">You have {userData?.strikes}/3 strikes. At 3 strikes you will be auto-demoted to Guest status.</p>
                   </div>
                   <span className="text-3xl font-black text-red-500">{userData?.strikes}/3</span>
                 </div>
               </div>
             )}
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
              <button onClick={() => setSelectedHistoryItem(null)} className="w-full bg-[#111827] text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest mt-4 hover:bg-black transition-colors shadow-xl active:scale-95">Close Dossier</button>
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