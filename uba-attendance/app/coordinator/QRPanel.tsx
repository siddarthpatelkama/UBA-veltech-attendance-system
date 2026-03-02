'use client';

import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import CryptoJS from 'crypto-js';

interface QRPanelProps {
  meetingId: string;
  coordinatorEmail: string;
  endTime: number;
  phaseId?: string; // NEW: Supports verifiable multi-phase roll calls
}

export default function QRPanel({ meetingId, coordinatorEmail, endTime, phaseId }: QRPanelProps) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [refreshTimer, setRefreshTimer] = useState<number>(11);
  const [expired, setExpired] = useState<boolean>(false);

  // Format MM:SS from seconds
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    function updateQR() {
      const now = Date.now();
      if (now > endTime) {
        setExpired(true);
        return;
      }
      
      const timeSlot = Math.floor(now / 11000);
      const phaseStr = phaseId || 'none';
      const payloadString = `${meetingId}:${coordinatorEmail}:${timeSlot}${phaseStr !== 'none' ? ':' + phaseStr : ''}`;
      
      // This checks the environment variable first, then uses a hardcoded backup
      const secret = process.env.NEXT_PUBLIC_QR_SECRET || 'uba_super_secret_key_123';
      
      const token = CryptoJS.SHA256(payloadString + secret).toString();
      const jsonData = JSON.stringify({ meetingId, coordinatorEmail, timeSlot, token, phaseId: phaseStr });
      const encodedData = btoa(jsonData);
      
      setQrUrl(`${window.location.origin}/attendance?data=${encodedData}`);
      setRefreshTimer(11 - Math.floor((now / 1000) % 11));
    }

    updateQR();
    interval = setInterval(() => {
      updateQR();
    }, 1000);

    return () => clearInterval(interval);
  }, [meetingId, coordinatorEmail, endTime, phaseId]);

  // Attendance window closed
  if (expired) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-red-100 rounded-xl border-2 border-red-400">
        <span className="text-4xl font-bold text-red-600 mb-4">Attendance Window Closed</span>
        <span className="text-lg text-red-500">This QR is no longer valid.</span>
      </div>
    );
  }

  // Calculate seconds left for attendance
  const secondsLeft = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-md border w-full max-w-lg mx-auto">
      <span className="text-2xl font-bold mb-4 text-gray-800">Live Attendance QR</span>
      <QRCodeCanvas value={qrUrl} size={300} includeMargin={true} className="mb-6" />
      <div className="flex flex-row gap-8 mb-4">
        <div className="flex flex-col items-center bg-blue-50 px-6 py-3 rounded-lg border border-blue-200">
          <span className="text-blue-700 font-semibold text-sm">QR Resets in:</span>
          <span className="text-blue-900 font-mono text-lg">{refreshTimer}s</span>
        </div>
        <div className="flex flex-col items-center bg-green-50 px-6 py-3 rounded-lg border border-green-200">
          <span className="text-green-700 font-semibold text-sm">Attendance Ends in:</span>
          <span className="text-green-900 font-mono text-lg">{formatTime(secondsLeft)}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500">Students scan with Google Lens to mark attendance</span>
    </div>
  );
}