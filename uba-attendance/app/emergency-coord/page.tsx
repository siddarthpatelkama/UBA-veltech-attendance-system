'use client';
import { useState, useEffect, useRef } from 'react';
import CryptoJS from 'crypto-js';
import Link from 'next/link';

export default function EmergencyCoord() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [meetingName, setMeetingName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [scans, setScans] = useState<any[]>([]);
  const [scannerError, setScannerError] = useState('');
  const [scannerSuccess, setScannerSuccess] = useState('');
  const [deviceLocks, setDeviceLocks] = useState<Record<string, string>>({});
  const [isResumed, setIsResumed] = useState(false);
  const [manualVtu, setManualVtu] = useState('');
  const scanCountRef = useRef(0);

  const STATIC_PASS = 'UBA-RESCUE';

  // LAYER 1: AUTO-RESUME — Check for a persisted active session on mount
  useEffect(() => {
    const savedLocks = localStorage.getItem('uba_emergency_locks');
    if (savedLocks) setDeviceLocks(JSON.parse(savedLocks));

    const savedSession = localStorage.getItem('uba_active_emergency_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        setMeetingId(session.id);
        setMeetingName(session.title);
        setEmail(session.coordinatorEmail || '');
        setIsAuthenticated(true);
        setIsResumed(true);
      } catch (e) {
        localStorage.removeItem('uba_active_emergency_session');
      }
    }
  }, []);

  // LAYER 3: UI CONTINUITY — Always pull scans from vault filtered by active meeting
  useEffect(() => {
    if (!meetingId) return;
    const savedVault = localStorage.getItem('uba_offline_vault');
    if (savedVault) {
      const allScans = JSON.parse(savedVault);
      setScans(allScans.filter((s: any) => s.isEmergency && s.meetingId === meetingId));
    }
  }, [meetingId]);

  // LAYER 1: SESSION PERSISTENCE — Hard-lock session to disk on start
  const handleLogin = () => {
    if (password !== STATIC_PASS) return alert("Invalid Emergency Passcode");
    if (!email.includes('@') || !meetingName) return alert("Email and Meeting Name required");
    const newId = 'EMG_' + Date.now();
    const mockMeeting = {
      id: newId,
      title: meetingName,
      coordinatorEmail: email,
      createdAt: Date.now(),
      isEmergency: true
    };
    localStorage.setItem('uba_active_emergency_session', JSON.stringify(mockMeeting));
    setMeetingId(newId);
    setIsAuthenticated(true);
  };

  // LAYER 2: END & LOCK — Move to unsynced vault, clear active session
  const handleEndSession = () => {
    if (!confirm('End this emergency session? Scans will be queued for cloud sync.')) return;

    // Move session metadata to unsynced vault
    const unsyncedVault = JSON.parse(localStorage.getItem('uba_unsynced_vault') || '[]');
    const sessionData = {
      meetingId,
      meetingTitle: meetingName,
      coordinatorEmail: email,
      endedAt: Date.now(),
      scanCount: scans.length
    };
    unsyncedVault.push(sessionData);
    localStorage.setItem('uba_unsynced_vault', JSON.stringify(unsyncedVault));

    // Clear active session key — next open will show login
    localStorage.removeItem('uba_active_emergency_session');

    // Reset UI state
    setIsAuthenticated(false);
    setMeetingId('');
    setMeetingName('');
    setEmail('');
    setPassword('');
    setScans([]);
    setIsResumed(false);
    alert('Session ended. Scans saved in Vault. Log in normally to sync to cloud.');
  };

  // BULK MANUAL ENTRY — space-separated VTUs
  const handleManualAdd = () => {
    const vtus = manualVtu.trim().split(/[\s,]+/).filter(v => v.length > 0);
    if (vtus.length === 0) return alert('Enter at least one VTU number');

    const vault = JSON.parse(localStorage.getItem('uba_offline_vault') || '[]');
    let added = 0;

    vtus.forEach(vtu => {
      const upperVtu = vtu.toUpperCase();
      if (vault.some((s: any) => s.vtu === upperVtu && s.meetingId === meetingId)) return; // skip dupes
      const newScan = {
        meetingId, meetingTitle: meetingName, action: 'add', vtu: upperVtu,
        studentName: `Manual: ${upperVtu}`, timestamp: Date.now(),
        isOverride: true, enteredBy: email, isEmergency: true, emergencyDeviceId: 'MANUAL'
      };
      vault.push(newScan);
      added++;
    });

    localStorage.setItem('uba_offline_vault', JSON.stringify(vault));
    const updatedScans = vault.filter((s: any) => s.isEmergency && s.meetingId === meetingId);
    setScans(updatedScans);
    setManualVtu('');
    if (added > 0) {
      setScannerSuccess(`${added} VTU(s) added manually`); setTimeout(() => setScannerSuccess(''), 2000);
      checkAutoBackup(updatedScans.length);
    }
    else { setScannerError('All entries already exist'); setTimeout(() => setScannerError(''), 2000); }
  };

  // BACKUP TO FILE — download full vault as .txt
  const handleBackupToFile = () => {
    const allVault = JSON.parse(localStorage.getItem('uba_offline_vault') || '[]');
    const sessionScans = allVault.filter((s: any) => s.isEmergency && s.meetingId === meetingId);
    const backupData = {
      session: { meetingId, meetingName, coordinatorEmail: email, exportedAt: new Date().toISOString() },
      scans: sessionScans
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UBA_EMERGENCY_BACKUP_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // AUTO-BACKUP: trigger file download every 20 scans
  const checkAutoBackup = (currentCount: number) => {
    scanCountRef.current = currentCount;
    if (currentCount > 0 && currentCount % 20 === 0) {
      handleBackupToFile();
    }
  };

  // Scanner with forced back camera
  useEffect(() => {
    if (!isAuthenticated || !meetingId) return;
    let scanner: any;
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      scanner = new Html5QrcodeScanner("reader", {
        fps: 10, qrbox: { width: 250, height: 250 },
        videoConstraints: { facingMode: { exact: "environment" } }
      }, false);
      scanner.render((decodedText: string) => {
        try {
          const payload = JSON.parse(atob(decodedText));
          const { vtu, timeSlot, hash, deviceId, isEmergency } = payload;

          if (!isEmergency) { setScannerError("Requires Student Emergency QR!"); setTimeout(() => setScannerError(''), 2000); return; }

          const dailySeed = 'uba_offline_master_secret';
          const expectedHash = CryptoJS.SHA256(`${vtu}:${timeSlot}:${dailySeed}`).toString();
          if (hash !== expectedHash) { setScannerError("Invalid Signature!"); setTimeout(() => setScannerError(''), 2000); return; }

          const currentLocks = JSON.parse(localStorage.getItem('uba_emergency_locks') || '{}');
          if (currentLocks[deviceId] && currentLocks[deviceId] !== vtu) {
            setScannerError(`🚨 PROXY BLOCKED: Locked to ${currentLocks[deviceId]}`);
            setTimeout(() => setScannerError(''), 3000); return;
          }
          if (!currentLocks[deviceId]) {
            currentLocks[deviceId] = vtu;
            localStorage.setItem('uba_emergency_locks', JSON.stringify(currentLocks));
            setDeviceLocks(currentLocks);
          }

          // Save to Global Offline Vault
          const vault = JSON.parse(localStorage.getItem('uba_offline_vault') || '[]');
          if (vault.some((s: any) => s.vtu === vtu && s.meetingId === meetingId)) {
            setScannerError("Already Scanned!"); setTimeout(() => setScannerError(''), 2000); return;
          }
          const newScan = {
            meetingId, meetingTitle: meetingName, action: 'add', vtu, studentName: `Offline: ${vtu}`,
            timestamp: Date.now(), isOverride: false, enteredBy: email, isEmergency: true, emergencyDeviceId: deviceId
          };

          const updatedVault = [...vault, newScan];
          localStorage.setItem('uba_offline_vault', JSON.stringify(updatedVault));
          const currentSessionScans = updatedVault.filter((s: any) => s.isEmergency && s.meetingId === meetingId);
          setScans(currentSessionScans);
          setScannerSuccess(`${vtu} SAVED LOCALLY`);
          setTimeout(() => setScannerSuccess(''), 1500);
          checkAutoBackup(currentSessionScans.length);
        } catch (e) { setScannerError("Invalid QR Format"); setTimeout(() => setScannerError(''), 2000); }
      }, () => {});
    });
    return () => { if (scanner) scanner.clear().catch(console.error); };
  }, [isAuthenticated, meetingId]);

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-black text-gray-900 mb-2 italic">🚨 Emergency Portal</h1>
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-8">Coordinator Offline Scanner</p>
        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your Email Address"
            className="w-full p-4 text-center font-bold border-2 border-gray-200 rounded-2xl outline-none focus:border-red-500"
          />
          <input
            type="text"
            value={meetingName}
            onChange={(e) => setMeetingName(e.target.value)}
            placeholder="Emergency Session Name"
            className="w-full p-4 text-center font-bold border-2 border-gray-200 rounded-2xl outline-none focus:border-red-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Emergency Passcode"
            className="w-full p-4 text-center font-mono font-black text-xl border-2 border-gray-200 rounded-2xl outline-none focus:border-red-500"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs hover:bg-red-700 active:scale-95 transition-all"
          >
            Activate Emergency Scanner
          </button>
        </div>
        <Link href="/login" className="block mt-6 text-[10px] font-black text-gray-400 underline hover:text-gray-600 uppercase tracking-widest">
          Return to Login
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#111827] text-white p-6">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black italic">🚨 EMERGENCY MODE</h1>
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mt-1">{meetingName} — {email}</p>
          <p className="text-[9px] font-mono text-gray-500 mt-1">Session: {meetingId}</p>
          {isResumed && <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mt-2 animate-pulse">♻️ SESSION RESTORED FROM DISK</p>}
        </div>

        <div className="bg-white p-4 rounded-3xl shadow-xl mb-6 relative">
          <div id="reader" className="w-full min-h-[250px] bg-black rounded-2xl overflow-hidden"></div>
          {scannerSuccess && <div className="absolute top-8 left-8 right-8 bg-green-500 text-white font-black p-3 text-center rounded-xl animate-pulse z-20">✅ {scannerSuccess}</div>}
          {scannerError && <div className="absolute top-8 left-8 right-8 bg-red-600 text-white font-black p-3 text-center rounded-xl animate-bounce z-20">🚨 {scannerError}</div>}
        </div>

        <div className="bg-gray-800 p-6 rounded-3xl mb-6">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-700 pb-2">Bulk Manual Entry</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualVtu}
              onChange={(e) => setManualVtu(e.target.value)}
              placeholder="VTU numbers (space-separated)"
              className="flex-1 p-3 rounded-xl text-sm font-mono font-bold bg-gray-900 border border-gray-700 text-white outline-none placeholder-gray-500"
            />
            <button
              onClick={handleManualAdd}
              className="bg-[#FF5722] text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#E64A19] active:scale-95 transition-all whitespace-nowrap"
            >
              Add VTUs
            </button>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-3xl mb-6">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-700 pb-2">Vault Memory ({scans.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {scans.map((s, i) => (
              <div key={i} className="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-700">
                <span className="font-mono font-black text-[#FF5722]">{s.vtu}</span>
                <span className="text-[10px] text-gray-500 font-bold">{new Date(s.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
            {scans.length === 0 && <p className="text-center text-gray-500 text-xs font-bold py-4 italic">No scans yet. Point camera at Student Emergency QR.</p>}
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={handleBackupToFile}
            className="flex-1 bg-gray-700 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] hover:bg-gray-600 active:scale-95 transition-all"
          >
            📥 Backup Vault to Phone
          </button>
        </div>

        <button
          onClick={handleEndSession}
          className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs hover:bg-red-700 active:scale-95 transition-all"
        >
          🛑 End Emergency Session
        </button>
        <p className="text-[8px] text-center mt-3 text-gray-500 font-bold uppercase tracking-widest">Scans will be queued for cloud sync on next login</p>
      </div>
    </div>
  );
}
