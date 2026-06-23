'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

export function TelemetryCharts({ data }: { data: any[] }) {
  const processedData = useMemo(() => {
    // 1. Separate Backend vs Frontend
    const backendLogs = data.filter(d => d.service === 'backend-render');
    const frontendLogs = data.filter(d => d.service === 'frontend-vercel');

    // 2. Average Backend Latency by Route
    const routeStats = backendLogs.reduce((acc, log) => {
      if (!acc[log.trace_name]) acc[log.trace_name] = { name: log.trace_name, totalMs: 0, count: 0 };
      acc[log.trace_name].totalMs += log.duration_ms;
      acc[log.trace_name].count += 1;
      return acc;
    }, {} as Record<string, any>);
    
    const avgLatency = Object.values(routeStats)
      .map((r: any) => ({ name: r.name.replace(' ', '\n'), avgMs: Math.round(r.totalMs / r.count) }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 10); // Top 10 slowest

    // 3. Frontend LCP (Web Vitals) Over Time
    const lcpLogs = frontendLogs
      .filter(d => d.trace_name === 'WebVital: LCP')
      .map(d => ({ time: new Date(d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), LCP: d.duration_ms }))
      .reverse(); // Chronological

    return { avgLatency, lcpLogs, totalBackend: backendLogs.length, totalFrontend: frontendLogs.length };
  }, [data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* KPL Cards */}
      <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        <div className="bg-[#1A1A1A] border border-gray-800 p-4 rounded">
          <div className="text-xs text-[#B3B3B3] uppercase tracking-wider">Backend Requests</div>
          <div className="text-2xl font-bold text-white mt-1">{processedData.totalBackend}</div>
        </div>
        <div className="bg-[#1A1A1A] border border-gray-800 p-4 rounded">
          <div className="text-xs text-[#B3B3B3] uppercase tracking-wider">Frontend Vitals</div>
          <div className="text-2xl font-bold text-white mt-1">{processedData.totalFrontend}</div>
        </div>
        <div className="bg-[#1A1A1A] border border-gray-800 p-4 rounded">
          <div className="text-xs text-[#B3B3B3] uppercase tracking-wider">Avg Response</div>
          <div className="text-2xl font-bold text-[#FF5722] mt-1">
             {Math.round(data.reduce((acc, curr) => acc + curr.duration_ms, 0) / data.length || 0)}ms
          </div>
        </div>
      </div>

      {/* Backend Latency Chart */}
      <div className="bg-[#1A1A1A] border border-gray-800 p-4 rounded h-80">
        <h3 className="text-sm font-semibold text-white mb-4">Average API Latency (Slowest 10)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={processedData.avgLatency} layout="vertical" margin={{ left: 50, right: 20 }}>
            <XAxis type="number" stroke="#B3B3B3" fontSize={12} />
            <YAxis dataKey="name" type="category" stroke="#B3B3B3" fontSize={10} width={100} />
            <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333' }} itemStyle={{ color: '#FF5722' }} />
            <Bar dataKey="avgMs" fill="#FF5722" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Frontend LCP Chart */}
      <div className="bg-[#1A1A1A] border border-gray-800 p-4 rounded h-80">
        <h3 className="text-sm font-semibold text-white mb-4">Frontend Load Time (LCP)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData.lcpLogs} margin={{ left: 0, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis dataKey="time" stroke="#B3B3B3" fontSize={10} />
            <YAxis stroke="#B3B3B3" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333' }} itemStyle={{ color: '#FF5722' }} />
            <Line type="monotone" dataKey="LCP" stroke="#FF5722" strokeWidth={2} dot={{ r: 3, fill: '#FF5722' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}