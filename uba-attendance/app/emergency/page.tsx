'use client';
import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import CryptoJS from 'crypto-js';
import Link from 'next/link';

export default function EmergencyQR() {
  const [vtuInput, setVtuInput] = useState('');
  const [activeVtu, setActiveVtu] = useState('');
  const [qrData, setQrData] = useState('');
  const [timeLeft, setTimeLeft] = useState(20);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    // STRICT DEVICE LOCK: Store once, stay forever.
    let storedId = localStorage.getItem('uba_emergency_device_id');
    if (!storedId) {
      storedId = 'EMG-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      localStorage.setItem('uba_emergency_device_id', storedId);
    }
    setDeviceId(storedId);
  }, []);

  useEffect(() => {
    if (!activeVtu || !deviceId) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSlot = Math.floor(now / 20000);
      const dailySeed = 'uba_offline_master_secret';

      // Hash generation
      const hash = CryptoJS.SHA256(`${activeVtu}:${timeSlot}:${dailySeed}`).toString();

      // Payload includes the strict device ID and the emergency flag
      const payload = { vtu: activeVtu, timeSlot, hash, deviceId, isEmergency: true };
      setQrData(btoa(JSON.stringify(payload)));

      setTimeLeft(20 - Math.floor((now / 1000) % 20));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeVtu, deviceId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-black text-gray-900 mb-2 italic">UBA ID pass</h1>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-8">System Offline Bypass</p>

        {!activeVtu ? (
          <div className="space-y-4">
            <input
              type="text"
              value={vtuInput}
              onChange={(e) => setVtuInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ENTER YOUR VTU..."
              className="w-full p-4 text-center font-mono font-black text-xl border-2 border-gray-200 rounded-2xl outline-none focus:border-red-500"
              maxLength={15}
            />
            <button
              onClick={() => { if (vtuInput.length > 5) setActiveVtu(vtuInput); }}
              className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs hover:bg-red-700 active:scale-95 transition-all"
            >
              Generate Secure ID
            </button>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Device Lock ID: <span className="text-black font-mono">{deviceId}</span></p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-in zoom-in duration-300">
            <div className="bg-white p-4 rounded-3xl shadow-lg border-2 border-red-100 mb-6">
              {qrData ? <QRCode value={qrData} size={200} fgColor="#111827" /> : <div className="h-[200px] flex items-center justify-center text-gray-300 font-black">LOADING...</div>}
            </div>
            <p className="text-3xl font-mono font-black text-[#FF5722] mb-1">{activeVtu}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Refreshes in {timeLeft}s</p>
            <button
              onClick={() => { setActiveVtu(''); setQrData(''); }}
              className="w-full bg-gray-100 text-gray-600 font-black py-3 rounded-xl uppercase tracking-widest text-[10px] hover:bg-gray-200"
            >
              Change VTU
            </button>
          </div>
        )}

        <Link href="/login" className="block mt-6 text-[10px] font-black text-gray-400 underline hover:text-gray-600 uppercase tracking-widest">
          Return to Login
        </Link>
      </div>
    </div>
  );
}
