'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../components/ProtectedRoute';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

// Helper to safely handle Firebase Timestamp objects vs standard dates/numbers
const getSafeTime = (val: any, fallback: number = 0) => {
  if (!val) return fallback;
  if (typeof val === 'number') return val;
  if (val.seconds) return val.seconds * 1000;
  if (val._seconds) return val._seconds * 1000;
  const d = new Date(val).getTime();
  return isNaN(d) ? fallback : d;
};

export default function AdminPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [data, setData] = useState<any>({ meetings: [], attendance: [], users: [], suspiciousLogs: [], stats: {} });
  const [coordinators, setCoordinators] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // UI & UX Enhancement States
  const [analyticsViewMap, setAnalyticsViewMap] = useState<{ [key: string]: boolean }>({});
  const [tabMap, setTabMap] = useState<{ [key: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('All');
  const [vtuLookup, setVtuLookup] = useState(''); 
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null); 
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  
  const [showAllMeetings, setShowAllMeetings] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [selectedPurgeYear, setSelectedPurgeYear] = useState('1');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com";

  // --- HIGHLY OPTIMIZED ADMIN DATA FETCHING ---
  async function fetchData(forceFetch = false) {
    const now = Date.now();

    // CACHE CHECK: Prevent spam if fetched recently (30 seconds for Admin) unless forced
    if (!forceFetch) {
      const lastFetch = sessionStorage.getItem('uba_admin_last_fetch');
      const cachedData = sessionStorage.getItem('uba_admin_cache');

      if (lastFetch && cachedData && (now - parseInt(lastFetch) < 30000)) {
          const parsed = JSON.parse(cachedData);
          setCoordinators(parsed.coordinators || []);
          setData(parsed.reportData);
          setLoading(false);
          setInitialLoad(false);
          return;
      }
    }

    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    
    try {
      const [coordRes, reportRes] = await Promise.all([
        fetch(`${API_URL}/admin/list-coordinators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/all-reports`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const coordData = await coordRes.json();
      const reportData = await reportRes.json();
      
      const meetingsList = reportData.meetings || [];
      meetingsList.sort((a: any, b: any) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));

      const processedReportData = { ...reportData, meetings: meetingsList, suspiciousLogs: reportData.suspiciousLogs || [] };

      sessionStorage.setItem('uba_admin_last_fetch', now.toString());
      sessionStorage.setItem('uba_admin_cache', JSON.stringify({ coordinators: coordData.coordinators, reportData: processedReportData }));

      setCoordinators(coordData.coordinators || []);
      setData(processedReportData);
    } catch (e) {
      console.error("Fetch Error:", e);
    } finally { 
        setLoading(false); 
        setInitialLoad(false);
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => { 
      if (user) fetchData(true); 
      else router.push('/login'); 
    });
    
    const hour = new Date().getHours();
    let g = "Good morning";
    if (hour >= 12 && hour < 17) g = "Good afternoon";
    else if (hour >= 17) g = "Good evening";
    setGreeting(`${g} Sir! Our UBA Attendance Console is Live.`);

    return () => unsub();
  }, []);

  const hasActiveMeeting = useMemo(() => (data.meetings || []).some((m: any) => m.status === 'active'), [data.meetings]);

  // --- SMART CONDITIONAL SYNC ---
  useEffect(() => {
    if (!hasActiveMeeting) return;
    const pollInterval = setInterval(() => {
      if (auth.currentUser && document.visibilityState === 'visible') {
          fetchData(true); 
      }
    }, 90000); 
    return () => clearInterval(pollInterval);
  }, [hasActiveMeeting]);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  const handleAddCoordinator = async () => {
    if (!coordinatorEmail.includes('@')) return showToast("Enter a valid email address");
    const t = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/admin/add-coordinator`, { 
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, 
      body: JSON.stringify({ email: coordinatorEmail }) 
    });
    if (res.ok) { setCoordinatorEmail(''); fetchData(true); showToast("Student Coordinator added!"); }
    else { showToast("Failed to add coordinator"); }
  };

  const handleRemoveCoordinator = async (email: string) => {
    if (!confirm(`Revoke Student Coordinator access for ${email}?`)) return;
    const t = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/admin/remove-coordinator`, { 
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, 
      body: JSON.stringify({ email }) 
    });
    if (res.ok) { fetchData(true); showToast("Access revoked"); }
  };

  const handleResetDevice = async (email: string) => {
    if (!confirm(`Reset device lock for ${email}? They can bind a new phone on next login.`)) return;
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/admin/reset-device`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email })
      });
      if (res.ok) { showToast("Device lock reset!"); fetchData(true); setSelectedStudent(null); }
    } catch (e) { showToast("Network error."); }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm("Permanently delete this meeting and all its logs?")) return;
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/admin/delete-meeting`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ meetingId })
      });
      if (res.ok) { fetchData(true); showToast("Session purged"); }
    } catch (e) { showToast("Network error during delete"); }
  };

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) { setIsUploading(false); return showToast("CSV is empty"); }

      const headers = lines[0].toUpperCase().split(',').map(h => h.trim().replace(/"/g, ''));
      const vtuIdx = headers.findIndex(h => h.includes('VTU'));
      const nameIdx = headers.findIndex(h => h.includes('NAME'));
      const genderIdx = headers.findIndex(h => h.includes('GENDER'));
      const deptIdx = headers.findIndex(h => h.includes('DEPT'));
      const phoneIdx = headers.findIndex(h => h.includes('MOBILE') || h.includes('PHONE'));
      const yearIdx = headers.findIndex(h => h.includes('YEAR'));

      if (vtuIdx === -1) { setIsUploading(false); return showToast("CSV must contain a VTU column"); }

      const students: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length > vtuIdx) {
          const vtuRaw = cols[vtuIdx]?.replace(/"/g, '').trim();
          const vtuNumber = vtuRaw.replace(/\D/g, ''); 
          if (!vtuNumber) continue;

          students.push({ 
            vtuNumber, 
            name: nameIdx !== -1 ? cols[nameIdx]?.replace(/"/g, '').trim() : 'Unknown', 
            gender: genderIdx !== -1 ? (cols[genderIdx]?.replace(/"/g, '').trim().toUpperCase().startsWith('M') ? 'Male' : 'Female') : 'N/A', 
            dept: deptIdx !== -1 ? cols[deptIdx]?.replace(/"/g, '').trim() : 'N/A', 
            phone: phoneIdx !== -1 ? cols[phoneIdx]?.replace(/"/g, '').trim() : 'N/A',
            year: yearIdx !== -1 ? cols[yearIdx]?.replace(/"/g, '').trim() : selectedPurgeYear
          });
        }
      }
      
      if(students.length === 0) { setIsUploading(false); return showToast("No valid data found"); }
      const token = await auth.currentUser?.getIdToken();
      try {
        const res = await fetch(`${API_URL}/admin/master-roster/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ students })
        });
        if (res.ok) showToast(`Added ${students.length} students to roster`);
        else showToast("Upload failed");
      } finally { setIsUploading(false); fetchData(true); }
    };
    reader.readAsText(file);
  };

  const handleYearPurge = async () => {
    if (!confirm(`Wipe all Year ${selectedPurgeYear} students from Master Roster?`)) return;
    setIsPurging(true);
    const token = await auth.currentUser?.getIdToken();
    try {
        const res = await fetch(`${API_URL}/admin/master-roster/purge`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ year: selectedPurgeYear })
        });
        if (res.ok) showToast(`Year ${selectedPurgeYear} Purged.`);
    } finally { setIsPurging(false); fetchData(true); }
  };

  // --- REWRITTEN CSV EXPORT (NO TIMESTAMPS, CLEAN COLUMNS) ---
  const downloadMeetingCSV = (meetingId: string, meetingTitle: string) => {
    const attendees = data.attendance.filter((a: any) => a.meetingId === meetingId);
    if (attendees.length === 0) return showToast("No data to export.");
    
    let csv = "S.NO,Name,VTU,Gender,Dept,Year,Phone,Status\n";
    attendees.forEach((at: any, index: number) => {
      // Cross-reference with Master DB to get 100% accurate data
      const u = data.users.find((u: any) => String(u.vtuNumber) === String(at.vtuNumber)) || {};
      const name = at.studentName || u.name || 'Unknown';
      csv += `${index + 1},"${name}",${at.vtuNumber},${u.gender||'N/A'},${u.dept||'N/A'},${u.year||'N/A'},${u.phone||'N/A'},${at.isOverride ? 'MANUAL' : 'VERIFIED'}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${meetingTitle}_Verified_Roster.csv`;
    link.click();
  };

  // --- REWRITTEN ANALYTICS MATH (ACCURATE MASTER ROSTER BINDING) ---
  const getMeetingStats = (attendeesList: any[]) => {
    return attendeesList.reduce((acc: any, curr: any) => {
      const user = data.users.find((u: any) => String(u.vtuNumber) === String(curr.vtuNumber));
      const gen = String(user?.gender || 'Unknown').toUpperCase();
      const year = String(user?.year || 'Unknown');
      
      if (!acc.years[year]) acc.years[year] = { Male: 0, Female: 0, total: 0 };
      if (gen.startsWith('M')) { acc.gender['Male'] = (acc.gender['Male'] || 0) + 1; acc.years[year].Male += 1; } 
      else if (gen.startsWith('F')) { acc.gender['Female'] = (acc.gender['Female'] || 0) + 1; acc.years[year].Female += 1; }
      acc.years[year].total += 1;
      
      return acc;
    }, { gender: { Male: 0, Female: 0 }, years: {} });
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    (data.meetings || []).forEach((m: any) => {
      const d = new Date(getSafeTime(m.createdAt));
      months.add(`${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`);
    });
    return ['All', ...Array.from(months)];
  }, [data.meetings]);

  const filteredMeetings = (data.meetings || []).filter((m: any) => {
    const searchMatch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) || (m.createdByName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const d = new Date(getSafeTime(m.createdAt));
    const mMonth = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    return searchMatch && (filterMonth === 'All' || filterMonth === mMonth);
  });

  // Display only last 2 events until "Load More" is clicked
  const displayedMeetings = showAllMeetings ? filteredMeetings : filteredMeetings.slice(0, 2);

  const cleanLookup = vtuLookup.trim().toUpperCase();
  const numericLookup = cleanLookup.replace(/\D/g, '');
  const searchedUser = cleanLookup ? data.users?.find((u:any) => {
      const dbVtu = (u?.vtuNumber || '').replace(/\D/g, '');
      if (numericLookup && dbVtu === numericLookup) return true;
      if (numericLookup && dbVtu.includes(numericLookup)) return true;
      if (u?.name?.toLowerCase().includes(cleanLookup.toLowerCase())) return true;
      return false;
  }) : null;
  const searchedUserAttendance = searchedUser ? data.attendance?.filter((a:any) => a.vtuNumber === searchedUser.vtuNumber) : [];

  if (initialLoad) return <div className="h-screen flex items-center justify-center bg-white"><div className="animate-spin rounded-full h-10 w-10 border-t-4 border-[#FF5722]"></div></div>;

  return (
    <ProtectedRoute allowedRoles={["head"]}>
      <div className="min-h-screen font-sans bg-white text-gray-900 flex flex-col">
        
        {toastMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 border-2 border-[#FF5722] bg-[#111827] text-white px-8 py-3 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest z-[200] animate-in fade-in slide-in-from-bottom-4">
            {toastMsg}
          </div>
        )}

        {/* UNIVERSAL STUDENT DOSSIER MODAL */}
        {selectedStudent && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-4 backdrop-blur-sm" onClick={() => setSelectedStudent(null)}>
            <div className="w-full max-w-sm rounded-[2.5rem] p-8 border-2 border-[#FF5722] shadow-2xl bg-white animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-black text-xl capitalize tracking-tight text-[#FF5722]">{selectedStudent.studentName || selectedStudent.name}</h3>
                  <p className="font-mono font-bold text-gray-500 mt-1">{selectedStudent.vtuNumber || selectedStudent.vtu}</p>
                </div>
                <button onClick={() => setSelectedStudent(null)} className="text-gray-300 hover:text-red-500 font-black text-3xl transition-colors">&times;</button>
              </div>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm bg-gray-50 p-3 rounded-xl"><span className="font-bold text-gray-400 uppercase">Dept</span><span className="font-black">{selectedStudent.userData?.dept || selectedStudent.dept || 'N/A'}</span></div>
                <div className="flex justify-between text-sm bg-gray-50 p-3 rounded-xl"><span className="font-bold text-gray-400 uppercase">Year</span><span className="font-black">{selectedStudent.userData?.year || selectedStudent.year || 'N/A'}</span></div>
                <div className="flex justify-between text-sm bg-gray-50 p-3 rounded-xl"><span className="font-bold text-gray-400 uppercase">Gender</span><span className="font-black">{selectedStudent.userData?.gender || selectedStudent.gender || 'N/A'}</span></div>
                <div className="flex justify-between items-center text-sm bg-gray-50 p-3 rounded-xl"><span className="font-bold text-gray-400 uppercase text-[10px]">Device ID</span><span className="font-mono text-[9px] text-gray-400 truncate w-32 text-right">{selectedStudent.userData?.registeredDeviceId || 'Unset'}</span></div>
              </div>
              {selectedStudent.userData?.email && (
                <button onClick={() => handleResetDevice(selectedStudent.userData?.email)} className="w-full bg-red-50 text-red-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100">Reset Phone Binding</button>
              )}
            </div>
          </div>
        )}

        {/* MOBILE-FRIENDLY NAVBAR */}
        <nav className="bg-white border-b-2 border-[#FF5722] p-4 md:p-6 sticky top-0 shadow-sm z-40 relative">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src="/uba-logo.png" className="h-10 w-10 object-contain rounded-full" alt="UBA" />
              <h1 className="font-black uppercase tracking-tighter italic text-sm md:text-xl text-gray-900">Admin Console</h1>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-4">
              <button onClick={() => fetchData(true)} className="text-xs font-black px-4 py-2 rounded-xl border-2 border-gray-100 hover:bg-gray-50 transition uppercase tracking-widest text-gray-600">Refresh Data</button>
              <button onClick={() => signOut(auth)} className="text-xs font-black px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-black transition tracking-widest uppercase">Logout</button>
            </div>

            {/* Mobile Hamburger Button */}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 bg-[#FFF9F5] rounded-xl border border-[#FF5722]/20">
               <div className={`w-5 h-0.5 bg-[#FF5722] mb-1.5 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
               <div className={`w-5 h-0.5 bg-[#FF5722] transition-all ${isMenuOpen ? '-rotate-45 -translate-y-0.5' : ''}`}></div>
            </button>
          </div>

          {/* Mobile Dropdown */}
          {isMenuOpen && (
            <div className="absolute top-full left-0 w-full bg-white border-b-2 border-[#FF5722] p-6 space-y-4 md:hidden animate-in slide-in-from-top-4 shadow-2xl">
               <button onClick={() => { fetchData(true); setIsMenuOpen(false); }} className="w-full py-4 bg-gray-50 text-gray-700 font-black rounded-2xl uppercase text-xs tracking-widest border border-gray-200">Force Refresh</button>
               <button onClick={() => signOut(auth)} className="w-full py-4 bg-red-50 text-red-500 font-black rounded-2xl uppercase text-xs tracking-widest border border-red-100">Safe Logout</button>
            </div>
          )}
        </nav>

        <main className="max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-8 mt-4">
          
          {/* GREETINGS */}
          <div className="lg:col-span-12 p-8 rounded-[2.5rem] border border-[#FF5722] bg-[#FFF9F5] mb-2 shadow-sm">
             <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{greeting}</h2>
             <p className="text-[10px] md:text-xs font-bold text-[#FF5722] uppercase tracking-widest mt-2">UBA Attendance & Trip Verification Engine v2.0</p>
          </div>

          {/* STAT BOXES */}
          <div className="lg:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-[#FF5722] bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Total Trips</p><p className="text-4xl font-black text-gray-900">{filteredMeetings.length}</p></div>
            <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-[#FF5722] bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Total Scans</p><p className="text-4xl font-black text-gray-900">{data.attendance.length}</p></div>
            <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-gray-900 bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Members</p><p className="text-4xl font-black text-gray-900">{data.users.length}</p></div>
            <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-red-500 bg-red-50"><p className="text-[10px] font-black uppercase text-red-400 mb-1 tracking-widest italic">Security Flags</p><p className="text-4xl font-black text-red-600 animate-pulse">{data.suspiciousLogs.length}</p></div>
          </div>

          {/* EVENTS COLUMN (Left on desktop, Top on mobile) */}
          <div className="order-1 lg:col-span-8 space-y-6">
            <div className="p-4 rounded-2xl border border-[#FF5722]/30 flex flex-col md:flex-row gap-4 bg-[#FFF9F5] shadow-sm">
               <input type="text" placeholder="🔍 Search event or coordinator..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 p-4 rounded-xl outline-none font-black text-sm border border-gray-100 bg-white shadow-inner" />
               <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="p-4 text-xs rounded-xl font-black bg-white border border-gray-100 uppercase tracking-widest">{availableMonths.map(month => <option key={month} value={month}>{month}</option>)}</select>
            </div>

            <div className="flex items-center gap-2 mb-2 mt-4">
               <div className="h-2 w-2 rounded-full bg-[#FF5722] animate-pulse"></div>
               <h3 className="font-black text-xs uppercase tracking-[0.2em] text-gray-400">Live & Recent Deployments</h3>
            </div>

            {displayedMeetings.map((m: any) => {
              const attendees = data.attendance.filter((a:any) => a.meetingId === m.id);
              const suspicious = data.suspiciousLogs.filter((s:any) => s.meetingId === m.id);
              const manifest = m.manifest || [];
              const stats = getMeetingStats(attendees);
              
              const isAnalytics = analyticsViewMap[m.id] || false;
              const activeTab = tabMap[m.id] || 'verified';
              const setTab = (t: string) => setTabMap({ ...tabMap, [m.id]: t });

              const tabVerified = attendees.filter((a: any) => !a.isOverride);
              const tabManual = attendees.filter((a: any) => a.isOverride);
              const tabMissing = manifest.filter((man: any) => !attendees.some((att: any) => String(att.vtuNumber) === String(man.vtu)));
              
              const dateStr = getSafeTime(m.createdAt) ? new Date(getSafeTime(m.createdAt)).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Recent';
              const isVerifiable = m.type === 'verifiable';

              return (
                <div key={m.id} className="p-6 md:p-8 rounded-[3rem] border border-[#FF5722] bg-white shadow-lg relative transition-all group hover:border-[#FF5722]">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                     <div>
                       <div className="flex items-center gap-3">
                         <h3 className="font-black text-2xl uppercase italic tracking-tighter text-gray-900">{m.title}</h3>
                         {m.status === 'active' && <span className="bg-[#FF5722] text-white text-[8px] font-black px-2 py-0.5 rounded animate-pulse uppercase tracking-widest">Live Now</span>}
                       </div>
                       <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Host: {m.createdByName || m.coordinatorId} • {dateStr}</p>
                     </div>
                     <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                       <button onClick={() => setAnalyticsViewMap({...analyticsViewMap, [m.id]: !isAnalytics})} className={`flex-1 lg:flex-none px-4 py-3 rounded-xl text-[9px] font-black border transition uppercase shadow-sm tracking-widest ${isAnalytics ? 'bg-gray-900 text-white' : 'text-[#FF5722] border-[#FF5722] bg-[#FFF9F5]'}`}>{isAnalytics ? 'Close Analytics' : 'Analytics'}</button>
                       <button onClick={() => downloadMeetingCSV(m.id, m.title)} className="flex-1 lg:flex-none px-4 py-3 rounded-xl text-[9px] font-black border border-gray-200 hover:bg-gray-50 shadow-sm uppercase tracking-widest">Export</button>
                       <button onClick={() => handleDeleteMeeting(m.id)} className="px-4 py-3 rounded-xl text-[9px] bg-red-50 font-black text-red-500 hover:bg-red-500 hover:text-white transition shadow-sm uppercase tracking-widest">Purge</button>
                     </div>
                  </div>

                  {isAnalytics && (
                    <div className="space-y-8 animate-in fade-in duration-300 bg-gray-50 p-6 rounded-3xl mb-6 border border-gray-100">
                      
                      {/* STAT CARDS */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 md:p-6 rounded-[2rem] bg-blue-50 text-center border border-blue-100 shadow-inner">
                           <p className="text-[9px] font-black text-blue-400 uppercase mb-1 tracking-widest">Boys</p>
                           <h4 className="text-3xl md:text-4xl font-black text-blue-600">{stats.gender['Male'] || 0}</h4>
                        </div>
                        <div className="p-4 md:p-6 rounded-[2rem] bg-pink-50 text-center border border-pink-100 shadow-inner">
                           <p className="text-[9px] font-black text-pink-400 uppercase mb-1 tracking-widest">Girls</p>
                           <h4 className="text-3xl md:text-4xl font-black text-pink-500">{stats.gender['Female'] || 0}</h4>
                        </div>
                        <div className="p-4 md:p-6 rounded-[2rem] bg-white text-center border border-gray-200 shadow-sm">
                           <p className="text-[9px] font-black text-gray-400 uppercase mb-1 tracking-widest">Total</p>
                           <h4 className="text-3xl md:text-4xl font-black text-gray-900">{attendees.length}</h4>
                        </div>
                      </div>

                      {/* BAR CHART */}
                      <div className="p-6 rounded-[2.5rem] border border-gray-200 bg-white flex items-end justify-between h-48 px-4 md:px-10 gap-2 shadow-sm">
                        {[1, 2, 3, 4].map(y => {
                          const yData = stats.years[y.toString()] || { Male: 0, Female: 0, total: 0 };
                          const max = Math.max(...[1,2,3,4].map(yr => (stats.years[yr.toString()]?.total || 0)));
                          const height = max > 0 ? (yData.total / max) * 100 : 0;
                          return (
                            <div key={y} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                               <div className="w-8 md:w-16 bg-gray-50 rounded-t-xl overflow-hidden shadow-inner flex flex-col-reverse transition-all duration-500 border border-gray-100" style={{ height: `${Math.max(height, 5)}%` }}>
                                  <div className="w-full bg-blue-500 transition-all" style={{ height: `${yData.total > 0 ? (yData.Male / yData.total) * 100 : 0}%` }}></div>
                                  <div className="w-full bg-pink-500 transition-all" style={{ height: `${yData.total > 0 ? (yData.Female / yData.total) * 100 : 0}%` }}></div>
                               </div>
                               <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Yr {y}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* TABS SYSTEM */}
                      <div className="border-t-2 border-dashed border-gray-200 pt-6">
                        <div className="flex overflow-x-auto border-b border-gray-200 mb-4 shrink-0 no-scrollbar gap-2 pb-2">
                          <button onClick={() => setTab('verified')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'verified' ? 'text-white bg-[#111827] shadow-md' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>Verified ({tabVerified.length})</button>
                          {isVerifiable && <button onClick={() => setTab('missing')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'missing' ? 'text-white bg-red-500 shadow-md' : 'text-red-500 bg-red-50 hover:bg-red-100'}`}>Abandoned ({tabMissing.length})</button>}
                          <button onClick={() => setTab('manual')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'manual' ? 'text-gray-900 border-2 border-gray-900 bg-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>Manual ({tabManual.length})</button>
                          <button onClick={() => setTab('suspicious')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'suspicious' ? 'text-purple-700 bg-purple-200 shadow-md' : 'text-purple-500 bg-purple-50 hover:bg-purple-100'}`}>Suspicious ({suspicious.length})</button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {activeTab === 'verified' && tabVerified.map((at:any, i:number) => (
                             <div key={i} onClick={() => setSelectedStudent({...at, userData: data.users.find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber))})} className="p-4 rounded-2xl border border-gray-200 bg-white flex justify-between items-center shadow-sm hover:border-[#FF5722] hover:shadow-md transition-all cursor-pointer">
                               <div><p className="font-bold text-sm text-gray-900 capitalize truncate w-40">{at.studentName}</p><p className="text-[10px] font-mono font-black text-[#FF5722] mt-0.5">{at.vtuNumber}</p></div>
                               <span className="text-[9px] font-black text-gray-400 tabular-nums bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">{at.dateString?.split(',')[1] || 'Done'}</span>
                             </div>
                          ))}

                          {activeTab === 'missing' && tabMissing.map((m:any, i:number) => (
                             <div key={i} onClick={() => setSelectedStudent({studentName: m.name, vtuNumber: m.vtu, userData: data.users.find((u:any)=>String(u.vtuNumber) === String(m.vtu))})} className="p-4 rounded-2xl border border-red-200 bg-red-50 flex justify-between items-center shadow-sm hover:bg-red-100 transition-all cursor-pointer">
                               <div><p className="font-bold text-sm text-red-900 capitalize truncate w-40">{m.name}</p><p className="text-[10px] font-mono font-black text-red-500 mt-0.5">{m.vtu}</p></div>
                               <span className="text-[8px] px-2 py-1 bg-red-600 text-white font-black rounded uppercase tracking-widest shadow-sm">Missing</span>
                             </div>
                          ))}

                          {activeTab === 'manual' && tabManual.map((at:any, i:number) => (
                             <div key={i} onClick={() => setSelectedStudent({...at, userData: data.users.find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber))})} className="p-4 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex justify-between items-center cursor-pointer hover:border-gray-500 transition-colors">
                               <div><p className="font-bold text-sm text-gray-900 capitalize truncate w-32">{at.studentName}</p><p className="text-[10px] font-mono font-black text-gray-500 mt-0.5">{at.vtuNumber}</p></div>
                               <div className="text-right"><p className="text-[8px] bg-gray-900 text-white px-2 py-1 rounded font-black uppercase tracking-widest mb-1 inline-block">Manual</p><p className="text-[8px] font-bold text-gray-400 italic block truncate w-20">By {at.enteredBy?.split('@')[0]}</p></div>
                             </div>
                          ))}

                          {activeTab === 'suspicious' && suspicious.map((log: any, i: number) => (
                            <div key={i} className="p-4 bg-purple-50 border border-purple-300 rounded-2xl flex justify-between items-center col-span-1 md:col-span-2 shadow-sm">
                              <div>
                                <p className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-2 flex items-center gap-2"><span className="text-lg">🚨</span> Proxy Blocked</p>
                                <div className="flex gap-4">
                                  <p className="text-[9px] font-bold text-gray-500 uppercase">Input ID: <span className="font-mono text-black font-black">{log.proxyVtu}</span></p>
                                  <p className="text-[9px] font-bold text-gray-500 uppercase border-l border-purple-200 pl-4">Phone Owner: <span className="font-mono text-black font-black">{log.originalVtu}</span></p>
                                </div>
                              </div>
                            </div>
                          ))}

                          {((activeTab === 'verified' && tabVerified.length === 0) || 
                            (activeTab === 'missing' && tabMissing.length === 0) || 
                            (activeTab === 'manual' && tabManual.length === 0) || 
                            (activeTab === 'suspicious' && suspicious.length === 0)) && 
                            <div className="col-span-1 md:col-span-2 py-10 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl bg-white">
                              <span className="text-3xl grayscale opacity-30 mb-2">📭</span>
                              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest text-center">No data found in this category</p>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  {!isAnalytics && (
                    <div className="grid md:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                      {attendees.map((at:any, i:number) => (
                        <div key={i} onClick={() => setSelectedStudent({...at, userData: data.users.find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber))})} className="p-4 rounded-2xl border border-gray-100 bg-[#FFF9F5]/40 flex justify-between items-center hover:bg-white hover:border-[#FF5722] hover:shadow-md cursor-pointer transition-all group">
                           <div>
                             <p className="font-bold text-sm text-gray-900 truncate w-32 capitalize group-hover:text-[#FF5722] transition-colors">{at.studentName}</p>
                             <p className="text-[10px] font-mono font-black text-gray-400 group-hover:text-gray-900 transition-colors mt-0.5">{at.vtuNumber}</p>
                           </div>
                           <div className="text-right">
                             <span className="text-[9px] font-black text-gray-300 group-hover:text-[#FF5722] transition-colors tabular-nums bg-white px-2 py-1 rounded-lg border border-gray-100">{at.dateString?.split(',')[1] || 'Logged'}</span>
                             {at.isOverride && <span className="block text-[7px] text-red-500 font-black uppercase tracking-[0.2em] mt-1">Manual</span>}
                           </div>
                        </div>
                      ))}
                      {attendees.length === 0 && (
                        <div className="col-span-1 md:col-span-2 py-16 flex flex-col items-center justify-center opacity-40">
                          <span className="text-4xl mb-4 animate-bounce">📡</span>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">Awaiting Scanner Data</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!showAllMeetings && filteredMeetings.length > 2 && (
              <button onClick={() => setShowAllMeetings(true)} className="w-full py-5 rounded-3xl border-2 border-dashed border-gray-300 text-gray-500 font-black text-[10px] uppercase tracking-[0.3em] hover:border-[#FF5722] hover:text-[#FF5722] hover:bg-[#FFF9F5] transition-all shadow-sm">Load Older History ({filteredMeetings.length - 2} More)</button>
            )}
          </div>

          {/* TOOLS COLUMN (Right on desktop, Bottom on mobile) */}
          <div className="order-2 lg:col-span-4 space-y-6">
            
            {/* ASSIGN COORDINATOR */}
            <div className="p-6 md:p-8 rounded-[2.5rem] border-2 border-gray-100 bg-white shadow-sm hover:border-gray-200 transition-colors">
              <h2 className="font-black mb-6 uppercase text-[10px] tracking-[0.2em] text-gray-400 flex items-center gap-2"><span className="text-lg">👑</span> Add Coordinator</h2>
              <input type="email" value={coordinatorEmail} onChange={(e) => setCoordinatorEmail(e.target.value)} placeholder="Student Email..." className="w-full p-4 border border-gray-100 rounded-2xl mb-4 outline-none font-bold text-sm bg-gray-50 focus:bg-white focus:border-[#FF5722] transition-all" />
              <button onClick={handleAddCoordinator} className="w-full bg-[#111827] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg hover:bg-black transition-colors">Approve Access</button>

              {coordinators.length > 0 && (
                <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-100">
                  <h3 className="font-black text-[9px] uppercase text-gray-400 mb-4 tracking-[0.2em]">Active Field Leaders ({coordinators.length})</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {coordinators.map((email: string) => (
                      <div key={email} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
                        <p className="text-xs font-bold text-gray-800 truncate w-[60%]">{email}</p>
                        <button onClick={() => handleRemoveCoordinator(email)} className="bg-white border border-red-100 text-red-500 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors shadow-sm">Revoke</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* MEMBER LOOKUP */}
            <div className="p-6 md:p-8 rounded-[2.5rem] border-2 border-[#FF5722] bg-[#FFF9F5] shadow-sm">
              <h2 className="font-black text-[10px] tracking-[0.2em] uppercase mb-4 text-[#FF5722] flex items-center gap-2"><span className="text-lg">🔎</span> Student Tracker</h2>
              <input type="text" placeholder="Search VTU or Name..." value={vtuLookup} onChange={(e) => setVtuLookup(e.target.value)} className="w-full p-4 mb-4 text-sm rounded-2xl outline-none font-black border border-[#FF5722]/30 bg-white shadow-inner focus:border-[#FF5722] transition-colors" />
              {searchedUser && (
                <div onClick={() => setSelectedStudent({studentName: searchedUser.name, vtuNumber: searchedUser.vtuNumber, userData: searchedUser})} className="p-6 rounded-3xl border-2 border-white bg-white cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group">
                  <p className="font-black text-xl text-gray-900 group-hover:text-[#FF5722] transition-colors tracking-tight">{searchedUser.name}</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2 bg-gray-50 inline-block px-3 py-1 rounded-lg border border-gray-100">{searchedUser.dept} • Yr {searchedUser.year}</p>
                  <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-[0.2em]">Verified Scans</span>
                    <span className="font-black text-[#FF5722] text-2xl bg-[#FFF9F5] px-4 py-1 rounded-xl border border-orange-100">{searchedUserAttendance.length}</span>
                  </div>
                </div>
              )}
              {vtuLookup && !searchedUser && (
                <div className="p-6 rounded-3xl border-2 border-dashed border-orange-200 text-center bg-white opacity-60">
                   <p className="text-[10px] font-black text-[#FF5722] uppercase tracking-widest">No matching record found</p>
                </div>
              )}
            </div>

            {/* MASTER DATABASE UPLOAD */}
            <div className="p-6 md:p-8 rounded-[2.5rem] border-2 border-gray-100 bg-white shadow-sm hover:border-gray-200 transition-colors">
              <h2 className="font-black mb-6 uppercase text-[10px] tracking-[0.2em] text-gray-400 flex items-center gap-2"><span className="text-lg">🗄️</span> Roster Management</h2>
              
              <div className="relative w-full border-2 border-dashed border-blue-200 bg-blue-50 rounded-2xl p-6 text-center hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer mb-6 group">
                 <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest group-hover:scale-105 transition-transform">{isUploading ? "Processing CSV..." : "+ Upload Master CSV"}</p>
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              
              <div className="flex gap-2">
                <select value={selectedPurgeYear} onChange={(e) => setSelectedPurgeYear(e.target.value)} className="px-4 py-3 text-xs rounded-xl font-black border border-gray-200 bg-gray-50 outline-none text-gray-600">
                  <option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option>
                </select>
                <button onClick={handleYearPurge} className="flex-1 bg-white border border-red-100 text-red-500 font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors shadow-sm">Purge Year</button>
              </div>
            </div>

          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}