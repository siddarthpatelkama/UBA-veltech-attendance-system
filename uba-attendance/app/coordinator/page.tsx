"use client";
import { useEffect, useState, useRef, useMemo } from 'react';

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import ProtectedRoute from '../components/ProtectedRoute';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import QRCode from 'react-qr-code';
import CryptoJS from 'crypto-js';
import SubscribeButton from '../components/SubscribeButton';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const LeafletMap = dynamic(() => import('../components/MapBox'), { ssr: false });

const getSafeTime = (val: any, fallback: number = 0) => {
  if (!val) return fallback;
  if (typeof val === 'number') return val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const d = new Date(val).getTime();
  return isNaN(d) ? fallback : d;
};

// 1. Helper function to find the actual active phase securely
const getActivePhase = (meetingData: any) => {
  if (!meetingData || meetingData.status !== 'active') return null;
  
  // Scans the whole array and returns the one that is actually active
  return meetingData.phases?.find((phase:any) => phase.status.toLowerCase() === 'active') || null;
};

export default function CoordinatorPage() {
  const router = useRouter();
  
  const [initialLoad, setInitialLoad] = useState(true); 

  // --- OFFLINE BOOT INJECTION ---
  const [networkLocked, setNetworkLocked] = useState(false);
  
  useEffect(() => {
    // 1. INSTANT BOOT: If the phone is entirely offline, kill the loading spinner immediately
    if (!navigator.onLine) {
      setNetworkLocked(true);
      setIsOfflineMode(true); // Force Vault Mode
      setInitialLoad(false);  // Kill the spinner so UI paints instantly
      
      // Load whatever we have in the cache to populate the screen
      const cachedUsers = localStorage.getItem('uba_users_cache');
      if (cachedUsers) setUsers(JSON.parse(cachedUsers));
    }
  }, []);

  const [meetings, setMeetings] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [suspiciousLogs, setSuspiciousLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null); 
  
  const [meetingMode, setMeetingMode] = useState<'standard' | 'verifiable'>('standard');
  const [newTitle, setNewTitle] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [manualVtu, setManualVtu] = useState('');
  const [newPhaseTitle, setNewPhaseTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('All'); 
  const [vtuLookup, setVtuLookup] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [localOfflineScans, setLocalOfflineScans] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLowNetworkWarning, setShowLowNetworkWarning] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [emergencyDeviceLocks, setEmergencyDeviceLocks] = useState<Record<string, string>>({});
  
  const [unsyncedEmergencyData, setUnsyncedEmergencyData] = useState<any[]>([]);
  const [isDumping, setIsDumping] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerSuccess, setScannerSuccess] = useState('');
  
  const [activeTab, setActiveTab] = useState<'verified' | 'missing' | 'manual' | 'suspicious'>('verified');
  const [confirmEndPhase, setConfirmEndPhase] = useState<boolean>(false);
  const [confirmEndSession, setConfirmEndSession] = useState<string | null>(null);

  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [preferredNameInput, setPreferredNameInput] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  // --- SCAN TO ROSTER STATES ---
  const [isScanningRoster, setIsScanningRoster] = useState(false);
  const [scannedRoster, setScannedRoster] = useState<any[]>([]);
  
  const [qrUrl, setQrUrl] = useState<string>('');
  const [refreshTimer, setRefreshTimer] = useState<number>(11);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [greeting, setGreeting] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // --- EXCUSE INBOX STATES ---
  const [excuses, setExcuses] = useState<any[]>([]);
  const [selectedExcuse, setSelectedExcuse] = useState<any>(null);
  const [showExcuses, setShowExcuses] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sosFileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com";
  const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || "https://uba-veltech-attendance-system.vercel.app"; 

  const fetchMyProfile = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/user-profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMyProfile(data);
        if (!data || !data.name) setShowNamePrompt(true);

        // 🚀 ONESIGNAL INIT FOR COORDINATORS
        if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
          try {
            const OneSignal = (window as any).plugins?.OneSignal;
            if (OneSignal) {
              OneSignal.initialize("19e04964-ec0f-44c4-a1df-e56989f568f8"); 
              OneSignal.Notifications.requestPermission(true);
              // Tag them as a Coordinator!
              const vtuExtract = data.vtuNumber || auth.currentUser?.email?.split('@')[0].toUpperCase();
              OneSignal.User.addTag("vtu", vtuExtract);
              OneSignal.User.addTag("role", data.role || "coordinator");
            }
          } catch (err) {
            console.log("OneSignal Init skipped (Not running in Native APK)");
          }
        }
      }
    } catch (e) {}
  };

  const handleNameSetup = async () => {
    if (!preferredNameInput.trim()) return alert("Please enter a name");
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/complete-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: preferredNameInput, dept: 'COORDINATOR', year: 'STAFF', gender: 'N/A', phone: 'N/A' })
    });
    if (res.ok) {
      setShowNamePrompt(false);
      fetchData(true);
    }
  };

  const fetchData = async (forceSelectLatest = false) => {
    if (isOfflineMode) return; 
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;

    fetchMyProfile(token); 

    // CACHE-FIRST: Skip heavy roster fetch if we already have it locally
    const cachedRoster = localStorage.getItem('uba_master_roster');
    const hasRoster = cachedRoster && JSON.parse(cachedRoster).length > 0;

    try {
      const [res, emergencyRes] = await Promise.all([
        fetch(`${API_URL}/meetings?skipRoster=${!!hasRoster}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/emergency-reports`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      ]);
      const data = await res.json();
      const emergencyData = emergencyRes && emergencyRes.ok ? await emergencyRes.json() : { meetings: [], attendance: [] };

      if (res.ok) {
        // Tag emergency meetings with isSOS
        const sosMeetings = (emergencyData.meetings || []).map((m: any) => ({ ...m, isSOS: true, status: 'closed' }));
        const sosAttendance = emergencyData.attendance || [];

        const processedMeetings = [...data.meetings, ...sosMeetings]
          .filter((m: any) => !m.isDeleted) // TOMBSTONE FILTER
          .map((m: any) => {
          if (m.isSOS) return m; // Emergency meetings don't expire
          const createdAtTime = getSafeTime(m.createdAt, Date.now());
          const expiresAt = createdAtTime + 1800000; // 30 minutes in milliseconds
          
          // FORCE CLOSE if time has passed
          if (m.status === 'active' && Date.now() > expiresAt) {
            return { ...m, status: 'closed', attendanceActive: false };
          }
          return { ...m, calculatedExpiresAt: expiresAt };
        });

        processedMeetings.sort((a: any, b: any) => getSafeTime(b.createdAt || b.endedAt || b.syncedAt, 0) - getSafeTime(a.createdAt || a.endedAt || a.syncedAt, 0));

        setMeetings(processedMeetings);
        
        // ADDED FALLBACK: Extract attendance if embedded inside the meeting objects
        const aggregatedAttendance = Array.isArray(data.attendance) 
          ? data.attendance 
          : (data.meetings || []).flatMap((m: any) => m.attendance || []);
          
        setAttendance([...aggregatedAttendance, ...sosAttendance].filter((a: any) => !a.isDeleted)); // TOMBSTONE FILTER
        setSuspiciousLogs(data.suspiciousLogs || []);

        // SMART MERGE: Use cached roster if backend skipped it
        if (hasRoster && (!data.users || data.users.length === 0)) {
          setUsers(JSON.parse(cachedRoster!));
        } else if (data.users && data.users.length > 0) {
          setUsers(data.users);
          localStorage.setItem('uba_users_cache', JSON.stringify(data.users));
          localStorage.setItem('uba_master_roster', JSON.stringify(data.users));
        }

        // Fetch pending excuses for inbox
        const excuseRes = await fetch(`${API_URL}/meeting/excuse/list`, { headers: { Authorization: `Bearer ${token}` } });
        if (excuseRes.ok) { const d = await excuseRes.json(); setExcuses(d.excuses || []); }

        if (forceSelectLatest && processedMeetings.length > 0) {
          setSelectedMeetingId(processedMeetings[0].id);
        } else if (!selectedMeetingId) {
          const active = processedMeetings.find((m:any) => m.status === 'active');
          if(active) setSelectedMeetingId(active.id);
        }
      }
    } catch (e) {
      console.error("Fetch Error:", e);
    } finally { 
      setInitialLoad(false); 
    }
  };

  useEffect(() => {
    // 2. THE AUTH BYPASS: If we are hard-offline, skip Firebase Auth entirely.
    let unsub = () => {};
    
    if (!networkLocked) {
      unsub = auth.onAuthStateChanged((user) => { 
        if (user) fetchData(); 
        else router.push('/login'); 
      });
    }

    const saved = localStorage.getItem('uba_offline_vault');
    if (saved) setLocalOfflineScans(JSON.parse(saved));

    const savedLocks = localStorage.getItem('uba_emergency_locks');
    if (savedLocks) setEmergencyDeviceLocks(JSON.parse(savedLocks));

    // LAYER: Detect unsynced emergency data from Emergency Portal
    const unsyncedRaw = localStorage.getItem('uba_unsynced_vault');
    if (unsyncedRaw) {
      try {
        const parsed = JSON.parse(unsyncedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) setUnsyncedEmergencyData(parsed);
      } catch (e) {}
    }

    return () => unsub();
  }, [networkLocked]);

  useEffect(() => {
    const autoSyncVault = async () => {
      const savedVault = localStorage.getItem('uba_offline_vault');
      if (!savedVault || isOfflineMode || !navigator.onLine) return;

      const scans = JSON.parse(savedVault);
      if (scans.length === 0) return;

      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return; // Only sync if fully authenticated

        const res = await fetch(`${API_URL}/meeting/offline-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ scans })
        });

        if (res.ok) {
          localStorage.removeItem('uba_offline_vault');
          setLocalOfflineScans([]);
          showToast("Automatic Vault Sync Complete!");
          fetchData(true);
        }
      } catch (e) {
        console.log("Auto-sync deferred: backend unreachable");
      }
    };

    // Run on mount and periodically if online
    autoSyncVault();
    const syncInterval = setInterval(autoSyncVault, 60000); // Check every minute
    return () => clearInterval(syncInterval);
  }, [isOfflineMode]);

  const hasActiveMeeting = useMemo(() => (meetings || []).some(m => m.status === 'active'), [meetings]);

  useEffect(() => {
    const hour = new Date().getHours();
    const email = auth.currentUser?.email || '';
    // FIXED: Removed .replace(/\D/g, '') to preserve alphanumeric VTUs like CS01440051
    const vtuNumeric = email.split('@')[0].toUpperCase(); 
    const dbUser = users.find(u => u.vtuNumber === vtuNumeric) || {};
    
    const name = myProfile?.name || dbUser.name || auth.currentUser?.displayName || vtuNumeric;
    
    let g = "";
    if (hour < 10) g = `Good morning, ${name.toUpperCase()}! ☀️`;
    else if (hour < 16) g = `Good afternoon, ${name.toUpperCase()}! 🌤️`;
    else if (hour < 20) g = `Good evening, ${name.toUpperCase()}! 🌙`;
    else g = `Late night session, ${name.toUpperCase()}? 🦉`;
    
    setGreeting(g);

    const myActive = (meetings || []).filter(m => m.status === 'active' && m.coordinatorId === email);
    if (myActive.length > 1) setStatusMsg(`Looks like a busy day! 🔥 Wrap up quickly to save cloud bandwidth! 🏃💨`);
    else if (myActive.length === 1) setStatusMsg(`You're live! 🔴 Stay alert during scans.`);
    else setStatusMsg(`No active sessions. Start one? 🚀`);
  }, [meetings, users, auth.currentUser, myProfile]);

  useEffect(() => {
    const activeMeeting = (meetings || []).find(m => m.id === selectedMeetingId && m.status === 'active' && m.attendanceActive);
    if (!activeMeeting || isOfflineMode) return;

    let interval = setInterval(() => {
      const now = Date.now();
      const activePhase = activeMeeting.type === 'verifiable' ? (activeMeeting.phases || []).find((p:any) => p.status === 'active') : null;
      const endTimeToUse = activePhase ? getSafeTime(activePhase.endTime, now + 1800000) : activeMeeting.calculatedExpiresAt;

      if (now > endTimeToUse) {
        setSecondsLeft(0);
        return;
      }

      const timeSlot = Math.floor(now / 11000);
      const phaseStr = activePhase ? activePhase.id : 'none';
      const payloadString = `${activeMeeting.id}:${activeMeeting.coordinatorId}:${timeSlot}${phaseStr !== 'none' ? ':' + phaseStr : ''}`;
      // This checks the environment variable first, then uses a hardcoded backup
      const secret = process.env.NEXT_PUBLIC_QR_SECRET || 'uba_super_secret_key_123';
      const token = CryptoJS.SHA256(payloadString + secret).toString();
      
      const jsonData = JSON.stringify({ meetingId: activeMeeting.id, coordinatorEmail: activeMeeting.coordinatorId, timeSlot, token, phaseId: phaseStr });
      
      setQrUrl(`${FRONTEND_URL}/attendance?data=${btoa(jsonData)}`);
      setRefreshTimer(11 - Math.floor((now / 1000) % 11));
      setSecondsLeft(Math.max(0, Math.floor((endTimeToUse - now) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [meetings, selectedMeetingId, isOfflineMode]);

  // ==========================================================
  // UNIVERSAL CAMERA SCANNER (WORKS ONLINE & OFFLINE)
  // ==========================================================
  const playSuccessSound = () => { try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime); osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1); } catch (e) {} };
  const playErrorSound = () => { try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.3); } catch (e) {} };

  const localOfflineScansRef = useRef(localOfflineScans);
  useEffect(() => { localOfflineScansRef.current = localOfflineScans; }, [localOfflineScans]);
  
  const attendanceRef = useRef(attendance);
  useEffect(() => { attendanceRef.current = attendance; }, [attendance]);

  const selectedMeetingIdRef = useRef(selectedMeetingId);
  useEffect(() => { selectedMeetingIdRef.current = selectedMeetingId; }, [selectedMeetingId]);

  const meetingsRef = useRef(meetings);
  useEffect(() => { meetingsRef.current = meetings; }, [meetings]);

  const isScanningRosterRef = useRef(isScanningRoster);
  useEffect(() => { isScanningRosterRef.current = isScanningRoster; }, [isScanningRoster]);
  
  const scannedRosterRef = useRef(scannedRoster);
  useEffect(() => { scannedRosterRef.current = scannedRoster; }, [scannedRoster]);

  useEffect(() => {
    if (!showScanner) return;
    let scanner: any;

    const displayMeeting = meetingsRef.current.find(m => m.id === selectedMeetingIdRef.current);
    const activePhase = displayMeeting?.type === 'verifiable' ? (displayMeeting.phases || []).find((p:any) => p.status === 'active') : null;
    const phaseIdToUse = activePhase ? activePhase.id : 'none';

    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, videoConstraints: { facingMode: "environment" } }, false);
      
      scanner.render((decodedText: string) => {
        if (document.getElementById('scanner-overlay-active')) return;

        try {
          const payload = JSON.parse(atob(decodedText));
          const { vtu, timeSlot, hash, deviceId, isEmergency } = payload; 
          const currentSlot = Math.floor(Date.now() / 20000);
          
          if (Math.abs(currentSlot - timeSlot) > 1) {
            playErrorSound(); setScannerError(`PROXY DETECTED: Code Expired!`); setTimeout(() => setScannerError(''), 2500); return;
          }
          
          const dailySeed = localStorage.getItem('uba_daily_seed') || 'uba_offline_master_secret';
          const expectedHash = CryptoJS.SHA256(`${vtu}:${timeSlot}:${dailySeed}`).toString();
          
          if (hash !== expectedHash) {
            playErrorSound(); setScannerError(`INVALID SIGNATURE!`); setTimeout(() => setScannerError(''), 2500); return;
          }

          // --- STRICT EMERGENCY DEVICE LOCK ---
          if (isEmergency) {
            const currentLocks = JSON.parse(localStorage.getItem('uba_emergency_locks') || '{}');

            // If device is already locked to a DIFFERENT VTU
            if (currentLocks[deviceId] && currentLocks[deviceId] !== vtu) {
              playErrorSound();
              setScannerError(`🚨 PROXY BLOCKED: Phone locked to ${currentLocks[deviceId]}`);
              setTimeout(() => setScannerError(''), 3500);
              return;
            }

            // Lock the device to this VTU if it's new
            if (!currentLocks[deviceId]) {
              currentLocks[deviceId] = vtu;
              localStorage.setItem('uba_emergency_locks', JSON.stringify(currentLocks));
              setEmergencyDeviceLocks(currentLocks);
            }
          }

          // --- ROSTER SCANNING MODE INTERCEPTION ---
          if (isScanningRosterRef.current) {
             if (scannedRosterRef.current.some((s:any) => s.vtu === vtu)) {
                playErrorSound(); setScannerError(`ALREADY IN ROSTER: ${vtu}`); setTimeout(() => setScannerError(''), 2000); return;
             }
             playSuccessSound();
             setScannerSuccess(`${vtu} ADDED TO ROSTER`);
             setTimeout(() => setScannerSuccess(''), 1500);
             setScannedRoster(prev => [...prev, { vtu, name: `Scanned: ${vtu}`, phone: 'N/A' }]);
             return; 
          }
          // -----------------------------------------

          // ZERO-TRUST DEVICE CHECK (From Cache)
          const usersCacheStr = localStorage.getItem('uba_users_cache');
          if (usersCacheStr && deviceId) {
             const usersCache = JSON.parse(usersCacheStr);
             const userProfile = usersCache.find((u: any) => u.vtuNumber === vtu || (u.email && u.email.toUpperCase().includes(vtu)));
             if (userProfile && userProfile.registeredDeviceId && userProfile.registeredDeviceId !== deviceId) {
                 playErrorSound(); setScannerError(`DEVICE BLOCKED: WRONG PHONE FOR ${vtu}!`); setTimeout(() => setScannerError(''), 3500); return; 
             }
          }
          
          const meetingIdToUse = selectedMeetingIdRef.current;
          
          // Check for dupes USING REFS
          const isDupeOffline = localOfflineScansRef.current.some(s => s.vtuNumber === vtu && s.meetingId === meetingIdToUse && s.phaseId === phaseIdToUse);
          const isDupeOnline = attendanceRef.current.some(a => (a.vtuNumber === vtu || a.vtu === vtu) && a.meetingId === meetingIdToUse && a.phaseId === phaseIdToUse);
          
          if (isDupeOffline || isDupeOnline) {
            playErrorSound(); setScannerError(`ALREADY SCANNED: ${vtu}`); setTimeout(() => setScannerError(''), 2000); return;
          }

          playSuccessSound();
          setScannerSuccess(`${vtu} VERIFIED`);
          setTimeout(() => setScannerSuccess(''), 1500);

          // --- AUTO-FETCH NAME FOR CAMERA SCAN ---
          const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');
          const usersCacheLocal = JSON.parse(localStorage.getItem('uba_users_cache') || '[]');
          const currentMeeting = meetingsRef.current?.find((m:any) => m.id === meetingIdToUse);
          const dbUser = masterRoster.find((u:any) => String(u.vtuNumber) === String(vtu)) || usersCacheLocal.find((u:any) => String(u.vtuNumber) === String(vtu));
          const manifestUser = currentMeeting?.manifest?.find((m:any) => String(m.vtu) === String(vtu));
          const resolvedName = dbUser?.name || manifestUser?.name || `Guest ${vtu}`;
          const autoCategory = dbUser ? (dbUser.isGuest ? 'Guest' : 'UBA Member') : 'Guest';
          // ---------------------------------------

          if (isOfflineMode) {
              const newScan = { 
                meetingId: meetingIdToUse, action: 'add', vtu: vtu, isOverride: false, enteredBy: auth.currentUser?.email,
                studentName: resolvedName, overrideCategory: autoCategory,
                timestamp: Date.now(), dateString: new Date().toLocaleString(), vtuNumber: vtu, phaseId: phaseIdToUse,
                ...(isEmergency ? { isEmergency: true, emergencyDeviceId: deviceId } : {})
              };
              const updated = [...localOfflineScansRef.current, newScan];
              setLocalOfflineScans(updated);
              localStorage.setItem('uba_offline_vault', JSON.stringify(updated));
          } else {
             const pushScan = async () => {
                const token = await auth.currentUser?.getIdToken();
                await fetch(`${API_URL}/meeting/update-manifest`, {
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ 
                    meetingId: meetingIdToUse, action: 'add', vtu, isOverride: false, 
                    studentName: resolvedName, category: autoCategory,
                    enteredBy: auth.currentUser?.email, phaseId: phaseIdToUse 
                  })
                });
                fetchData(true);
             };
             pushScan();
          }

        } catch (err) {
          playErrorSound(); setScannerError(`INVALID QR FORMAT`); setTimeout(() => setScannerError(''), 2000);
        }
      }, (error: any) => { });
    }).catch(err => console.error("Camera load failed", err));

    return () => { if (scanner) scanner.clear().catch(console.error); };
  }, [showScanner, isOfflineMode]);

  // --- HANDLERS ---
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  // --- FEATURE 8: BULK BLAST WARNING ---
  const handleBulkBlast = (type: 'whatsapp' | 'sms', missingList: any[], meetingTitle: string) => {
    if (missingList.length === 0) return showToast("No missing students to warn.");

    // 1. Extract phone numbers from Master Roster using VTUs in missingList
    const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');
    const missingPhones = missingList.map((m: any) => {
      const studentProfile = masterRoster.find((u: any) => String(u.vtuNumber) === String(m.vtu));
      return studentProfile ? studentProfile.phone : null;
    }).filter(phone => phone && phone !== 'N/A' && phone.length >= 10);

    if (missingPhones.length === 0) return showToast("No valid phone numbers found for missing students.");

    // 2. Format the message
    const message = `🚨 UBA ALERT: You are currently marked MISSING for the active phase of ${meetingTitle}. Report to the coordinator immediately or a strike will be applied.`;
    const encodedMessage = encodeURIComponent(message);

    // 3. Trigger Native Protocols
    if (type === 'sms') {
      // SMS protocol for multiple numbers (comma separated on Android, ampersand on iOS)
      const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : ',';
      const phoneString = missingPhones.join(separator);
      window.location.href = `sms:${phoneString}?body=${encodedMessage}`;
    } else if (type === 'whatsapp') {
      // Note: WhatsApp API doesn't support bulk messaging to unsaved contacts without a Business API.
      // This fallback creates a single click-to-chat for the first missing student as a quick-action,
      // but informs the user if there are multiple.
      if (missingPhones.length > 1) {
          alert(`WhatsApp does not allow bulk spamming to unsaved numbers. \n\nOpening chat for the first missing student. For the rest, please use the SMS Blast option or message them individually from their dossier.`);
      }
      const firstPhone = missingPhones[0].replace(/\D/g, '');
      window.open(`https://wa.me/91${firstPhone}?text=${encodedMessage}`, '_blank');
    }
  };

  const handleCreateMeeting = async () => {
    if (!newTitle.trim()) return showToast("Enter a meeting title!");
    if (isCreating) return; 
    setIsCreating(true); setCreationStatus("Calling backend API...");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/meeting/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle, type: meetingMode, isOfflineEnabled: isOfflineMode })
      });
      setCreationStatus("Finalizing...");
      if (res.ok) { setNewTitle(''); await fetchData(true); showToast(isOfflineMode ? "Offline Vault Active" : "Session Launched!"); } 
      else { showToast("Failed to launch session."); }
    } catch (error) { showToast("Network timeout. Check connection."); } 
    finally { setTimeout(() => { setIsCreating(false); setCreationStatus(''); }, 500); }
  };

  const handleActivateScheduled = async () => {
    // ⚡ GRAB THE CORRECT ID, EVEN IF NULL
    const targetId = selectedMeetingId || (meetings.length > 0 ? meetings[0].id : null);
    if (!targetId) return;

    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/meeting/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: targetId }) // ⚡ USE targetId HERE
      });
      if (res.ok) {
        showToast("Scheduled Session is now LIVE! 🔴");
        fetchData(true);
      } else {
        showToast("Failed to activate session.");
      }
    } catch (e) {
      showToast("Network error.");
    }
    setIsProcessing(false);
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n');
      const students: any[] = [];
      lines.forEach((line, i) => {
        if (i === 0) return; 
        const cols = line.split(',');
        if (cols.length >= 3) {
          const vtu = cols[2]?.replace(/"/g, '').trim().toUpperCase();
          const name = cols[1]?.replace(/"/g, '').trim();
          const phone = cols[5]?.replace(/"/g, '').trim();
          if (vtu) students.push({ vtu, name, phone });
        }
      });
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_URL}/meeting/update-manifest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: selectedMeetingId, action: 'add_bulk', students })
      });
      fetchData(false);
      showToast(`${students.length} students appended to Base Roster`);
    };
    reader.readAsText(file);
  };

  const handlePushScannedRoster = async () => {
    if (isProcessing) return;
    if (scannedRoster.length === 0) return showToast("No students scanned!");
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/meeting/update-manifest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId: selectedMeetingId, action: 'add_bulk', students: scannedRoster })
    });
    setScannedRoster([]); setIsScanningRoster(false); setShowScanner(false);
    fetchData(false);
    showToast(`${scannedRoster.length} students locked into Master Roster!`);
    setTimeout(() => setIsProcessing(false), 30000);
  };

  const handleManualAdd = async (overridePhaseId?: string) => {
    if (isProcessing) return;
    if (!manualVtu.trim()) return showToast("Enter VTU Number");
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    
    const vtus = manualVtu.split(/[\s,]+/).filter(v => v.length > 0);
    
    const displayMeeting = meetings.find(m => m.id === selectedMeetingId);
    const activePhase = displayMeeting?.type === 'verifiable' ? (displayMeeting.phases || []).find((p:any) => p.status === 'active') : null;
    const targetPhaseId = overridePhaseId || (activePhase ? activePhase.id : 'none');

    // --- AUTO-FETCH REAL NAME & STATUS ---
    const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');

    if (isOfflineMode) {
      const vault = JSON.parse(localStorage.getItem('uba_offline_vault') || '[]');
      const newScans = vtus.map(v => {
        const vtuToUse = v.toUpperCase().trim();
        const dbUser = masterRoster.find((u:any) => String(u.vtuNumber) === vtuToUse) || users.find((u:any) => String(u.vtuNumber) === vtuToUse);
        const manifestUser = displayMeeting?.manifest?.find((m:any) => String(m.vtu) === vtuToUse);
        
        const resolvedName = dbUser?.name || manifestUser?.name || `Guest ${vtuToUse}`;
        const autoCategory = dbUser ? (dbUser.isGuest ? 'Guest' : 'UBA Member') : 'Guest';

        return {
          meetingId: selectedMeetingId, action: 'add', vtu: vtuToUse,
          studentName: resolvedName, timestamp: Date.now(), isOverride: true,
          overrideCategory: autoCategory,
          enteredBy: auth.currentUser?.email || 'Offline_Coord', phaseId: targetPhaseId, isEmergency: isOfflineMode,
          vtuNumber: vtuToUse, dateString: new Date().toLocaleString()
        };
      });
      const updatedVault = [...vault, ...newScans];
      localStorage.setItem('uba_offline_vault', JSON.stringify(updatedVault));
      setLocalOfflineScans(updatedVault);
      showToast(`${vtus.length} VTUs injected into Vault`);
    } else {
      for (const v of vtus) {
        const vtuToUse = v.toUpperCase().trim();
        const dbUser = masterRoster.find((u:any) => String(u.vtuNumber) === vtuToUse) || users.find((u:any) => String(u.vtuNumber) === vtuToUse);
        const manifestUser = displayMeeting?.manifest?.find((m:any) => String(m.vtu) === vtuToUse);
        
        const resolvedName = dbUser?.name || manifestUser?.name || `Guest ${vtuToUse}`;
        const autoCategory = dbUser ? (dbUser.isGuest ? 'Guest' : 'UBA Member') : 'Guest';

        const payload = { 
          meetingId: selectedMeetingId, action: 'add', vtu: vtuToUse, isOverride: true, 
          category: autoCategory, studentName: resolvedName, enteredBy: auth.currentUser?.email, phaseId: targetPhaseId 
        };
        await fetch(`${API_URL}/meeting/update-manifest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      }
      await fetchData(false);
      showToast(`${vtus.length} Manual Override(s) Verified`);
    }
    setManualVtu('');
    setTimeout(() => setIsProcessing(false), 1000);
  };

  const handleLocalRemove = (vtuToRemove: string) => {
    const savedVault = localStorage.getItem('uba_offline_vault');
    if (!savedVault) return;
    
    const vault = JSON.parse(savedVault);
    const updatedVault = vault.filter((s: any) => !( (s.vtu === vtuToRemove || s.vtuNumber === vtuToRemove) && s.meetingId === selectedMeetingId));
    
    localStorage.setItem('uba_offline_vault', JSON.stringify(updatedVault));
    setLocalOfflineScans(updatedVault);
    showToast(`Deleted: ${vtuToRemove}`);
  };

  const handleOfflineSync = async () => {
    if (isProcessing || localOfflineScans.length === 0) return;
    setIsSyncing(true);
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/meeting/offline-sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scans: localOfflineScans })
      });
      if (res.ok) {
        setLocalOfflineScans([]); localStorage.removeItem('uba_offline_vault');
        showToast("Cloud Sync Successful!"); await fetchData(true);
      } else { showToast("Sync Rejected: Session was not flagged for offline use."); }
    } catch (e) { showToast("Sync Failed. No Internet."); } 
    finally { setIsSyncing(false); setTimeout(() => setIsProcessing(false), 30000); }
  };

  useEffect(() => {
    const checkNetworkQuality = () => {
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
          if (!isOfflineMode) setShowLowNetworkWarning(true);
        } else {
          setShowLowNetworkWarning(false);
        }
      }
    };
    checkNetworkQuality();
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', checkNetworkQuality);
    }
    return () => {
      if ('connection' in navigator) {
        (navigator as any).connection.removeEventListener('change', checkNetworkQuality);
      }
    };
  }, [isOfflineMode]);

  useEffect(() => {
    const handleNetworkReturn = () => {
      if (navigator.onLine && localOfflineScans.length > 0 && !isSyncing) {
        setIsOfflineMode(false); 
        handleOfflineSync();     
      }
    };
    window.addEventListener('online', handleNetworkReturn);
    const backupSyncTimer = setInterval(() => {
      if (navigator.onLine && localOfflineScans.length > 0 && !isSyncing) {
        handleOfflineSync();
      }
    }, 30000);
    return () => {
      window.removeEventListener('online', handleNetworkReturn);
      clearInterval(backupSyncTimer);
    };
  }, [localOfflineScans, isSyncing]);

  const handleManualRemove = async (vtu: string) => {
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/meeting/update-manifest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId: selectedMeetingId, action: 'remove', vtu })
    });
    fetchData(false);
  };

  const handleStartPhase = async () => {
    if (!newPhaseTitle.trim()) return showToast("Enter phase name");
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/meeting/create-phase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId: selectedMeetingId, phaseTitle: newPhaseTitle })
    });
    setNewPhaseTitle(''); fetchData(false);
    showToast("Phase Started!");
  };

  const handleClosePhase = async () => {
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/meeting/close-phase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId: selectedMeetingId })
    });
    setConfirmEndPhase(false);
    fetchData(false);
  };

  const handleCloseMeeting = async () => {
    if (isOfflineMode) {
      // Local close logic remains the same
      setMeetings(prev => prev.map(m => m.id === confirmEndSession ? { ...m, status: 'closed', attendanceActive: false } : m));
      setConfirmEndSession(null);
      showToast("Session Closed Locally (Vault Mode)");
      return;
    }

    // 1. SNAPSHOT: Save the current state in case the server fails
    const previousMeetings = [...meetings];
    const meetingIdToClose = confirmEndSession;

    // 2. OPTIMISTIC UPDATE: Instantly change the UI to 'closed' (Zero Latency)
    setMeetings(prev => prev.map(m => 
      m.id === meetingIdToClose ? { ...m, status: 'closed', attendanceActive: false } : m
    ));
    setConfirmEndSession(null); // Close the popup modal instantly

    // 3. THE SERVER REQUEST
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/meeting/close`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: meetingIdToClose })
      });

      if (!res.ok) throw new Error("Server rejected closure");
      // If we reach here, the server successfully matched our Optimistic UI!
      showToast("Session Ended Successfully");

    } catch (error) {
      // 4. THE ROLLBACK: The server failed! Revert the UI back to active.
      console.error("Optimistic UI Rollback triggered:", error);
      setMeetings(previousMeetings); // Instantly restore the active session on screen
      showToast("🚨 Failed to close session on server. Reverted.");
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60); const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    meetings.forEach(m => {
      const d = new Date(getSafeTime(m.createdAt));
      months.add(`${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`);
    });
    return ['All', ...Array.from(months)];
  }, [meetings]);

  const filteredMeetings = (meetings || []).filter(m => {
    const searchMatch = (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.createdByName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const d = new Date(getSafeTime(m.createdAt));
    const mMonth = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    const monthMatch = filterMonth === 'All' || filterMonth === mMonth;
    return searchMatch && monthMatch;
  });

  const myEmail = auth.currentUser?.email || '';
  const myNameRaw = myEmail.split('@')[0].replace(/\D/g, ''); 
  const currentUserData = myProfile || users.find(u => u.vtuNumber === myNameRaw) || {};
  const myMeetings = (meetings || []).filter(m => m.coordinatorId === myEmail || (m.isSOS && m.coordinatorEmail === myEmail));
  const myTotalMeetings = myMeetings.length;
  const myTotalStudents = (attendance || []).filter(a => myMeetings.some(m => m.id === a.meetingId)).length;

  const cleanLookup = vtuLookup.trim().toUpperCase();
  const numericLookup = cleanLookup.replace(/\D/g, '');
  const searchedUser = cleanLookup ? users.find((u: any) => {
    const dbVtu = (u?.vtuNumber || '').replace(/\D/g, '');
    if (numericLookup && dbVtu === numericLookup) return true;
    if (numericLookup && dbVtu.includes(numericLookup)) return true;
    if (u?.name?.toLowerCase().includes(cleanLookup.toLowerCase())) return true;
    return false;
  }) : null;
  const searchedUserAttendance = searchedUser ? attendance.filter(a => a.vtuNumber === searchedUser.vtuNumber) : [];

  const activeMeetingExists = (meetings || []).some(m => m.status === 'active');
  const displayId = selectedMeetingId || meetings[0]?.id;
  const displayMeeting = (meetings || []).find(m => m.id === displayId);
  
  const cloudAttendees = (attendance || []).filter(a => a.meetingId === displayId);
  const localAttendees = (localOfflineScans || []).filter(s => s.meetingId === displayId);
  const totalDisplayAttendees = [...cloudAttendees, ...localAttendees];

  const isVerifiable = displayMeeting?.type === 'verifiable';
  const manifest = displayMeeting?.manifest || []; 
  const activePhase = isVerifiable ? (displayMeeting.phases || []).find((p:any) => p.status === 'active') : null;
  const completedPhases = isVerifiable ? (displayMeeting.phases || []).filter((p:any) => p.status === 'closed') : [];
  
  // 🚨 FIX 2: Unified Attendance Query - show all attendance for the meeting, not just current phase
  const allMeetingAttendees = totalDisplayAttendees; // Already filtered by meetingId above
  const tabVerified = (allMeetingAttendees || []).filter(a => !a.isOverride);
  const tabManual = (allMeetingAttendees || []).filter(a => a.isOverride);
  const verifiedVtus = allMeetingAttendees.map(a => a.vtuNumber || a.vtu);
  const tabMissing = isVerifiable ? (manifest || []).filter((m:any) => !verifiedVtus.includes(m.vtu)) : [];
  const tabSuspicious = (suspiciousLogs || []).filter(s => s.meetingId === displayId && (!activePhase || s.phaseId === activePhase.id));

  // Restore phaseAttendees for UI references
  const phaseAttendees = activePhase ? allMeetingAttendees.filter(a => a.phaseId === activePhase.id) : allMeetingAttendees;
// 🚨 FIX 3: End Phase Backend Bug - update only the phase status, not the parent meeting status
const handleEndCurrentPhase = async (meetingId: string, phaseIndexToClose: number) => {
  try {
    const meetingRef = doc(db, "meetings", meetingId);
    const fieldPath = `phases.${phaseIndexToClose}.status`;
    await updateDoc(meetingRef, {
      [fieldPath]: "closed",
      [`phases.${phaseIndexToClose}.endTime`]: Date.now()
    });
    alert("Phase ended successfully. Scanner is paused until next phase starts.");
  } catch (error) {
    console.error("Error ending phase:", error);
    alert("Failed to end phase.");
  }
};

  if (initialLoad && !networkLocked) return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 flex flex-col gap-6 w-full max-w-7xl mx-auto">
      {/* Skeleton Navbar */}
      <div className="h-20 bg-white rounded-3xl animate-pulse shadow-sm w-full"></div>
      {/* Skeleton Stat Boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white rounded-[2rem] animate-pulse shadow-sm"></div>)}
      </div>
      {/* Skeleton Main Dashboard */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-96 bg-white rounded-[3rem] animate-pulse shadow-sm"></div>
        <div className="lg:col-span-4 h-96 bg-white rounded-[3rem] animate-pulse shadow-sm"></div>
      </div>
    </div>
  );

  // --- EXCUSE RESOLUTION ---
  const resolveExcuse = async (excuseId: string, vtu: string, action: 'accept' | 'reject') => {
    const token = await auth.currentUser?.getIdToken();
    await fetch(`${API_URL}/meeting/excuse/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ excuseId, vtu, action })
    });
    setExcuses(prev => prev.filter(e => e.id !== excuseId));
    setSelectedExcuse(null);
    showToast(action === 'accept' ? 'Strike wiped!' : 'Excuse rejected');
  };

  const handleSafeLogout = () => {
    if (localOfflineScans.length > 0) {
      alert("🚨 STOP! You have unsynced scans in your Vault.\n\nPlease connect to Wi-Fi and hit 'Sync to Cloud' before logging out, or you will lose attendance data!");
      return;
    }
    signOut(auth);
  };

  // EMERGENCY DATA DUMP — pushes unsynced emergency sessions to cloud
  const handleEmergencyDataDump = async () => {
    if (isDumping) return;
    setIsDumping(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert('Not authenticated. Please log in first.'); setIsDumping(false); return; }

      const vaultRaw = localStorage.getItem('uba_offline_vault');
      const allScans = vaultRaw ? JSON.parse(vaultRaw) : [];
      const emergencyScans = allScans.filter((s: any) => s.isEmergency);

      const res = await fetch(`${API_URL}/meeting/emergency-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scans: emergencyScans, sessions: unsyncedEmergencyData })
      });

      if (res.ok) {
        // Only clear on confirmed 200
        localStorage.removeItem('uba_unsynced_vault');
        // Remove emergency scans from offline vault, keep standard ones
        const remainingScans = allScans.filter((s: any) => !s.isEmergency);
        if (remainingScans.length > 0) {
          localStorage.setItem('uba_offline_vault', JSON.stringify(remainingScans));
        } else {
          localStorage.removeItem('uba_offline_vault');
        }
        setUnsyncedEmergencyData([]);
        setLocalOfflineScans(remainingScans);
        showToast('Emergency data synced to cloud!');
        fetchData(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Sync failed (${res.status}): ${errData.error || 'Server rejected the data. Try again.'}`);
      }
    } catch (e) {
      alert('Network error. Check your connection and try again.');
    } finally {
      setIsDumping(false);
    }
  };

  // SOS BACKUP FILE RESTORE — reads .txt backup and pushes to emergency-sync
  const handleSOSFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsRestoringBackup(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = JSON.parse(content);

        // Validate it's a real UBA backup
        if (!parsed.session || !parsed.session.meetingId || (!parsed.scans && !parsed.students)) {
          alert('Invalid SOS Backup File. Must be a UBA_EMERGENCY_BACKUP .txt');
          setIsRestoringBackup(false);
          return;
        }

        // Map students (legacy format) into standard scans format if needed
        let scans = parsed.scans || [];
        if (scans.length === 0 && parsed.students) {
          scans = parsed.students.map((s: any) => ({
            meetingId: parsed.session.meetingId,
            meetingTitle: parsed.session.meetingName || parsed.session.meetingTitle,
            action: 'add',
            vtu: s.vtu,
            studentName: `Restored: ${s.vtu}`,
            timestamp: s.timestamp || Date.now(),
            isOverride: true,
            enteredBy: parsed.session.coordinatorEmail || myEmail,
            isEmergency: true,
            emergencyDeviceId: 'FILE_RESTORE'
          }));
        }

        if (scans.length === 0) { alert('Backup file contains no scan data'); setIsRestoringBackup(false); return; }

        const sessions = [{
          meetingId: parsed.session.meetingId,
          meetingTitle: parsed.session.meetingName || parsed.session.meetingTitle,
          coordinatorEmail: parsed.session.coordinatorEmail,
          endedAt: Date.now(),
          scanCount: scans.length
        }];

        const token = await auth.currentUser?.getIdToken();
        if (!token) { alert('Not authenticated'); setIsRestoringBackup(false); return; }

        const res = await fetch(`${API_URL}/meeting/emergency-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ scans, sessions })
        });

        if (res.ok) {
          showToast(`Restored ${scans.length} emergency scans to cloud!`);
          fetchData(true);
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(`Restore failed: ${errData.error || 'Server error'}`);
        }
      } catch (err) {
        alert('Invalid SOS Backup File.');
      } finally {
        setIsRestoringBackup(false);
        if (sosFileInputRef.current) sosFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <ProtectedRoute allowedRoles={["coordinator", "head", "student_coordinator"]}>
      <div className="min-h-screen pb-20 font-sans transition-colors duration-300 bg-white text-gray-900">
        
        {/* IDENTITY SETUP MODAL */}
        {showNamePrompt && (
          <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center backdrop-blur-md">
            <div className="bg-white p-10 rounded-[3rem] max-w-md w-full border-4 border-[#FF5722] shadow-2xl">
              <h2 className="text-2xl font-black mb-4 uppercase italic">Identity Setup</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">What name should appear on your events?</p>
              <input type="text" value={preferredNameInput} onChange={(e)=>setPreferredNameInput(e.target.value)} placeholder="Full Name (e.g. Siddhartha Patel)" className="w-full p-4 border border-gray-100 rounded-2xl mb-6 outline-none font-bold bg-[#FFF9F5]" />
              <button onClick={handleNameSetup} className="w-full bg-[#FF5722] text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl">Complete Setup</button>
            </div>
          </div>
        )}

        {toastMsg && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#111827] text-white px-8 py-3 rounded-2xl shadow-2xl z-[100] font-black text-xs uppercase tracking-widest animate-bounce">
             {toastMsg}
          </div>
        )}

        {/* Safety Modal: End Phase */}
        {confirmEndPhase && (
          <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl animate-in zoom-in">
              <h2 className="text-3xl font-black text-red-500 mb-2">END PHASE?</h2>
              <p className="text-xs font-bold text-gray-500 mb-8 uppercase tracking-widest">Missing students will be flagged as abandoned.</p>
              <div className="flex gap-4">
                <button onClick={() => setConfirmEndPhase(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-black uppercase tracking-widest text-xs hover:bg-gray-200">Cancel</button>
                <button onClick={handleClosePhase} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black uppercase tracking-widest text-xs hover:bg-red-600 shadow-lg">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Safety Modal: End Session */}
        {confirmEndSession && (
          <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl animate-in zoom-in">
              <h2 className="text-3xl font-black text-red-500 mb-2">END TRIP?</h2>
              <p className="text-xs font-bold text-gray-500 mb-8 uppercase tracking-widest">This completely locks the event. No more phases can be added.</p>
              <div className="flex gap-4">
                <button onClick={() => setConfirmEndSession(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-black uppercase tracking-widest text-xs hover:bg-gray-200">Cancel</button>
                <button onClick={handleCloseMeeting} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black uppercase tracking-widest text-xs hover:bg-red-600 shadow-lg">End Trip</button>
              </div>
            </div>
          </div>
        )}

        {/* INLINE NAVBAR WITH HAMBURGER DROPDOWN */}
        <nav className="bg-white border-b-2 border-[#FF5722] p-3 md:p-4 sticky top-0 z-40 shadow-sm relative">
          <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <img src="/uba-logo.png" alt="UBA Logo" className="h-8 w-8 md:h-10 md:w-10 object-contain rounded-full" />
              <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase text-gray-900 italic">UBA CLUB</h1>
            </div>
            <div className="flex gap-2 items-center">
              <button 
                onClick={() => setIsOfflineMode(!isOfflineMode)}
                className={`px-3 py-2 md:px-4 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isOfflineMode ? 'bg-red-500 border-red-500 text-white animate-pulse' : 'border-[#FF5722] text-[#FF5722]'}`}
              >
                {isOfflineMode ? '● Vault' : '● Online'}
              </button>
              <button onClick={() => fetchData(false)} className="text-[9px] md:text-xs font-black px-3 py-2 md:px-4 md:py-2 rounded-xl uppercase border-2 border-gray-200 text-gray-500 hover:bg-gray-100 transition tracking-widest">Sync</button>
              <button onClick={handleSafeLogout} className="hidden md:block text-[9px] md:text-xs font-black px-3 py-2 md:px-4 md:py-2 rounded-xl uppercase tracking-widest border-2 border-[#111827] text-[#111827] hover:bg-[#111827] hover:text-white transition">Logout</button>
              
              {/* HAMBURGER BUTTON */}
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors ml-1 relative">
                <div className={`w-5 h-0.5 bg-gray-600 mb-1.5 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
                <div className={`w-5 h-0.5 bg-gray-600 mb-1.5 transition-all ${isMenuOpen ? 'opacity-0' : ''}`}></div>
                <div className={`w-5 h-0.5 bg-gray-600 transition-all ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></div>
                {/* Red dot if there are pending excuses */}
                {excuses.length > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 border-2 border-white rounded-full"></span>}
              </button>
            </div>
          </div>

          {/* DROPDOWN MENU */}
          {isMenuOpen && (
            <div className="absolute top-full right-4 mt-2 w-64 bg-white border-2 border-gray-100 rounded-2xl shadow-2xl p-2 z-50 animate-in slide-in-from-top-2">
              <button 
                onClick={() => { setShowExcuses(!showExcuses); setIsMenuOpen(false); }} 
                className="w-full flex justify-between items-center p-4 rounded-xl hover:bg-orange-50 transition-colors text-left"
              >
                <span className="font-black text-xs uppercase tracking-widest text-gray-800 flex items-center gap-2">
                  📥 Excuses Inbox
                </span>
                {excuses.length > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-md">{excuses.length}</span>
                )}
              </button>
              <div className="h-px bg-gray-100 w-full my-1 md:hidden"></div>
              <button onClick={handleSafeLogout} className="md:hidden w-full text-left p-4 rounded-xl font-black text-xs uppercase tracking-widest text-red-500 hover:bg-red-50 transition-colors">
                Logout
              </button>
            </div>
          )}
        </nav>

        {/* EXCUSE MODAL */}
        {selectedExcuse && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95">
              <h3 className="font-black text-xl text-gray-900 mb-1">Absence Excuse</h3>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">VTU: {selectedExcuse.vtu} • Event: {selectedExcuse.eventTitle}</p>
              
              <div className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-100">
                <p className="text-sm font-medium text-gray-800 italic">"{selectedExcuse.reason || 'No reason provided.'}"</p>
              </div>

              <div className="h-48 w-full rounded-xl overflow-hidden mb-6 border-2 border-gray-200 z-0 relative">
                <LeafletMap lat={selectedExcuse.lat} lng={selectedExcuse.lng} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => resolveExcuse(selectedExcuse.id, selectedExcuse.vtu, 'reject')} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest border border-red-100 hover:bg-red-500 hover:text-white transition">Reject (Keep Strike)</button>
                <button onClick={() => resolveExcuse(selectedExcuse.id, selectedExcuse.vtu, 'accept')} className="flex-1 bg-green-500 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md hover:bg-green-600 transition">Accept (Wipe Strike)</button>
              </div>
              <button onClick={() => setSelectedExcuse(null)} className="w-full mt-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest py-2">Cancel</button>
            </div>
          </div>
        )}

        {/* EXCUSE LIST */}
        {showExcuses && (
          <div className="max-w-xl mx-auto w-full px-4 mb-6 space-y-3">
            {excuses.map(e => (
              <div key={e.id} onClick={() => setSelectedExcuse(e)} className={`p-4 rounded-2xl border cursor-pointer hover:shadow-md transition bg-white flex justify-between items-center ${e.status === 'submitted' ? 'border-orange-300' : 'border-gray-200'}`}>
                <div>
                  <p className="font-black text-sm text-gray-900">{e.eventTitle}</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">VTU: {e.vtu}</p>
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${e.status === 'submitted' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {e.status === 'submitted' ? 'Action Required' : 'Awaiting Student'}
                </span>
              </div>
            ))}
          </div>
        )}

        <main className="max-w-7xl mx-auto p-4 md:p-6 mt-4 flex flex-col lg:grid lg:grid-cols-12 gap-8">
                    {/* ⚡ THE NOTIFICATION BUTTON ⚡ */}
                    <div className="lg:col-span-12 w-full">
                      <SubscribeButton 
                        vtu={currentUserData.vtuNumber || myNameRaw || 'COORD'} 
                        year={currentUserData.year || 'STAFF'} 
                        dept={currentUserData.dept || 'COORD'} 
                        role="coordinator" 
                      />
                    </div>
          
          {/* EMERGENCY RECOVERY BANNER */}
          {unsyncedEmergencyData.length > 0 && (
            <div className="lg:col-span-12 bg-red-50 border-2 border-red-500 p-6 rounded-[2rem] shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
               <div>
                 <p className="text-red-600 font-black text-sm uppercase tracking-widest flex items-center gap-2"><span>⚠️</span> UNSYNCED EMERGENCY DATA DETECTED ({unsyncedEmergencyData.reduce((sum: number, s: any) => sum + (s.scanCount || 0), 0)} students)</p>
                 <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-widest">{unsyncedEmergencyData.length} emergency session(s) waiting for cloud sync. Do NOT clear browser data.</p>
               </div>
               <button
                 onClick={handleEmergencyDataDump}
                 disabled={isDumping}
                 className={`w-full md:w-auto px-8 py-4 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all whitespace-nowrap ${
                   isDumping ? 'bg-gray-400 text-white cursor-wait' : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                 }`}
               >
                 {isDumping ? 'SYNCING...' : 'DUMP TO CLOUD'}
               </button>
            </div>
          )}

          {/* LOW NETWORK BANNER */}
          {showLowNetworkWarning && !isOfflineMode && (
            <div className="lg:col-span-12 bg-yellow-50 border-2 border-yellow-400 p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4">
               <div>
                 <p className="text-yellow-600 font-black text-sm uppercase tracking-widest flex items-center gap-2"><span>⚠️</span> Weak Signal Detected</p>
                 <p className="text-yellow-700 text-[10px] font-bold mt-1 uppercase tracking-widest">Your internet is crawling. Switch to Offline Vault to prevent scan delays.</p>
               </div>
               <button onClick={() => { setIsOfflineMode(true); setShowLowNetworkWarning(false); }} className="w-full md:w-auto bg-yellow-500 text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-yellow-600 transition-colors whitespace-nowrap">
                  Enable Vault Mode
               </button>
            </div>
          )}

          {/* HEADER GREETING */}
          <div className="order-first lg:col-span-12">
            <div className="p-6 md:p-8 rounded-3xl shadow-sm border border-[#FF5722] bg-[#FFF9F5]">
               <h2 className="text-3xl font-black mb-1">{greeting}</h2>
               <p className="text-xs md:text-sm font-bold text-[#FF8A50] mb-6 italic">{statusMsg}</p>
               
               <div className="flex flex-col md:flex-row gap-4 border-t border-[#FF5722]/30 pt-6">
                  <div className="flex-1">
                     <p className="font-black uppercase text-lg text-gray-900">{currentUserData.name || myNameRaw}</p>
                     <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1 text-[#A9B0B9]">{currentUserData.dept || 'DEPT'} • YEAR {currentUserData.year || 'N/A'} • VEL TECH</p>
                  </div>
                  <div className="flex-1 md:border-l md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 border-[#FF5722]/30">
                     <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-900">
                        Performance: <span className="text-[#FF5722]">{myTotalMeetings}</span> Events • <span className="text-[#FF5722]">{myTotalStudents}</span> Scans
                     </p>
                  </div>
               </div>
            </div>
          </div>

          {/* LEFT COLUMN: ACTIONS */}
          <div className="order-2 lg:order-1 lg:col-span-4 space-y-6">
            <div className={`p-6 rounded-3xl shadow-sm border-2 transition-colors border-[#FF5722] bg-white ${activeMeetingExists ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
              <h2 className="font-black mb-4 text-lg uppercase tracking-tight text-[#FF5722]">Launch Field Session</h2>
              <div className="flex p-1 rounded-xl mb-4 bg-[#FFF9F5]">
                <button onClick={() => setMeetingMode('standard')} className={`flex-1 py-3 rounded-lg text-[10px] font-black transition-all ${meetingMode === 'standard' ? `bg-[#FF5722] text-white shadow-lg` : `text-[#FF5722]`}`}>Standard</button>
                <button onClick={() => setMeetingMode('verifiable')} className={`flex-1 py-3 rounded-lg text-[10px] font-black transition-all ${meetingMode === 'verifiable' ? `bg-[#FF5722] text-white shadow-lg` : `text-[#FF5722]`}`}>Verifiable (Trip)</button>
              </div>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Village Survey A" className="w-full p-4 border border-gray-100 rounded-xl mb-4 outline-none font-bold bg-[#FFF9F5] text-center text-lg" />
              
              <button 
                onClick={handleCreateMeeting} 
                disabled={isCreating}
                className={`w-full text-white font-black py-4 rounded-xl shadow-xl transition tracking-[0.2em] uppercase text-xs flex flex-col items-center justify-center min-h-[60px] ${isCreating ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#FF5722] hover:bg-[#E64A19]'}`}
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white mb-1"></div>
                    <span className="text-[8px] animate-pulse tracking-widest">{creationStatus}</span>
                  </>
                ) : (
                  <span>Start Field Event</span>
                )}
              </button>
              {isOfflineMode && (
                <button 
                  onClick={() => {
                    if (!newTitle.trim()) return showToast("Enter a meeting title!");
                    const mockMeeting = { 
                      id: 'EMG_' + Date.now(), 
                      title: '[EMERGENCY] ' + newTitle, 
                      status: 'active', 
                      type: meetingMode, 
                      attendanceActive: true, 
                      coordinatorId: auth.currentUser?.email || 'Offline Coord',
                      isEmergency: true
                    };
                    setMeetings(prev => [mockMeeting, ...prev]);
                    setSelectedMeetingId(mockMeeting.id);
                    setNewTitle('');
                    setIsEmergencyMode(true);
                    showToast("Emergency Local Session Started!");
                  }}
                  className="w-full mt-3 bg-red-600 text-white font-black py-4 rounded-xl shadow-xl transition tracking-[0.2em] uppercase text-xs hover:bg-red-700"
                >
                  🚨 Start Emergency Event
                </button>
              )}
            </div>

            {/* OFFLINE SYNC TOOL */}
            {localOfflineScans.length > 0 && (
              <div className="p-8 rounded-[2.5rem] border-2 border-red-500 bg-red-50 shadow-2xl animate-pulse">
                <h3 className="font-black text-red-600 text-sm uppercase mb-2">Offline Vault Loaded</h3>
                <p className="text-[10px] font-bold text-red-400 mb-6 uppercase tracking-widest">{localOfflineScans.length} Scans Ready for Cloud Push</p>
                <button 
                  onClick={handleOfflineSync} disabled={isOfflineMode || isSyncing || isProcessing}
                  className="w-full bg-red-600 text-white py-5 rounded-3xl font-black text-xs uppercase shadow-xl disabled:opacity-50"
                >
                  {isSyncing ? 'Syncing Vault...' : isProcessing ? 'Cooldown...' : 'Sync to Cloud Now'}
                </button>
                {isOfflineMode && <p className="text-[9px] font-black text-center mt-4 text-red-400 uppercase italic">Must Go Online to Sync</p>}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: DASHBOARD & PHASE ARCHITECTURE */}
          <div className="order-3 lg:order-2 lg:col-span-8 lg:row-span-3">
            {displayMeeting ? (
              <div className="rounded-[3rem] shadow-2xl border-2 border-[#FF5722] overflow-hidden bg-white flex flex-col min-h-[700px]">
                
                {/* Dashboard Header */}
                <div className={`${displayMeeting.status === 'active' ? 'bg-[#FF5722]' : 'bg-[#111827]'} p-8 flex justify-between items-center text-white shrink-0`}>
                  <div>
                    <h2 className="text-3xl font-black capitalize tracking-tighter italic">{displayMeeting.title}</h2>
                    <p className="text-[10px] font-bold opacity-80 mt-1 uppercase tracking-widest">Coordinator: {displayMeeting.createdByName || displayMeeting.coordinatorId}</p>
                  </div>
                  {displayMeeting.status === 'active' && (
                    <button onClick={() => setConfirmEndSession(displayMeeting.id)} className="bg-white text-[#FF5722] px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:scale-105 transition">End Session</button>
                  )}
                </div>

                <div className="p-4 md:p-8 flex-grow flex flex-col">

                  {/* STEP 1: INITIAL ROSTER UPLOAD WITH CAMERA (Persists across all phases) */}
                  {isVerifiable && displayMeeting.status === 'active' && !activePhase && completedPhases.length === 0 && (
                    <div className="border rounded-3xl p-8 mb-8 shadow-sm bg-[#FFF9F5] border-[#FF5722]/30 flex-shrink-0 animate-in fade-in">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-lg font-black uppercase text-[#FF5722]">Base Roster Setup</h3>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Establish the Master List</p>
                        </div>
                        <button onClick={() => { setIsScanningRoster(true); setShowScanner(true); }} className="bg-[#111827] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-black transition-colors flex items-center gap-2">
                          📷 Scan to Roster
                        </button>
                      </div>

                      {isScanningRoster && showScanner ? (
                        <div className="bg-white p-6 rounded-2xl border-2 border-[#FF5722] animate-in zoom-in-95">
                           <div id="reader" className="w-full min-h-[250px] bg-black rounded-xl overflow-hidden mb-4 relative"><p className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-black uppercase tracking-widest animate-pulse z-10 pointer-events-none">Initializing Camera... Please allow permissions.</p></div>
                           {scannerSuccess && (<div className="w-full bg-green-500 text-white font-black p-3 text-center rounded-xl mb-4 animate-pulse">✅ {scannerSuccess}</div>)}
                           {scannerError && (<div className="w-full bg-red-600 text-white font-black p-3 text-center rounded-xl mb-4 animate-bounce">🚨 {scannerError}</div>)}
                           <div className="flex justify-between items-center mb-4 px-2">
                             <p className="font-black text-gray-400 uppercase text-xs">Scanned: <span className="text-[#FF5722] text-lg">{scannedRoster.length}</span></p>
                             <button onClick={() => { setIsScanningRoster(false); setShowScanner(false); setScannedRoster([]); }} className="text-[10px] font-black text-red-500 uppercase">Cancel</button>
                           </div>
                           <button onClick={handlePushScannedRoster} disabled={isProcessing} className="w-full bg-[#FF5722] text-white font-black py-4 rounded-xl uppercase text-xs shadow-xl tracking-widest disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? 'Pushing Roster...' : 'Push to Master Roster'}</button>
                        </div>
                      ) : (
                        <div className="flex flex-col md:flex-row gap-3">
                          <div className="flex gap-2 flex-1">
                            <input type="text" value={manualVtu} onChange={(e) => setManualVtu(e.target.value.toUpperCase())} placeholder="VTU Number..." className="flex-1 p-4 border border-gray-100 rounded-2xl font-mono outline-none bg-white font-black text-sm shadow-inner" />
                            <button onClick={() => handleManualAdd('initial')} disabled={isProcessing} className="bg-white border-2 border-gray-200 text-gray-800 px-6 py-3 font-black rounded-xl uppercase text-[10px] tracking-widest hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? 'Injecting...' : 'Inject'}</button>
                          </div>
                          <div className="relative overflow-hidden w-full md:w-auto border-2 font-black rounded-xl cursor-pointer transition bg-white border-[#FF5722] text-[#FF5722] hover:bg-orange-50">
                            <div className="px-6 py-4 w-full h-full text-center flex items-center justify-center uppercase text-[10px] tracking-widest">CSV Upload</div>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PHASE VIEW (The Control Center) */}
                    <div className="flex-grow flex flex-col">
                      <div className="grid md:grid-cols-2 gap-8 mb-8 shrink-0">
                        
                        {/* ONLY SHOW SCANNER IF ACTIVE */}
                        {displayMeeting.status === 'active' ? (
                          isVerifiable && !activePhase && manifest.length > 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 rounded-[3.5rem] border-2 border-dashed border-[#FF5722]/30 bg-[#FFF9F5] shadow-inner relative text-center">
                              <h3 className="font-black text-xl text-[#FF5722] mb-2 uppercase tracking-widest">Phase Ended</h3>
                              <p className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">Scanner Disabled. Start next checkpoint.</p>
                              <input type="text" value={newPhaseTitle} onChange={(e)=>setNewPhaseTitle(e.target.value)} placeholder="e.g. Lunch Checkpoint" className="w-full p-4 border border-[#FF5722]/20 rounded-2xl mb-4 outline-none font-bold text-center bg-white shadow-sm" />
                              <button onClick={handleStartPhase} className="w-full bg-[#FF5722] text-white font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Launch Phase</button>
                            </div>
                          ) : (
                          <div className="flex flex-col items-center justify-center p-8 rounded-[3.5rem] border-2 border-[#FF5722] bg-[#FFF9F5] shadow-inner relative">
                            <h3 className="font-black text-xs mb-6 text-center uppercase tracking-[0.3em] text-[#FF5722] underline">
                              {activePhase ? activePhase.title : 'Anti-proxy qr'}
                            </h3>
                            
                            {/* UNIVERSAL CAMERA OVERLAY */}
                            {showScanner ? (
                               <div className="w-full flex flex-col items-center animate-in zoom-in-95 z-20 bg-white p-4 rounded-3xl shadow-2xl absolute top-4 left-4 right-4">
                                  <div id="reader" className="w-full min-h-[250px] bg-black rounded-2xl overflow-hidden mb-4 relative"><p className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-black uppercase tracking-widest animate-pulse z-10 pointer-events-none">Initializing Camera... Please allow permissions.</p></div>
                                  {scannerSuccess && (<div className="w-full bg-green-500 text-white font-black p-3 text-center rounded-xl mb-4 animate-pulse">✅ {scannerSuccess}</div>)}
                                  {scannerError && (<div className="w-full bg-red-600 text-white font-black p-3 text-center rounded-xl mb-4 animate-bounce">🚨 {scannerError}</div>)}
                                  <button onClick={() => { setShowScanner(false); setScannerError(''); setScannerSuccess(''); }} className="w-full bg-red-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-lg hover:bg-red-700 active:scale-95 transition-all">✕ Close Camera</button>
                               </div>
                            ) : (
                               <>
                                {!isOfflineMode && displayMeeting?.status === 'active' ? (
                                  <div className="bg-white p-4 rounded-[2rem] shadow-xl border-4 border-white mb-6">
                                    {qrUrl ? <QRCode value={qrUrl} size={180} fgColor="#111827" /> : <div className="h-[180px] w-[180px] flex items-center justify-center font-black animate-pulse text-gray-200">GENERATING...</div>}
                                  </div>
                                ) : isOfflineMode ? (
                                  <div className="h-[180px] flex flex-col justify-center items-center opacity-50 mb-6">
                                    <div className="text-4xl mb-2">🛡️</div>
                                    <p className="font-black uppercase tracking-widest text-xs">Vault Mode</p>
                                  </div>
                                ) : <p className="font-black text-[#FF5722] text-xl uppercase italic mb-6">Expired</p>}
                               </>
                            )}

                            <div className="w-full flex gap-3 mb-6">
                              <button onClick={() => setShowScanner(true)} className="flex-1 bg-[#111827] text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition flex items-center justify-center gap-2">
                                  📷 Scan ID
                              </button>
                              {!isOfflineMode && (
                                <div className="px-4 border-2 border-[#FF5722]/20 bg-white rounded-2xl flex flex-col justify-center items-center shadow-sm">
                                  <p className="text-xl font-black font-mono text-[#FF5722] leading-none">{refreshTimer}s</p>
                                </div>
                              )}
                            </div>

                            <div className="w-full border-t border-[#FF5722]/20 pt-4">
                               <h3 className="font-black mb-3 uppercase text-[9px] tracking-widest text-gray-400 text-center">Manual Inject</h3>
                               <div className="flex gap-2">
                                 <input type="text" value={manualVtu} onChange={(e)=>setManualVtu(e.target.value.toUpperCase())} placeholder="VTU..." className="flex-1 p-3 text-sm border border-gray-100 rounded-xl outline-none font-mono font-black text-center bg-white shadow-sm" onKeyDown={(e) => { if (e.key === 'Enter') handleManualAdd(); }}/>
                                 <button onClick={() => handleManualAdd()} disabled={isProcessing} className="bg-gray-200 text-gray-800 px-4 rounded-xl font-black text-[10px] uppercase hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? 'Adding...' : 'Add'}</button>
                               </div>
                            </div>
                          </div>
                          )
                        ) : displayMeeting.status === 'scheduled' ? (
                          <div className="flex flex-col items-center justify-center p-8 rounded-[3.5rem] border-2 border-dashed border-[#FF5722]/40 bg-[#FFF9F5] relative text-center shadow-inner">
                             <span className="text-5xl mb-4 animate-bounce">⏳</span>
                             <h3 className="font-black text-xl text-[#FF5722] uppercase tracking-widest">Scheduled Event</h3>
                             <p className="text-xs font-bold text-gray-500 mt-2 mb-6 uppercase tracking-widest">Date: {displayMeeting.date} @ {displayMeeting.time}</p>
                             <button onClick={handleActivateScheduled} disabled={isProcessing} className="bg-[#FF5722] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-[#E64A19] hover:-translate-y-1 transition-all disabled:opacity-50">
                               {isProcessing ? 'Starting...' : 'Start Session Now'}
                             </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 rounded-[3.5rem] border-2 border-gray-100 bg-gray-50 relative text-center shadow-inner">
                             <span className="text-5xl mb-4 grayscale opacity-40">🔒</span>
                             <h3 className="font-black text-xl text-gray-400 uppercase tracking-widest">Session Closed</h3>
                             <p className="text-xs font-bold text-gray-400 mt-2 uppercase tracking-widest">Scanning is Disabled</p>
                          </div>
                        )}

                        <div className="flex flex-col justify-between">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-[#111827] p-6 rounded-[2rem] text-center shadow-sm">
                               <h4 className="text-4xl font-black text-white mb-1">{phaseAttendees.length}</h4>
                               <p className="text-[9px] font-black uppercase tracking-widest text-[#FF5722]">Live Count</p>
                            </div>
                            <div className="bg-[#FFF9F5] p-6 rounded-[2rem] border border-[#FF5722]/20 text-center shadow-sm">
                               <h4 className="text-4xl font-black text-gray-900 mb-1">{tabVerified.length}</h4>
                               <p className="text-[9px] font-black uppercase tracking-widest text-[#FF5722]">Verified</p>
                            </div>
                            {isVerifiable && (
                              <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 text-center shadow-sm">
                                 <h4 className="text-4xl font-black text-red-500 mb-1">{tabMissing.length}</h4>
                                 <p className="text-[9px] font-black uppercase tracking-widest text-red-400">Missing</p>
                              </div>
                            )}
                          </div>
                          
                          {isVerifiable && displayMeeting.status === 'active' && (
                            <button onClick={() => setConfirmEndPhase(true)} className="w-full py-5 rounded-[2rem] border-4 border-gray-100 text-gray-500 font-black uppercase tracking-widest text-xs hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all">
                              End Phase
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="border-t-2 border-gray-100 flex-grow flex flex-col mt-4">
                        <div className="flex overflow-x-auto border-b border-gray-100 mb-4 shrink-0 no-scrollbar">
                          <button onClick={() => setActiveTab('verified')} className={`flex-1 py-4 px-6 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'verified' ? 'text-[#FF5722] border-b-2 border-[#FF5722] bg-[#FFF9F5]' : 'text-gray-400 hover:bg-gray-50'}`}>Verified ({tabVerified.length})</button>
                          {isVerifiable && <button onClick={() => setActiveTab('missing')} className={`flex-1 py-4 px-6 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'missing' ? 'text-red-500 border-b-2 border-red-500 bg-red-50' : 'text-gray-400 hover:bg-gray-50'}`}>Missing ({tabMissing.length})</button>}
                          <button onClick={() => setActiveTab('manual')} className={`flex-1 py-4 px-6 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'manual' ? 'text-gray-900 border-b-2 border-gray-900 bg-gray-100' : 'text-gray-400 hover:bg-gray-50'}`}>Manual ({tabManual.length})</button>
                          <button onClick={() => setActiveTab('suspicious')} className={`flex-1 py-4 px-6 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'suspicious' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-gray-400 hover:bg-gray-50'}`}>Suspicious ({tabSuspicious.length})</button>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto max-h-[300px] custom-scrollbar px-2 pb-4">
                          {activeTab === 'verified' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {tabVerified.map((at, i) => (
                                 <div key={i} className="p-3 rounded-xl border border-gray-200 bg-white flex justify-between items-center shadow-sm group hover:border-orange-300 transition-all">
                                   <div onClick={() => setSelectedStudent({studentName: at.studentName, vtuNumber: at.vtuNumber || at.vtu})} className="cursor-pointer flex-grow">
                                     <p className="font-black text-[15px] text-gray-900 truncate">{at.studentName || 'Unknown'}</p>
                                     <p className="text-[10px] font-mono font-black text-[#FF5722]">{at.vtuNumber || at.vtu}</p>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <span className="text-[9px] font-black text-gray-400">
                                       {/* Bulletproof time formatter */}
                                       {(() => {
                                         const t = getSafeTime(at.timestamp);
                                         if (!t) return 'Invalid Date';
                                         return new Date(t).toLocaleString('en-IN', {
                                           timeZone: 'Asia/Kolkata',
                                           hour: '2-digit',
                                           minute: '2-digit',
                                           hour12: true
                                         });
                                       })()}
                                     </span>
                                     <button 
                                       onClick={(e) => { e.stopPropagation(); if(confirm(`Remove ${at.vtuNumber || at.vtu}?`)) handleLocalRemove(at.vtuNumber || at.vtu); }}
                                       className="ml-2 p-2 bg-red-50 text-red-600 rounded-xl opacity-0 group-hover:opacity-100 active:scale-90 transition-all shadow-sm border border-red-100"
                                     >
                                       ✕
                                     </button>
                                   </div>
                                 </div>
                              ))}
                              {tabVerified.length === 0 && <p className="text-gray-300 text-xs font-black uppercase text-center w-full py-10">No verified scans</p>}
                            </div>
                          )}

                          {activeTab === 'missing' && (
                            <div className="flex flex-col gap-4">
                              {/* --- BULK BLAST UI --- */}
                              {tabMissing.length > 0 && (
                                <div className="flex gap-2 bg-red-50 p-2 rounded-2xl border border-red-100 shadow-sm shrink-0">
                                  <button onClick={() => handleBulkBlast('sms', tabMissing, displayMeeting?.title || 'Session')} className="flex-1 bg-red-500 text-white font-black text-[9px] uppercase tracking-widest py-3 rounded-xl shadow-md hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                                    💬 SMS Blast
                                  </button>
                                  <button onClick={() => handleBulkBlast('whatsapp', tabMissing, displayMeeting?.title || 'Session')} className="flex-1 bg-[#25D366] text-white font-black text-[9px] uppercase tracking-widest py-3 rounded-xl shadow-md hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.12.553 4.189 1.606 6.06L0 24l6.117-1.605a11.77 11.77 0 005.925 1.585h.005c6.635 0 12.032-5.396 12.035-12.03a11.79 11.79 0 00-3.517-8.503z"/></svg>
                                    WA Blast
                                  </button>
                                </div>
                              )}
                              {/* ----------------------- */}

                              <div className="grid md:grid-cols-2 gap-3 overflow-y-auto pr-2 custom-scrollbar max-h-[200px]">
                                {tabMissing.map((m:any, i:number) => {
                                   const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');
                                   const studentData = masterRoster.find((u:any) => String(u.vtuNumber) === String(m.vtu)) || m;
                                   const phone = studentData.phone || 'N/A';
                                   return (
                                   <div key={i} onClick={() => setSelectedStudent({studentName: m.name, vtuNumber: m.vtu, phone})} className="p-4 rounded-2xl border border-red-100 bg-white flex justify-between items-center shadow-sm cursor-pointer hover:border-red-500 transition-colors">
                                     <div><p className="font-bold text-sm text-gray-900">{m.name || 'Unknown'}</p><p className="text-[10px] font-mono font-bold text-gray-500">{m.vtu}</p></div>
                                     <div className="flex items-center gap-2">
                                       {phone !== 'N/A' && <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="text-[9px] px-2 py-1 bg-green-100 text-green-700 font-black rounded uppercase tracking-widest hover:bg-green-500 hover:text-white transition-colors">📞 Call</a>}
                                       <span className="text-[8px] px-2 py-1 bg-red-100 text-red-600 font-black rounded uppercase">Abandoned</span>
                                     </div>
                                   </div>
                                   );
                                })}
                                {tabMissing.length === 0 && manifest.length > 0 && <p className="text-green-500 text-xs font-black uppercase text-center w-full py-10 col-span-2">100% Attendance Reached!</p>}
                              </div>
                            </div>
                          )}

                          {activeTab === 'manual' && (
                            <div className="grid md:grid-cols-2 gap-3">
                              {tabManual.map((at, i) => (
                                 <div key={i} className="p-4 rounded-2xl border border-gray-200 bg-gray-50 flex justify-between items-center group hover:border-red-200 transition-all">
                                   <div onClick={() => setSelectedStudent({studentName: at.studentName, vtuNumber: at.vtuNumber || at.vtu, enteredBy: at.enteredBy})} className="cursor-pointer flex-grow">
                                     <p className="font-bold text-sm text-gray-900">{at.studentName || 'Unknown'}</p>
                                     <p className="text-[10px] font-mono font-bold text-gray-500">{at.vtuNumber || at.vtu}</p>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <div className="text-right"><p className="text-[8px] bg-orange-500 text-white px-2 py-1 rounded font-black uppercase tracking-widest mb-1 inline-block">{at.overrideCategory || 'Manual'}</p><p className="text-[8px] font-bold text-orange-400 italic block truncate w-16">By {at.enteredBy?.split('@')[0]}</p></div>
                                     <button 
                                       onClick={(e) => { e.stopPropagation(); if(confirm(`Remove ${at.vtuNumber || at.vtu}?`)) handleLocalRemove(at.vtuNumber || at.vtu); }}
                                       className="ml-2 p-2 bg-red-50 text-red-600 rounded-xl opacity-0 group-hover:opacity-100 active:scale-90 transition-all shadow-sm border border-red-100"
                                     >
                                       ✕
                                     </button>
                                   </div>
                                 </div>
                              ))}
                              {tabManual.length === 0 && <p className="text-gray-300 text-xs font-black uppercase text-center w-full py-10">No manual entries</p>}
                            </div>
                          )}

                          {activeTab === 'suspicious' && (
                            <div className="space-y-3">
                              {tabSuspicious.map((log, i) => (
                                <div key={i} className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex justify-between items-center">
                                  <div><p className="text-xs font-black text-purple-700 uppercase mb-1">Device Swap Blocked</p><p className="text-[10px] font-bold text-gray-600">Attempted VTU: <span className="font-mono text-black">{log.proxyVtu}</span></p><p className="text-[10px] font-bold text-gray-600">Actual Device Owner: <span className="font-mono text-black">{log.originalVtu}</span></p></div>
                                  <span className="text-xl">🚨</span>
                                </div>
                              ))}
                              {tabSuspicious.length === 0 && <p className="text-gray-300 text-xs font-black uppercase text-center w-full py-10">No suspicious activity</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  {/* COMPLETED PHASES SUMMARY UI */}
                  {completedPhases.length > 0 && (
                    <div className="mt-8 pt-8 border-t-4 border-gray-100 shrink-0">
                      <h3 className="font-black text-gray-400 uppercase tracking-[0.2em] text-xs mb-4">Phase History</h3>
                      <div className="flex flex-col gap-3">
                        {completedPhases.map((phase:any, idx:number) => {
                           const pAtt = totalDisplayAttendees.filter(a => a.phaseId === phase.id);
                           return (
                             <div key={idx} onClick={() => alert(`Analytics for ${phase.title}: \n\nVerified: ${pAtt.length} \nMissing: ${manifest.length - pAtt.length}`)} className="p-4 rounded-2xl border border-gray-200 bg-gray-50 flex justify-between items-center shadow-sm cursor-pointer hover:border-orange-300 transition-colors">
                               <div>
                                 <h4 className="font-black text-sm uppercase text-gray-900">{phase.title}</h4>
                                 <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Closed Checkpoint</p>
                               </div>
                               <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm text-center">
                                 <span className="font-black text-[#FF5722] text-sm">{pAtt.length}</span>
                                 <span className="text-[10px] font-black text-gray-400">/{manifest.length}</span>
                               </div>
                             </div>
                           );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="rounded-[4rem] border-4 border-dashed border-gray-100 min-h-[600px] flex flex-col items-center justify-center font-black uppercase tracking-widest text-center p-20 opacity-30">
                <img src="/uba-logo.png" alt="UBA Logo" className="h-20 w-20 mb-8 grayscale" />
                Select a session from the universal history<br/>to launch real-time dashboard
              </div>
            )}
          </div>

          {/* VTU LOOKUP TOOL (Moved here for perfect mobile flow) */}
          <div className="order-4 lg:order-3 lg:col-span-4 space-y-6">
            <div className="p-6 rounded-3xl shadow-sm border border-[#FF5722] bg-white">
              <h2 className="font-black text-sm uppercase mb-4 text-[#FF5722]">Student History Lookup</h2>
              <input 
                type="text" placeholder="Search VTU..." value={vtuLookup}
                onChange={(e) => setVtuLookup(e.target.value.toUpperCase())}
                className="w-full p-3 mb-4 text-sm rounded-xl outline-none font-mono font-bold border border-gray-100 bg-[#FFF9F5]"
              />
              {searchedUser && (
                <div 
                  onClick={() => setSelectedStudent(searchedUser)}
                  className="border border-[#FF5722]/30 rounded-2xl p-6 relative overflow-hidden cursor-pointer hover:shadow-lg hover:border-[#FF5722] transition-all group bg-white"
                >
                  <p className="font-black text-lg capitalize text-[#FF5722]">{searchedUser.name}</p>
                  <p className="text-xs font-bold mt-1 text-gray-500">{searchedUser.dept} | Year {searchedUser.year}</p>
                  <p className="text-xs font-bold mt-3">Total Events: <span className="text-[#FF5722] text-xl ml-1">{searchedUserAttendance.length}</span></p>
                </div>
              )}
            </div>

            {/* SOS RECOVERY TOOL */}
            <div className="p-6 rounded-3xl shadow-sm border-2 border-red-200 bg-white">
              <h2 className="font-black text-sm uppercase mb-4 text-red-500 flex items-center gap-2"><span>🆘</span> SOS Recovery</h2>
              <div className="relative w-full border-2 border-dashed border-red-300 bg-red-50 rounded-2xl p-6 text-center hover:bg-red-100 hover:border-red-400 transition-colors cursor-pointer group">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest group-hover:scale-105 transition-transform">{isRestoringBackup ? 'Restoring SOS Data...' : '📤 Restore from Phone Backup'}</p>
                <p className="text-[8px] font-bold text-red-400 mt-1 uppercase tracking-widest">Upload a UBA_EMERGENCY_BACKUP .txt file</p>
                <input type="file" ref={sosFileInputRef} onChange={handleSOSFileUpload} accept=".txt" className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
          </div>

          {/* RIGHT BOTTOM COLUMN: GLOBAL HISTORY */}
          <div className="order-5 lg:order-4 lg:col-span-4 space-y-6 lg:mt-0">
            <div className="p-8 rounded-[2.5rem] shadow-sm border border-[#FF5722] bg-white">
              <h2 className="font-black text-sm uppercase mb-6 tracking-widest text-gray-900">Universal Field History</h2>

              <div className="flex gap-2 mb-4">
                <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="flex-1 p-3 text-[10px] rounded-xl outline-none font-black border border-gray-100 bg-[#FFF9F5] uppercase tracking-widest">
                  {availableMonths.map(month => <option key={month} value={month}>{month}</option>)}
                </select>
              </div>

              <input type="text" placeholder="Filter history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-4 mb-6 text-xs rounded-xl outline-none font-bold border border-gray-100 bg-[#FFF9F5]" />

              <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2 mb-6">
                {filteredMeetings.map((m: any) => {
                  const isSelected = displayId === m.id;
                  const dateStr = getSafeTime(m.createdAt) ? new Date(getSafeTime(m.createdAt)).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Recent';
                  return (
                    <div key={m.id} onClick={() => setSelectedMeetingId(m.id)} className={`p-5 rounded-2xl cursor-pointer transition-all ${m.isSOS ? `border-4 border-red-600 bg-red-50 ${isSelected ? 'shadow-xl scale-105' : 'hover:border-red-400'}` : isSelected ? `bg-[#111827] border-2 border-[#FF5722] shadow-xl scale-105` : `border-2 border-gray-50 hover:border-[#FF5722]/40 bg-[#FFF9F5]/30`}`}>
                      <div className="flex justify-between items-start">
                        <p className={`font-black text-sm capitalize truncate w-32 ${m.isSOS ? 'text-red-700' : isSelected ? 'text-white' : 'text-gray-900'}`}>{m.isSOS ? `🚨 ${m.title || m.meetingTitle}` : m.title}</p>
                        <span className={`text-[8px] px-2 py-1 rounded font-black tracking-widest ${m.isSOS ? 'bg-red-600 text-white animate-pulse' : m.status === 'active' ? 'bg-[#FF5722] text-white animate-pulse' : (isSelected ? 'text-gray-400' : 'text-gray-300')}`}>
                           {m.isSOS ? 'SOS' : m.status === 'active' ? 'LIVE' : 'CLOSED'}
                        </span>
                      </div>
                      <p className={`text-[9px] font-bold uppercase mt-2 ${m.isSOS ? 'text-red-500' : isSelected ? 'text-gray-400' : 'text-gray-500'}`}>{m.isSOS ? `🚨 EMERGENCY SESSION BY: ${m.coordinatorEmail || 'Unknown'}` : `Host: ${m.createdByName || 'Coord'}`}</p>
                      <p className="text-[9px] font-black mt-1 text-[#FF5722] tracking-tighter italic">{dateStr}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* STUDENT DOSSIER MODAL */}
      {selectedStudent && (() => {
        const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');
        // Normalize VTU for matching
        const normalizeVTU = (vtu: any) => String(vtu).replace(/\D/g, '');
        const vtu = selectedStudent.vtuNumber || selectedStudent.vtu;
        const normVTU = normalizeVTU(vtu);
        const studentContact = masterRoster.find((u:any) => normalizeVTU(u.vtuNumber) === normVTU) || selectedStudent;

        // Check current meeting manifest in case they are from CSV upload
        const currentMeeting = meetings.find(m => m.id === selectedMeetingId);
        const manifestUser = currentMeeting?.manifest?.find((m:any) => normalizeVTU(m.vtu) === normVTU);

        const phoneNum = studentContact.phone || manifestUser?.phone || 'N/A';
        const studentName = studentContact.name || manifestUser?.name || selectedStudent.studentName || 'Student';

        const dept = studentContact.dept || studentContact.userData?.dept || selectedStudent.dept || manifestUser?.dept;
        const year = studentContact.year || studentContact.userData?.year || selectedStudent.year || manifestUser?.year;
        const msg = `Hi ${studentName}, this is the UBA Student Coordinator. Your attendance verification is pending. Please contact your nearby coordinator to verify immediately. Attendance closes soon.`;
        const encodedMsg = encodeURIComponent(msg);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-br from-[#FFF9F5] to-white p-6 relative border-b border-gray-100">
              <button onClick={() => setSelectedStudent(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors">✕</button>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-[#FF5722] rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-orange-200">
                  {(selectedStudent.name || selectedStudent.studentName || 'U').charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">{selectedStudent.name || selectedStudent.studentName}</h3>
                  <p className="text-[#FF5722] font-bold tracking-widest text-xs">{selectedStudent.vtuNumber || selectedStudent.vtu}</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Department</p>
                  <p className="text-sm font-bold text-gray-800">{dept || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Year</p>
                  <p className="text-sm font-bold text-gray-800">{year || 'Unknown'}</p>
                </div>
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 border-b pb-2">Verified Field History</h4>
              <div className="max-h-60 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {attendance.filter(a => normalizeVTU(a.vtuNumber) === normVTU).map((record, idx) => {
                    const sessionDetails = meetings.find(m => m.id === record.meetingId);
                    return (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:border-orange-200 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-gray-800 capitalize">{sessionDetails?.title || 'Field Session'}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{new Date(record.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {record.isOverride ? (
                            <span className="text-[9px] px-2 py-1 bg-orange-100 text-orange-600 font-black rounded uppercase tracking-widest">Manual</span>
                          ) : (
                            <span className="text-[9px] px-2 py-1 bg-green-50 text-green-600 font-black rounded uppercase tracking-widest">Verified</span>
                          )}
                          {record.isOverride && record.enteredBy && (
                            <span className="text-[7px] font-bold text-gray-400 uppercase truncate max-w-[80px]">By {record.enteredBy.split('@')[0]}</span>
                          )}
                        </div>
                      </div>
                    );
                })}
                {attendance.filter(a => normalizeVTU(a.vtuNumber) === normVTU).length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-xs font-medium italic">No verified field history found.</div>
                )}
              </div>
              {phoneNum !== 'N/A' && (
                <div className="mt-6 border-t border-dashed border-gray-100 pt-6">
                  <a href={`tel:${phoneNum}`} className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl hover:bg-green-700 active:scale-95 transition-all">
                    <span>📞</span> Dial Phone Number
                  </a>
                  <p className="text-[8px] text-center mt-3 text-gray-400 font-bold uppercase tracking-widest">Verified: {phoneNum}</p>
                </div>
              )}
              {phoneNum !== 'N/A' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <a href={`https://wa.me/91${phoneNum.replace(/\D/g, '')}?text=${encodedMsg}`} target="_blank" className="bg-[#25D366] text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.12.553 4.189 1.606 6.06L0 24l6.117-1.605a11.77 11.77 0 005.925 1.585h.005c6.635 0 12.032-5.396 12.035-12.03a11.79 11.79 0 00-3.517-8.503z"/></svg>
                    WhatsApp
                  </a>
                  <a href={`sms:+91${phoneNum.replace(/\D/g, '')}?body=${encodedMsg}`} className="bg-[#007AFF] text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
                    SMS Text
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </ProtectedRoute>
  );
}