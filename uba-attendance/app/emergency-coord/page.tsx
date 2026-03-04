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

  const STATIC_PASS = 'UBA-RESCUE'; // Hardcoded Emergency Password

  useEffect(() => {
    const savedLocks = localStorage.getItem('uba_emergency_locks');
    if (savedLocks) setDeviceLocks(JSON.parse(savedLocks));

    const savedVault = localStorage.getItem('uba_offline_vault');
    if (savedVault) setScans(JSON.parse(savedVault).filter((s: any) => s.isEmergency));
  }, []);

  const handleLogin = () => {
    if (password !== STATIC_PASS) return alert("Invalid Emergency Passcode");
    if (!email.includes('@') || !meetingName) return alert("Email and Meeting Name required");
    setMeetingId('EMG_' + Date.now());
    setIsAuthenticated(true);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let scanner: any;
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
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
          setScans(prev => [newScan, ...prev]);
          setScannerSuccess(`${vtu} SAVED LOCALLY`);
          setTimeout(() => setScannerSuccess(''), 1500);
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
        </div>

        <div className="bg-white p-4 rounded-3xl shadow-xl mb-6 relative">
          <div id="reader" className="w-full min-h-[250px] bg-black rounded-2xl overflow-hidden"></div>
          {scannerSuccess && <div className="absolute top-8 left-8 right-8 bg-green-500 text-white font-black p-3 text-center rounded-xl animate-pulse z-20">✅ {scannerSuccess}</div>}
          {scannerError && <div className="absolute top-8 left-8 right-8 bg-red-600 text-white font-black p-3 text-center rounded-xl animate-bounce z-20">🚨 {scannerError}</div>}
        </div>

        <div className="bg-gray-800 p-6 rounded-3xl">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-700 pb-2">Vault Memory ({scans.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {scans.map((s, i) => (
              <div key={i} className="flex justify-between bg-gray-900 p-3 rounded-xl border border-gray-700">
                <span className="font-mono font-black text-[#FF5722]">{s.vtu}</span>
                <span className="text-[10px] text-gray-500 font-bold">{new Date(s.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
