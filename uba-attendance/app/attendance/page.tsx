"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import confetti from 'canvas-confetti';

interface QRData {
  meetingId: string;
  coordinatorEmail: string; 
  timeSlot: number;
  token: string;
  phaseId?: string; 
}

function AttendanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // NEW STATE: 'setup' added for guests
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'setup'>('loading');
  const [message, setMessage] = useState('Verifying your attendance...');
  const isProcessing = useRef(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://10.120.248.230:5000";

  useEffect(() => {
    const dataParam = searchParams.get('data');

    if (!dataParam) {
      setStatus('error');
      setMessage('Invalid Link: Please scan the live QR code on the coordinator dashboard.');
      return;
    }

    let parsedData: QRData;
    try {
      parsedData = JSON.parse(atob(dataParam));
    } catch (err) {
      setStatus('error');
      setMessage('Decryption Error: The QR code format is invalid or corrupted.');
      return;
    }

    if (isProcessing.current) return;
    isProcessing.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const idToken = await user.getIdToken();
        
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
          deviceId = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now();
          localStorage.setItem('deviceId', deviceId);
        }

        const response = await fetch(`${API_URL}/mark-attendance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            qrData: dataParam, // Send the raw base64 string back to the new controller logic
            deviceId: deviceId, 
          }),
        });

        const result = await response.json();

        // THE NEW REDIRECT LOGIC
        if (response.ok && result.success) {
          setStatus('success');
          setMessage(result.message || 'Attendance Verified Successfully!');
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#FF5722', '#4CAF50', '#FFC107'] });
        } else {
          if (result.requiresSetup) {
             setStatus('setup');
             setMessage(result.message);
          } else {
             setStatus('error');
             setMessage(result.message || 'Verification Failed');
          }
        }
      } catch (err) {
        console.error('API Error:', err);
        setStatus('error');
        setMessage('Network error. Ensure the backend server is running.');
      }
    });

    return () => unsubscribe();
  }, [searchParams, router, API_URL]);

  // --- UI: LOADING STATE ---
  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4">
        <div className="w-20 h-20 border-4 border-orange-100 border-t-[#FF5722] rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-widest animate-pulse">Scanning Token</h2>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">{message}</p>
      </div>
    );
  }

  // --- UI: SETUP REQUIRED STATE (FOR STRANGERS) ---
  if (status === 'setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FFF9F5] p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center max-w-sm w-full border-4 border-[#FF5722] animate-in zoom-in-95">
          <div className="h-24 w-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
            📝
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase italic tracking-tighter">Guest Profile Required</h2>
          <p className="text-[#FF5722] mb-8 font-bold text-[10px] uppercase tracking-widest leading-relaxed border border-[#FF5722]/20 bg-orange-50 p-4 rounded-2xl">
            {message}
          </p>
          <button 
            onClick={() => router.replace('/home')} 
            className="w-full bg-[#111827] text-white font-black py-5 px-4 rounded-2xl transition duration-200 shadow-xl hover:scale-105 uppercase text-xs tracking-widest"
          >
            Complete Profile First
          </button>
        </div>
      </div>
    );
  }

  // --- UI: SUCCESS STATE ---
  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-green-50 p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center max-w-sm w-full border-8 border-green-500 animate-in zoom-in-95 fade-in">
          <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-4xl font-black text-gray-900 mb-2 uppercase italic tracking-tighter">PASS</h2>
          <p className="text-green-700 mb-10 font-bold text-xs uppercase tracking-widest bg-green-50 py-3 px-4 rounded-2xl border border-green-200">{message}</p>
          <button onClick={() => router.push('/home')} className="w-full bg-black hover:bg-gray-900 text-white font-black py-5 px-4 rounded-2xl transition duration-200 shadow-lg uppercase text-xs tracking-widest">
            RETURN TO HOME
          </button>
        </div>
      </div>
    );
  }

  // --- UI: ERROR STATE ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-4">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center max-w-sm w-full border-8 border-red-500 animate-in zoom-in-95 fade-in">
        <div className="h-24 w-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" /></svg>
        </div>
        <h2 className="text-4xl font-black text-gray-900 mb-2 uppercase italic tracking-tighter">FAIL</h2>
        <p className="text-red-700 mb-10 font-bold text-xs uppercase tracking-widest bg-red-50 py-3 px-4 rounded-2xl border border-red-200 leading-relaxed">{message}</p>
        <button onClick={() => router.push('/home')} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 px-4 rounded-2xl transition duration-200 shadow-lg uppercase text-xs tracking-widest">
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="w-12 h-12 border-4 border-orange-100 border-t-[#FF5722] rounded-full animate-spin mb-4"></div>
        <div className="font-black text-[#FF5722] uppercase tracking-[0.2em] animate-pulse text-[10px]">Syncing Scanner...</div>
      </div>
    }>
      <AttendanceContent />
    </Suspense>
  );
}