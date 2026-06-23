import React from 'react';
import { TelemetryCharts } from './TelemetryCharts';

// Secure server-side fetch bypassing public RLS restrictions
async function getTelemetryData() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SECRET) return [];

  try {
    // Fetch last 1000 logs, ordered by newest
    const res = await fetch(`${SUPABASE_URL}/rest/v1/uba_telemetry?select=*&order=created_at.desc&limit=1000`, {
      headers: {
        'apikey': SUPABASE_SECRET,
        'Authorization': `Bearer ${SUPABASE_SECRET}`,
      },
      next: { revalidate: 60 } // ISR: Cache rebuilds every 60 seconds
    });
    
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export default async function TelemetryDashboard() {
  const rawData = await getTelemetryData();

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12">
      <header className="mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-[#FF5722]">System Telemetry</h1>
        <p className="text-[#B3B3B3] text-sm mt-1">Real-time performance and Web Vitals tracking (Last 1000 events)</p>
      </header>
      
      {rawData.length === 0 ? (
        <div className="text-gray-500 bg-[#1A1A1A] p-6 rounded border border-gray-800">No telemetry data found or missing Service Role Key in Vercel environment variables.</div>
      ) : (
        <TelemetryCharts data={rawData} />
      )}
    </div>
  );
}