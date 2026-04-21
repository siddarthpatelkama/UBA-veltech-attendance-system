"use client";

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

// GLOBAL IST FORMATTER CONFIG
const IST_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

const IST_FULL_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

export default function AdminPage() {
  // 1. ALL STATE DECLARATIONS FIRST (to avoid hoisting errors)
  const [data, setData] = useState<any>({ 
    meetings: [], 
    attendance: [], 
    users: [], 
    suspiciousLogs: [], 
    stats: {} 
  });
  const [rosterLimit, setRosterLimit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [coordinators, setCoordinators] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState('');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sosFileInputRef = useRef<HTMLInputElement>(null);
  const scheduleFileRef = useRef<HTMLInputElement>(null);

  // 2. MEMOIZED CALCULATIONS (after state declarations)
  const genderStats = useMemo(() => {
    if (!data.users || data.users.length === 0) return { boys: 0, girls: 0, total: 0, boyPercent: 0, girlPercent: 0 };
    const boys = data.users.filter((u: any) => u.gender === 'Male').length;
    const girls = data.users.filter((u: any) => u.gender === 'Female').length;
    return {
      boys,
      girls,
      total: data.users.length,
      boyPercent: (boys / data.users.length) * 100,
      girlPercent: (girls / data.users.length) * 100
    };
  }, [data.users]);
  
  // --- ENTERPRISE NAVIGATION STATE ---
  const [adminTab, setAdminTab] = useState<'operations' | 'roster' | 'schedule' | 'broadcast'>('operations');

  // Broadcast Center States
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState<any | null>(null);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', target: 'all_students' });

  useEffect(() => {
    if (adminTab === 'broadcast') {
      const fetchHistory = async () => {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com"}/admin/broadcast/history`, { headers: { Authorization: `Bearer ${token}` }});
        if (res.ok) {
          const data = await res.json();
          setBroadcastHistory(data.history);
        }
      };
      fetchHistory();
    }
  }, [adminTab]);

  const handleSendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.body) return setToastMsg("Title and Message required!");
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com"}/admin/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetTopic: broadcastForm.target, title: broadcastForm.title, body: broadcastForm.body })
    });
    if (res.ok) {
      setToastMsg("Broadcast Sent! 🚀");
      setBroadcastForm({ title: '', body: '', target: 'all_students' });
      // Immediately refresh the history list
      const historyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com"}/admin/broadcast/history`, { headers: { Authorization: `Bearer ${token}` }});
      if (historyRes.ok) setBroadcastHistory((await historyRes.json()).history);
    } else {
      setToastMsg("Failed to send broadcast.");
    }
    setIsProcessing(false);
  };
  
  // UI & UX Enhancement States
  const [analyticsViewMap, setAnalyticsViewMap] = useState<{ [key: string]: boolean }>({});
  const [tabMap, setTabMap] = useState<{ [key: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('All');
  const [vtuLookup, setVtuLookup] = useState(''); 
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null); 
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  
  // Activate Scheduled Meeting
  const handleActivateScheduled = async (targetId: string) => {
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/meeting/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: targetId })
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
  const [showAllMeetings, setShowAllMeetings] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [selectedPurgeYear, setSelectedPurgeYear] = useState('1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  // --- DEAN'S REPORT FILTER MODAL STATE ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFilters, setExportFilters] = useState({ year: 'All', status: 'All' });

  // Event Scheduling States
  const [scheduleForm, setScheduleForm] = useState({ title: '', date: '', time: '', venue: '', type: 'standard', targetAudience: [] as string[] });
  const [scheduleManifest, setScheduleManifest] = useState<any[]>([]);

  // CRM States
  const [crmTab, setCrmTab] = useState<'members' | 'guests'>('members');
  const [crmFilters, setCrmFilters] = useState({ gender: 'All', year: 'All', minEvents: 0 });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com";

  // --- ADMIN DATA FETCHING ---
  async function fetchData(forceFetch = false) {
    const now = Date.now();

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

    // CACHE-FIRST: Skip heavy roster fetch if we already have it locally
    const cachedRoster = localStorage.getItem('uba_master_roster');
    const hasRoster = cachedRoster && JSON.parse(cachedRoster).length > 0;
    
    try {
      const [coordRes, reportRes, emergencyRes] = await Promise.all([
        fetch(`${API_URL}/admin/list-coordinators`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/all-reports?skipRoster=${!!hasRoster}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/emergency-reports`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      ]);
      const coordData = await coordRes.json();
      const reportData = await reportRes.json();
      const emergencyData = emergencyRes && emergencyRes.ok ? await emergencyRes.json() : { meetings: [], attendance: [] };

      // Tag emergency meetings with isSOS and merge
      const sosMeetings = (emergencyData.meetings || []).map((m: any) => ({ ...m, isSOS: true, status: 'closed' }));
      const sosAttendance = emergencyData.attendance || [];

      const meetingsList = [...(reportData.meetings || []), ...sosMeetings]
        .filter((m: any) => !m.isDeleted); // TOMBSTONE FILTER
      meetingsList.sort((a: any, b: any) => getSafeTime(b.createdAt || b.endedAt || b.syncedAt) - getSafeTime(a.createdAt || a.endedAt || a.syncedAt));

      const mergedAttendance = [...(reportData.attendance || []), ...sosAttendance]
        .filter((a: any) => !a.isDeleted); // TOMBSTONE FILTER

      const processedReportData = { ...reportData, meetings: meetingsList, attendance: mergedAttendance, suspiciousLogs: reportData.suspiciousLogs || [] };

      // SMART MERGE: Use cached roster if backend skipped it
      if (hasRoster && (!reportData.users || reportData.users.length === 0)) {
        processedReportData.users = JSON.parse(cachedRoster!);
      } else if (reportData.users && reportData.users.length > 0) {
        localStorage.setItem('uba_master_roster', JSON.stringify(reportData.users));
      }

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

  // Derived CRM Data
  const crmUsers = useMemo(() => {
    // Normalize VTU for matching
    const normalizeVTU = (vtu: any) => String(vtu).replace(/\D/g, '');
    const attendanceMap = (data.attendance || []).reduce((acc: any, scan: any) => {
      const normVTU = normalizeVTU(scan.vtuNumber);
      acc[normVTU] = (acc[normVTU] || 0) + 1;
      return acc;
    }, {});

    return (data.users || []).map((u: any) => {
      const normVTU = normalizeVTU(u.vtuNumber);
      return {
        ...u,
        eventsAttended: attendanceMap[normVTU] || 0,
        //  FIX: If they are in the list, assume they are members unless isGuest is EXACTLY true
        isGuest: u.isGuest === true 
      };
    }).filter((u: any) => {
      // 1. Tab Filter
      if (crmTab === 'members' && u.isGuest) return false;
      if (crmTab === 'guests' && !u.isGuest) return false;
      // 2. Gender Filter
      if (crmFilters.gender !== 'All' && u.gender !== crmFilters.gender) return false;
      // 3. 🛡️ BULLETPROOF YEAR FILTER
      if (crmFilters.year !== 'All') {
        const safeYear = String(u.year || 'Unknown').trim().toLowerCase();
        // Catches exact match OR contains the number (e.g. "1st", "Year 1", " 1 ")
        if (safeYear !== crmFilters.year && !safeYear.includes(crmFilters.year)) {
          return false;
        }
      }
      return true;
    }).sort((a: any, b: any) => b.eventsAttended - a.eventsAttended);
  }, [data.users, data.attendance, crmTab, crmFilters]);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  const handleAddCoordinator = async () => {
    if (isProcessing) return;
    if (!coordinatorEmail.includes('@')) return showToast("Enter a valid email address");
    setIsProcessing(true);
    const t = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/admin/add-coordinator`, { 
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, 
      body: JSON.stringify({ email: coordinatorEmail }) 
    });
    if (res.ok) { setCoordinatorEmail(''); fetchData(true); showToast("Student Coordinator added!"); }
    else { showToast("Failed to add coordinator"); }
    setTimeout(() => setIsProcessing(false), 30000);
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
      if (res.ok) {
        showToast("Device lock reset!");
        localStorage.removeItem('uba_master_roster'); // ⚡ KILLS THE STALE CACHE
        fetchData(true);
        setSelectedStudent(null);
      }
    } catch (e) { showToast("Network error."); }
  };

  // Modified function to handle the isSOS flag seamlessly
  const handleDeleteMeeting = async (meetingId: string, isSOS: boolean = false) => {
    if (!confirm(`Permanently delete this ${isSOS ? 'EMERGENCY ' : ''}meeting and all its logs?`)) return;
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/admin/delete-meeting`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, 
        body: JSON.stringify({ meetingId, isEmergency: isSOS })
      });
      if (res.ok) { fetchData(true); showToast("Session archived"); }
      else { showToast("Failed to archive session"); }
    } catch (e) { showToast("Network error during delete"); }
  };

  // GARBAGE COLLECTOR: Permanently destroy all tombstoned data
  const handleEmptyTrash = async () => {
    if (!confirm("WARNING: This permanently destroys all archived sessions and attendance records. Cannot be undone. Continue?")) return;
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    try {
      const res = await fetch(`${API_URL}/admin/empty-trash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
         const data = await res.json();
         showToast(data.message);
         fetchData(true);
      } else { showToast("Failed to empty trash"); }
    } catch (e) { showToast("Network error"); }
    setIsProcessing(false);
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
        const scans = parsed.scans || [];
        const session = parsed.session;

        if (scans.length === 0) { setIsRestoringBackup(false); return showToast('Backup file contains no scan data'); }

        const sessions = session ? [{
          meetingId: session.meetingId,
          meetingTitle: session.meetingName || session.meetingTitle,
          coordinatorEmail: session.coordinatorEmail,
          endedAt: Date.now(),
          scanCount: scans.length
        }] : [];

        const token = await auth.currentUser?.getIdToken();
        if (!token) { setIsRestoringBackup(false); return showToast('Not authenticated'); }

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
          showToast(`Restore failed: ${errData.error || 'Server error'}`);
        }
      } catch (err) {
        showToast('Invalid backup file format');
      } finally {
        setIsRestoringBackup(false);
        if (sosFileInputRef.current) sosFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
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

  // --- EVENT SCHEDULING FUNCTIONS ---
  const handleScheduleCSV = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) return showToast("CSV is empty");

      // Bulletproof regex to split by comma ONLY if it's not inside quotes
      const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/"/g, '').toUpperCase());
      const vtuIdx = headers.findIndex(h => h.includes('VTU'));
      const nameIdx = headers.findIndex(h => h.includes('NAME'));

      if (vtuIdx === -1) return showToast("CSV missing VTU column");

      const parsedStudents: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length > vtuIdx) {
          const vtu = cols[vtuIdx]?.replace(/"/g, '').trim().toUpperCase().replace(/\D/g, '');
          const name = nameIdx !== -1 ? cols[nameIdx]?.replace(/"/g, '').trim() : `Unknown`;
          if (vtu) parsedStudents.push({ vtu, name });
        }
      }
      setScheduleManifest(parsedStudents);
      showToast(`Loaded ${parsedStudents.length} expected students`);
    };
    reader.readAsText(file);
  };

  const submitSchedule = async () => {
    if (!scheduleForm.title || !scheduleForm.date) return showToast("Title and Date are required!");
    setIsProcessing(true);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}/meeting/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...scheduleForm, manifest: scheduleManifest })
    });
    if (res.ok) {
      showToast("Event Scheduled Successfully!");
      setScheduleForm({ title: '', date: '', time: '', venue: '', type: 'standard', targetAudience: [] });
      setScheduleManifest([]);
      if (scheduleFileRef.current) scheduleFileRef.current.value = '';
      fetchData(true);
    } else {
      showToast("Failed to schedule event.");
    }
    setIsProcessing(false);
  };

  const toggleAudience = (year: string) => {
    setScheduleForm(prev => ({
      ...prev,
      targetAudience: prev.targetAudience.includes(year) 
        ? prev.targetAudience.filter(y => y !== year) 
        : [...prev.targetAudience, year]
    }));
  };

  // CRM API Calls
  const executeCrmAction = async (endpoint: string, payload: any, successMsg: string) => {
    setIsProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, 
        body: JSON.stringify(payload) // This sends the { vtu: u.vtuNumber }
      });
      
      if (res.ok) {
        showToast(successMsg);
        localStorage.removeItem('uba_master_roster'); // ⚡ KILLS THE STALE CACHE
        fetchData(true); // REFRESH the list immediately
      } else {
        const errorData = await res.json();
        showToast(errorData.error || "Action Failed");
      }
    } catch (e) {
      showToast("Network error");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadMeetingCSV = (meetingId: string, meetingTitle: string) => {
    const meeting = (data.meetings || []).find((m: any) => m.id === meetingId);
    if (!meeting) return showToast("Meeting not found.");

    const attendees = (data.attendance || []).filter((a: any) => a.meetingId === meetingId);
    const isVerifiable = meeting.type === 'verifiable';
    const phases = meeting.phases || [];
    const totalPhases = phases.length;
    const manifest = meeting.manifest || [];

    // 1. Group Data by VTU
    const studentStats: Record<string, any> = {};

    // Seed with Base Roster (Manifest)
    if (isVerifiable) {
      manifest.forEach((m: any) => {
        studentStats[String(m.vtu)] = {
          vtu: String(m.vtu),
          name: m.name || 'Unknown',
          isManifest: true,
          scans: new Set(),
          isManual: false
        };
      });
    }

    // Process all actual scans
    attendees.forEach((at: any) => {
      const vtu = String(at.vtuNumber);
      if (!studentStats[vtu]) {
        // Late Joiner (Scanned but not in Base Roster)
        studentStats[vtu] = {
          vtu: vtu,
          name: at.studentName || 'Unknown',
          isManifest: false, 
          scans: new Set(),
          isManual: at.isOverride
        };
      } else {
        if (at.isOverride) studentStats[vtu].isManual = true;
      }
      
      if (at.phaseId && at.phaseId !== 'none') {
        studentStats[vtu].scans.add(at.phaseId);
      } else if (!isVerifiable) {
        studentStats[vtu].scans.add('standard');
      }
    });

    const exportList = Object.values(studentStats);
    if (exportList.length === 0) return showToast("No data to export.");

    // 2. Build CSV Headers
    let csv = "";
    if (isVerifiable) {
      csv = "S.NO,Name,VTU,Gender,Dept,Year,Phone,Base Roster,Phases Attended,Missed Checkpoints,OD Status,Manual Override\n";
    } else {
      csv = "S.NO,Name,VTU,Gender,Dept,Year,Phone,Status\n";
    }

    // 3. Sort students (Highest attendance first, then by VTU)
    if (isVerifiable) {
      exportList.sort((a, b) => b.scans.size - a.scans.size || a.vtu.localeCompare(b.vtu));
    } else {
      exportList.sort((a, b) => a.vtu.localeCompare(b.vtu));
    }

    // 4. Generate Rows
    exportList.forEach((stat, index) => {
      // Master Roster Priority Lookup
      const u = (data.users || []).find((user: any) => String(user.vtuNumber) === stat.vtu) || {};
      const finalName = u.name || stat.name || 'Unknown';
      const gender = u.gender || 'N/A';
      const dept = u.dept || 'N/A';
      const year = u.year || 'N/A';
      const phone = u.phone || 'N/A';

      if (isVerifiable) {
        const attendedCount = stat.scans.size;
        const rosterStatus = stat.isManifest ? "Yes" : "LATE JOINER";
        const overrideStatus = stat.isManual ? "YES" : "NO";
        
        // Map missing phases
        let missedNames: string[] = [];
        phases.forEach((p: any) => {
          if (!stat.scans.has(p.id)) missedNames.push(p.title);
        });
        const missedString = missedNames.length > 0 ? missedNames.join(" & ") : "None";

        // Calculate OD Status
        let odStatus = "DENIED";
        if (totalPhases === 0) {
            odStatus = "PENDING (NO PHASES)";
        } else if (attendedCount === totalPhases) {
          odStatus = "GRANTED";
        } else if (attendedCount === totalPhases - 1) {
          odStatus = "REVIEW REQUIRED";
        }

        csv += `${index + 1},"${finalName}",${stat.vtu},${gender},${dept},${year},${phone},"${rosterStatus}","${attendedCount}/${totalPhases}","${missedString}","${odStatus}","${overrideStatus}"\n`;
      } else {
         const status = stat.isManual ? 'MANUAL' : 'VERIFIED';
         csv += `${index + 1},"${finalName}",${stat.vtu},${gender},${dept},${year},${phone},${status}\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${meetingTitle.replace(/\s+/g, '_')}_Consolidated_Report.csv`;
    link.click();
  };

  // --- FEATURE 7: GLOBAL SEMESTER EXPORT WITH FILTERS ---
  const handleGlobalExport = () => {
    if (!data.users || data.users.length === 0) return showToast("No users available for export.");

    let csv = "S.NO,Student Name,VTU,Department,Year,Club Status,Total Events Attended,Expected Verifiable Trips,Overall %,Strikes\n";

    const userAttendanceMap: Record<string, Set<string>> = {};
    (data.attendance || []).forEach((a: any) => {
       if (!userAttendanceMap[a.vtuNumber]) userAttendanceMap[a.vtuNumber] = new Set();
       userAttendanceMap[a.vtuNumber].add(a.meetingId);
    });

    const expectedTripsMap: Record<string, number> = {};
    (data.meetings || []).forEach((m: any) => {
       if (m.type === 'verifiable' && m.manifest) {
          m.manifest.forEach((man: any) => {
             const cleanVtu = String(man.vtu).replace(/\D/g, '');
             if (!expectedTripsMap[cleanVtu]) expectedTripsMap[cleanVtu] = 0;
             expectedTripsMap[cleanVtu]++;
          });
       }
    });

    const exportData = data.users.map((u: any) => {
      // 1. BULLETPROOF VTU EXTRACTION
      let vtuStr = String(u.vtuNumber || u.vtu || '').trim();
      if (vtuStr === 'undefined' || vtuStr === 'null') vtuStr = '';
      let vtu = vtuStr.replace(/\D/g, '');
      // Fallback: rip VTU from Name or Email if blank
      if (!vtu) {
        if (u.name && u.name.toUpperCase().includes('VTU')) {
          vtu = u.name.replace(/\D/g, '');
        } else if (u.email) {
          vtu = u.email.split('@')[0].replace(/\D/g, '');
        } else {
          vtu = 'UNKNOWN';
        }
      }

      // 2. CLEAN UP THE NAME
      let finalName = u.name || 'Unknown';
      if (finalName === 'undefined') finalName = 'Unknown';
      // Tag rows where the name is literally the VTU number
      if (finalName.toUpperCase().includes('VTU') && finalName.length < 12) {
        finalName = 'Needs Name Update';
      }

      // 3. CLEAN UP DEPT & YEAR
      const dept = (u.dept && String(u.dept) !== 'undefined') ? u.dept : 'N/A';
      const year = (u.year && String(u.year) !== 'undefined') ? u.year : 'N/A';

      // 4. CALCULATE STATS
      const attended = userAttendanceMap[vtu] ? userAttendanceMap[vtu].size : 0;
      const expected = expectedTripsMap[vtu] || 0;
      const percentage = expected === 0 ? (attended > 0 ? 100 : 0) : Math.round((attended / expected) * 100);

      return {
        name: finalName, vtu, dept, year,
        status: u.isGuest ? 'Guest' : 'Member', attended, expected, percentage, strikes: u.strikes || 0
      };
    });

    // APPLY FILTERS
    const filteredExport = exportData.filter((row: any) => {
        if (exportFilters.year !== 'All' && String(row.year) !== exportFilters.year) return false;
        if (exportFilters.status !== 'All' && row.status !== exportFilters.status) return false;
        return true;
    });

    if (filteredExport.length === 0) return showToast("No students match these export filters.");

    filteredExport.sort((a: any, b: any) => {
       if (a.status !== b.status) return a.status === 'Member' ? -1 : 1;
       if (a.year !== b.year) return String(a.year).localeCompare(String(b.year));
       return a.vtu.localeCompare(b.vtu);
    });

    filteredExport.forEach((row: any, index: number) => {
       csv += `${index + 1},"${row.name}",${row.vtu},${row.dept},${row.year},${row.status},${row.attended},${row.expected},${row.percentage}%,${row.strikes}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `UBA_Report_${exportFilters.year}_${exportFilters.status}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  const getMeetingStats = (attendeesList: any[]) => {
    return attendeesList.reduce((acc: any, curr: any) => {
      // Find the user in the Master Roster (data.users)
      const vtuKey = String(curr.vtuNumber || curr.vtu || '').replace(/\D/g, '');
      const user = (data.users || []).find((u: any) => String(u.vtuNumber || '').replace(/\D/g, '') === vtuKey);
      
      // Use Master Roster data if available, otherwise fallback to temporary scan data
      const gen = String(user?.gender || curr.gender || 'Unknown').toUpperCase();
      const year = String(user?.year || curr.year || 'Unknown');
      
      if (!acc.years[year]) acc.years[year] = { Male: 0, Female: 0, Unspecified: 0, total: 0 };
      
      if (gen.startsWith('M')) { 
        acc.gender['Male'] = (acc.gender['Male'] || 0) + 1; 
        acc.years[year].Male += 1; 
      } 
      else if (gen.startsWith('F')) { 
        acc.gender['Female'] = (acc.gender['Female'] || 0) + 1; 
        acc.years[year].Female += 1; 
      } 
      // THE FIX: Catch everyone else so the math equals the total!
      else {
        acc.gender['Unspecified'] = (acc.gender['Unspecified'] || 0) + 1; 
        acc.years[year].Unspecified += 1;
      }
      
      acc.years[year].total += 1;
      
      return acc;
    }, { gender: { Male: 0, Female: 0, Unspecified: 0 }, years: {} });
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
    const searchMatch = (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.createdByName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const d = new Date(getSafeTime(m.createdAt));
    const mMonth = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    return searchMatch && (filterMonth === 'All' || filterMonth === mMonth);
  });

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

  // FIXED: Removed networkLocked (Admin only needs initialLoad)
  if (initialLoad || loading) return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <div className="h-20 bg-white rounded-3xl animate-pulse shadow-sm w-full"></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white rounded-[2rem] animate-pulse shadow-sm"></div>)}
      </div>
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-96 bg-white rounded-[3rem] animate-pulse shadow-sm"></div>
        <div className="lg:col-span-4 h-96 bg-white rounded-[3rem] animate-pulse shadow-sm"></div>
      </div>
    </div>
  );

  return (
    <ProtectedRoute allowedRoles={["head"]}>
      <div className="min-h-screen font-sans bg-white text-gray-900 flex flex-col">
        
        {toastMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 border-2 border-[#FF5722] bg-[#111827] text-white px-8 py-3 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest z-[200] animate-in fade-in slide-in-from-bottom-4">
            {toastMsg}
          </div>
        )}

        {/* --- DEAN'S REPORT EXPORT MODAL --- */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowExportModal(false)}>
            <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 mb-2 uppercase">Dean's Report</h2>
              <p className="text-xs font-bold text-gray-500 mb-6 uppercase tracking-widest">Filter Global Export Data</p>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-[10px] font-black text-[#FF5722] uppercase tracking-widest mb-1">Filter by Year</label>
                  <select value={exportFilters.year} onChange={e => setExportFilters({...exportFilters, year: e.target.value})} className="w-full p-4 border border-gray-200 rounded-xl font-bold outline-none focus:border-[#FF5722]">
                    <option value="All">All Years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[#FF5722] uppercase tracking-widest mb-1">Filter by Status</label>
                  <select value={exportFilters.status} onChange={e => setExportFilters({...exportFilters, status: e.target.value})} className="w-full p-4 border border-gray-200 rounded-xl font-bold outline-none focus:border-[#FF5722]">
                    <option value="All">All Statuses (Members + Guests)</option><option value="Member">Official Members Only</option><option value="Guest">Guests Only</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-black uppercase text-xs">Cancel</button>
                <button onClick={handleGlobalExport} className="flex-1 py-4 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-green-700">Download</button>
              </div>
            </div>
          </div>
        )}

        {/* UNIVERSAL STUDENT DOSSIER MODAL */}
        {selectedStudent && (() => {
          const masterRoster = JSON.parse(localStorage.getItem('uba_master_roster') || '[]');
          // Normalize VTU for matching
          const normalizeVTU = (vtu: any) => String(vtu).replace(/\D/g, '');
          const vtu = selectedStudent.vtuNumber || selectedStudent.vtu;
          const normVTU = normalizeVTU(vtu);
          const studentContact = masterRoster.find((u:any) => normalizeVTU(u.vtuNumber) === normVTU) || selectedStudent;
          const phoneNum = studentContact.phone || 'N/A';
          return (
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
                  <a href={`https://wa.me/91${phoneNum.replace(/\D/g, '')}`} target="_blank" className="bg-[#25D366] text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.12.553 4.189 1.606 6.06L0 24l6.117-1.605a11.77 11.77 0 005.925 1.585h.005c6.635 0 12.032-5.396 12.035-12.03a11.79 11.79 0 00-3.517-8.503z"/></svg>
                    WhatsApp
                  </a>
                  <a href={`sms:+91${phoneNum.replace(/\D/g, '')}`} className="bg-[#007AFF] text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
                    SMS Text
                  </a>
                </div>
              )}
              {selectedStudent.userData?.email && (
                <button onClick={() => handleResetDevice(selectedStudent.userData?.email)} className="w-full bg-red-50 text-red-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100 mt-4">Reset Phone Binding</button>
              )}
            </div>
          </div>
          );
        })()}

        {/* ENTERPRISE NAVBAR */}
        <nav className="bg-white border-b-2 border-[#FF5722] sticky top-0 shadow-sm z-40">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src="/uba-logo.png" className="h-10 w-10 object-contain rounded-full" alt="UBA" />
              <h1 className="font-black uppercase tracking-tighter italic text-sm md:text-xl text-gray-900 hidden md:block">UBA CLUB</h1>
            </div>
            
            {/* DESKTOP TABS */}
            <div className="hidden md:flex bg-gray-100 p-1 rounded-2xl">
              <button onClick={() => setAdminTab('operations')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'operations' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Operations</button>
              <button onClick={() => setAdminTab('roster')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'roster' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Roster & CRM</button>
              <button onClick={() => setAdminTab('schedule')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'schedule' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Schedule</button>
              <button onClick={() => setAdminTab('broadcast')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'broadcast' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Broadcasts</button>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button onClick={handleEmptyTrash} disabled={isProcessing} className="text-[10px] font-black px-4 py-2.5 rounded-xl border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition uppercase tracking-widest disabled:opacity-50">Empty Trash</button>
              <button onClick={() => fetchData(true)} className="text-[10px] font-black px-4 py-2.5 rounded-xl border-2 border-gray-100 hover:bg-gray-50 transition uppercase tracking-widest text-gray-600">Refresh</button>
              <button onClick={() => signOut(auth)} className="text-[10px] font-black px-4 py-2.5 rounded-xl bg-gray-900 text-white hover:bg-black transition tracking-widest uppercase">Logout</button>
            </div>

            {/* MOBILE MENU TOGGLE */}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 bg-[#FFF9F5] rounded-xl border border-[#FF5722]/20">
               <div className={`w-5 h-0.5 bg-[#FF5722] mb-1.5 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
               <div className={`w-5 h-0.5 bg-[#FF5722] transition-all ${isMenuOpen ? '-rotate-45 -translate-y-0.5' : ''}`}></div>
            </button>
          </div>

          {/* MOBILE TABS MENU */}
          {isMenuOpen && (
            <div className="w-full bg-white border-b-2 border-[#FF5722] p-4 flex flex-col gap-2 md:hidden shadow-2xl animate-in slide-in-from-top-4">
               <button onClick={() => { setAdminTab('operations'); setIsMenuOpen(false); }} className={`w-full py-4 font-black rounded-xl uppercase text-xs tracking-widest ${adminTab === 'operations' ? 'bg-[#FFF9F5] text-[#FF5722] border border-[#FF5722]/20' : 'bg-gray-50 text-gray-700'}`}>Operations</button>
               <button onClick={() => { setAdminTab('roster'); setIsMenuOpen(false); }} className={`w-full py-4 font-black rounded-xl uppercase text-xs tracking-widest ${adminTab === 'roster' ? 'bg-[#FFF9F5] text-[#FF5722] border border-[#FF5722]/20' : 'bg-gray-50 text-gray-700'}`}>Roster & CRM</button>
               <button onClick={() => { setAdminTab('schedule'); setIsMenuOpen(false); }} className={`w-full py-4 font-black rounded-xl uppercase text-xs tracking-widest ${adminTab === 'schedule' ? 'bg-[#FFF9F5] text-[#FF5722] border border-[#FF5722]/20' : 'bg-gray-50 text-gray-700'}`}>Schedule</button>
               <div className="h-px w-full bg-gray-100 my-2"></div>
               <button onClick={() => { fetchData(true); setIsMenuOpen(false); }} className="w-full py-4 bg-white text-gray-700 font-black rounded-xl uppercase text-xs tracking-widest border border-gray-200">Force Refresh</button>
               <button onClick={() => signOut(auth)} className="w-full py-4 bg-red-50 text-red-500 font-black rounded-xl uppercase text-xs tracking-widest border border-red-100">Logout</button>
            </div>
          )}
        </nav>

        <main className="max-w-7xl mx-auto w-full p-4 md:p-6 mt-2 flex-grow">

          {/* ========================================== */}
                  {/* TAB 4: BROADCAST CENTER & HISTORY          */}
                  {/* ========================================== */}
                  {adminTab === 'broadcast' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in space-y-10">
                      {/* Centered Composer */}
                      <div className="bg-[#111827] rounded-[3rem] p-8 md:p-12 shadow-2xl relative overflow-hidden text-center mt-4">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4 opacity-5 text-[15rem] pointer-events-none">📡</div>
                        <h2 className="font-black text-3xl text-white uppercase tracking-widest mb-2 relative z-10">Command Center</h2>
                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-8 relative z-10">Send targeted push notifications instantly</p>
                        <div className="space-y-4 relative z-10 text-left max-w-xl mx-auto">
                          <input 
                            type="text" 
                            placeholder="Notification Title (e.g. Bus Leaving!)" 
                            value={broadcastForm.title}
                            onChange={(e) => setBroadcastForm({...broadcastForm, title: e.target.value})}
                            className="w-full bg-gray-800/50 border border-gray-700 text-white rounded-xl p-4 font-bold outline-none focus:border-[#FF5722] placeholder-gray-500 text-center" 
                          />
                          <textarea 
                            placeholder="Message content..." 
                            value={broadcastForm.body}
                            onChange={(e) => setBroadcastForm({...broadcastForm, body: e.target.value})}
                            rows={3}
                            className="w-full bg-gray-800/50 border border-gray-700 text-white rounded-xl p-4 font-bold outline-none focus:border-[#FF5722] placeholder-gray-500 resize-none text-center" 
                          />
                          <div className="flex gap-4">
                            <select 
                              value={broadcastForm.target}
                              onChange={(e) => setBroadcastForm({...broadcastForm, target: e.target.value})}
                              className="flex-1 bg-gray-800/50 border border-gray-700 text-white rounded-xl p-4 font-bold outline-none focus:border-[#FF5722] text-center"
                            >
                              <optgroup label="📡 Global Radio Channels">
                                <option value="all_students">All Students</option>
                                <option value="year_1">Year 1 Only</option>
                                <option value="year_2">Year 2 Only</option>
                                <option value="year_3">Year 3 Only</option>
                                <option value="year_4">Year 4 Only</option>
                                <option value="coordinators">Coordinators Only</option>
                              </optgroup>
                            </select>
                          </div>
                          <button 
                            onClick={handleSendBroadcast}
                            disabled={isProcessing}
                            className="w-full py-5 bg-[#FF5722] text-white font-black rounded-xl uppercase tracking-widest shadow-xl hover:bg-orange-600 transition active:scale-95 disabled:opacity-50 mt-4"
                          >
                            {isProcessing ? 'Transmitting...' : 'FIRE NOTIFICATION 🚀'}
                          </button>
                        </div>
                      </div>
                      {/* History Log */}
                      <div>
                        <h3 className="font-black text-gray-400 uppercase tracking-[0.2em] text-xs mb-6 text-center">Transmission History</h3>
                        <div className="grid gap-3">
                          {broadcastHistory.map((log) => (
                            <div 
                              key={log.id} 
                              onClick={() => setSelectedBroadcast(log)}
                              className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-[#FF5722] hover:shadow-md transition-all cursor-pointer flex justify-between items-center group"
                            >
                              <div className="overflow-hidden pr-4">
                                <h4 className="font-black text-gray-900 truncate">{log.title}</h4>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1 tracking-widest truncate">{log.targetTopic.replace('_', ' ')}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[9px] font-black bg-orange-50 text-[#FF5722] px-3 py-1 rounded-lg uppercase tracking-widest inline-block mb-1">
                                  Sent
                                </span>
                                <p className="text-[9px] font-bold text-gray-400">
                                  {new Date(log.sentAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          ))}
                          {broadcastHistory.length === 0 && (
                            <p className="text-center text-[10px] font-black text-gray-400 uppercase py-10">No broadcasts sent yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Broadcast Details Modal */}
                  {selectedBroadcast && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4 backdrop-blur-sm" onClick={() => setSelectedBroadcast(null)}>
                      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 border-2 border-[#111827]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100">
                          <div>
                            <span className="text-[9px] font-black bg-gray-100 text-gray-600 px-3 py-1 rounded-md uppercase tracking-widest mb-2 inline-block">Target: {selectedBroadcast.targetTopic.replace('_', ' ')}</span>
                            <h3 className="font-black text-xl text-gray-900 uppercase leading-tight mt-1">{selectedBroadcast.title}</h3>
                          </div>
                          <button onClick={() => setSelectedBroadcast(null)} className="text-gray-400 hover:text-red-500 font-black text-2xl transition-colors">&times;</button>
                        </div>
                        <div className="bg-[#FFF9F5] p-5 rounded-2xl border border-orange-100 mb-6">
                          <p className="text-sm font-medium text-gray-800 leading-relaxed italic">"{selectedBroadcast.body}"</p>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          <p>By: {selectedBroadcast.sentBy.split('@')[0]}</p>
                          <p>{new Date(selectedBroadcast.sentAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}
          {/* TAB 1: OPERATIONS (Dashboard & Events) */}
          {/* ========================================== */}
          {adminTab === 'operations' && (
            <div className="space-y-6 animate-in fade-in">
              {/* STAT BOXES */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-[#FF5722] bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Total Trips</p><p className="text-4xl font-black text-gray-900">{filteredMeetings.length}</p></div>
                <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-[#FF5722] bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Total Scans</p><p className="text-4xl font-black text-gray-900">{(data.attendance || []).length}</p><p className="text-[8px] font-bold text-red-500 mt-1">{(data.attendance || []).filter((a:any) => a.isEmergency).length > 0 ? `incl. ${(data.attendance || []).filter((a:any) => a.isEmergency).length} SOS` : ''}</p></div>
                <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-gray-900 bg-white"><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Members</p><p className="text-4xl font-black text-gray-900">{data.totalUsersCount !== undefined ? data.totalUsersCount : (data.users || []).length}</p></div>
                <div className="p-6 rounded-3xl shadow-sm text-center border-b-4 border-red-500 bg-red-50"><p className="text-[10px] font-black uppercase text-red-400 mb-1 tracking-widest italic">Security Flags</p><p className="text-4xl font-black text-red-600 animate-pulse">{(data.suspiciousLogs || []).length}</p></div>
              </div>

              <div className="grid lg:grid-cols-12 gap-8">
                {/* EVENTS COLUMN */}
                <div className="lg:col-span-8 space-y-6">
                  <div className="p-4 rounded-2xl border border-[#FF5722]/30 flex flex-col md:flex-row gap-4 bg-[#FFF9F5] shadow-sm">
                     <input type="text" placeholder="🔍 Search event or coordinator..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 p-4 rounded-xl outline-none font-black text-sm border border-gray-100 bg-white shadow-inner" />
                     <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="p-4 text-xs rounded-xl font-black bg-white border border-gray-100 uppercase tracking-widest">{availableMonths.map(month => <option key={month} value={month}>{month}</option>)}</select>
                  </div>

                  <div className="flex items-center gap-2 mb-2 mt-4">
                     <div className="h-2 w-2 rounded-full bg-[#FF5722] animate-pulse"></div>
                     <h3 className="font-black text-xs uppercase tracking-[0.2em] text-gray-400">Live & Recent Deployments</h3>
                  </div>

            {displayedMeetings.map((m: any) => {
              const attendees = (data.attendance || []).filter((a:any) => a.meetingId === m.id);
              const suspicious = (data.suspiciousLogs || []).filter((s:any) => s.meetingId === m.id);
              const manifest = m.manifest || [];
              const stats = getMeetingStats(attendees);
              
              const isAnalytics = analyticsViewMap[m.id] || false;
              const activeTab = tabMap[m.id] || 'verified';
              const setTab = (t: string) => setTabMap({ ...tabMap, [m.id]: t });

              const tabVerified = attendees.filter((a: any) => !a.isOverride);
              const tabManual = attendees.filter((a: any) => a.isOverride);
              const tabMissing = manifest.filter((man: any) => !attendees.some((att: any) => String(att.vtuNumber) === String(man.vtu)));

              return (
                // FIX 1: Tighter border radius (rounded-2xl), reduced padding (p-5), subtle shadow
                <div key={m.id} className={`p-5 md:p-6 rounded-2xl shadow-sm relative transition-all group ${m.isSOS ? 'border-2 border-red-500 bg-red-50 hover:shadow-md' : 'border border-gray-200 bg-white hover:border-orange-300 hover:shadow-md'}`}>
                  {/* FIX 2: Aligned Header with a clean bottom border */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-4 border-b border-gray-100 pb-4">
                     <div>
                       <div className="flex items-center gap-3">
                         <h3 className="font-black text-xl uppercase tracking-tight text-gray-900">{m.isSOS ? `🚨 ${m.title || m.meetingTitle}` : m.title}</h3>
                         {m.status === 'active' && !m.isSOS && <span className="bg-[#FF5722] text-white text-[8px] font-black px-2 py-0.5 rounded animate-pulse uppercase tracking-widest">Live Now</span>}
                         {m.isSOS && <span className="bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-widest animate-pulse">SOS</span>}
                       </div>
                       <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{m.isSOS ? `🚨 EMERGENCY SESSION BY: ${m.coordinatorEmail || m.syncedBy || 'Unknown'}` : `Host: ${m.createdByName || m.coordinatorId}`}</p>
                     </div>
                     <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                       {/* FIX 3: Tighter, aligned buttons */}
                       <button onClick={() => setAnalyticsViewMap({...analyticsViewMap, [m.id]: !isAnalytics})} className={`px-3 py-2 rounded-lg text-[9px] font-black border transition uppercase shadow-sm tracking-widest ${isAnalytics ? 'bg-gray-900 text-white border-gray-900' : 'text-[#FF5722] border-[#FF5722]/30 bg-orange-50 hover:bg-orange-100'}`}>{isAnalytics ? 'Close Analytics' : 'Analytics'}</button>
                       <button onClick={() => downloadMeetingCSV(m.id, m.title)} className="px-3 py-2 rounded-lg text-[9px] font-black border border-gray-200 hover:bg-gray-50 shadow-sm uppercase tracking-widest text-gray-700">Export</button>
                       <button onClick={() => handleDeleteMeeting(m.id, m.isSOS)} className="px-3 py-2 rounded-lg text-[9px] bg-red-50 font-black text-red-600 hover:bg-red-500 hover:text-white transition shadow-sm border border-red-100 uppercase tracking-widest">Archive</button>
                     </div>
                  </div>

                  {isAnalytics && (
                    <div className="space-y-6 animate-in fade-in duration-300 bg-gray-50/50 p-5 rounded-2xl mb-4 border border-gray-100">
                      
                      {/* --- GENDER ANALYTICS HERO SECTION --- */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        
                        {/* NEW SIDE-BY-SIDE CHART CARD */}
                        {/* FAIL-SAFE GENDER ANALYTICS CARD */}
                        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 flex flex-col min-h-[400px]">
                          <div className="mb-8">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-2">Demographics</h3>
                            <h2 className="text-2xl font-black uppercase italic tracking-tighter">Gender Split</h2>
                          </div>

                          {/* THE CHART AREA */}
                          <div className="flex-grow flex items-end justify-center gap-12 px-6 pb-4">
                            {/* BOYS BAR */}
                            <div className="flex flex-col items-center gap-4 w-full max-w-[80px] group">
                              <div 
                                className="w-full bg-blue-500 rounded-2xl shadow-2xl shadow-blue-200 transition-all duration-1000 ease-out relative"
                                style={{ height: `${Math.max(genderStats.boyPercent, 15)}%` }}
                              >
                                <span className="absolute -top-10 left-1/2 -translate-x-1/2 font-black text-blue-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                  {Math.round(genderStats.boyPercent)}%
                                </span>
                              </div>
                              <div className="text-center">
                                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Boys</p>
                                <p className="text-2xl font-black text-gray-900">{genderStats.boys}</p>
                              </div>
                            </div>

                            {/* GIRLS BAR */}
                            <div className="flex flex-col items-center gap-4 w-full max-w-[80px] group">
                              <div 
                                className="w-full bg-pink-500 rounded-2xl shadow-2xl shadow-pink-200 transition-all duration-1000 ease-out relative"
                                style={{ height: `${Math.max(genderStats.girlPercent, 15)}%` }}
                              >
                                <span className="absolute -top-10 left-1/2 -translate-x-1/2 font-black text-pink-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                  {Math.round(genderStats.girlPercent)}%
                                </span>
                              </div>
                              <div className="text-center">
                                <p className="text-[10px] font-black text-pink-500 uppercase tracking-widest mb-1">Girls</p>
                                <p className="text-2xl font-black text-gray-900">{genderStats.girls}</p>
                              </div>
                            </div>
                          </div>

                          {/* FOOTER STATS */}
                          <div className="mt-auto pt-6 border-t border-gray-50 flex justify-between">
                            <div className="text-center flex-1">
                              <p className="text-[8px] font-black text-gray-400 uppercase">Ratio</p>
                              <p className="font-black text-xs text-gray-600">
                                {genderStats.boys}:{genderStats.girls}
                              </p>
                            </div>
                            <div className="w-px bg-gray-100"></div>
                            <div className="text-center flex-1">
                              <p className="text-[8px] font-black text-gray-400 uppercase">Total Members</p>
                              <p className="font-black text-xs text-gray-600">{genderStats.total}</p>
                            </div>
                          </div>
                        </div>

                        {/* YEAR-WISE STATS CARD */}
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col h-full">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">By Year</h3>
                              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">Distribution</h2>
                            </div>
                          </div>

                          {/* YEAR-WISE VERTICAL STACKED BAR CHART */}
                          <div className="flex-grow flex items-end justify-between h-40 px-4 md:px-8 gap-3">
                            {[1, 2, 3, 4].map(y => {
                              const yData = stats.years[y.toString()] || { Male: 0, Female: 0, Unspecified: 0, total: 0 };
                              const maxArr = [1,2,3,4].map(yr => (stats.years[yr.toString()]?.total || 0));
                              const max = Math.max(...maxArr, 1);
                              const height = (yData.total / max) * 100;
                              return (
                                <div key={y} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                   <div className="w-8 md:w-12 bg-gray-50 rounded-t-lg overflow-hidden shadow-inner flex flex-col-reverse transition-all duration-500 border border-gray-100" style={{ height: `${Math.max(height, 5)}%` }}>
                                      <div className="w-full bg-blue-500 transition-all" style={{ height: `${yData.total > 0 ? (yData.Male / yData.total) * 100 : 0}%` }}></div>
                                      <div className="w-full bg-pink-500 transition-all" style={{ height: `${yData.total > 0 ? (yData.Female / yData.total) * 100 : 0}%` }}></div>
                                      <div className="w-full bg-gray-300 transition-all" style={{ height: `${yData.total > 0 ? (yData.Unspecified / yData.total) * 100 : 0}%` }}></div>
                                   </div>
                                   <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Yr {y}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* TABS SYSTEM */}
                      <div className="border-t border-gray-200 pt-5">
                        <div className="flex overflow-x-auto border-b border-gray-200 mb-3 shrink-0 no-scrollbar gap-2 pb-2">
                          <button onClick={() => setTab('verified')} className={`flex-1 py-2 px-3 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-lg ${activeTab === 'verified' ? 'text-white bg-[#111827] shadow-sm' : 'text-gray-500 bg-white hover:bg-gray-100 border border-gray-200'}`}>Verified ({tabVerified.length})</button>
                          {m.type === 'verifiable' && <button onClick={() => setTab('missing')} className={`flex-1 py-2 px-3 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-lg ${activeTab === 'missing' ? 'text-white bg-red-500 shadow-sm' : 'text-red-500 bg-red-50 hover:bg-red-100 border border-red-100'}`}>Abandoned ({tabMissing.length})</button>}
                          <button onClick={() => setTab('manual')} className={`flex-1 py-2 px-3 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-lg ${activeTab === 'manual' ? 'text-gray-900 border border-gray-900 bg-white shadow-sm' : 'text-gray-500 bg-white hover:bg-gray-100 border border-gray-200'}`}>Manual ({tabManual.length})</button>
                          <button onClick={() => setTab('suspicious')} className={`flex-1 py-2 px-3 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-lg ${activeTab === 'suspicious' ? 'text-purple-700 bg-purple-200 shadow-sm border border-purple-300' : 'text-purple-500 bg-purple-50 hover:bg-purple-100 border border-purple-100'}`}>Suspicious ({suspicious.length})</button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                          {activeTab === 'verified' && tabVerified.map((at:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className="p-3 rounded-xl border border-gray-200 bg-white flex justify-between items-center shadow-sm hover:border-[#FF5722] cursor-pointer">
                               <div className="overflow-hidden pr-2"><p className="font-bold text-xs text-gray-900 capitalize truncate">{at.studentName}</p><p className="text-[9px] font-mono font-black text-[#FF5722] mt-0.5">{at.vtuNumber}</p></div>
                             </div>
                           );
                          })}

                          {activeTab === 'missing' && tabMissing.map((m:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(m.vtu));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({studentName: dbUser?.name || m.name || 'Unknown', vtuNumber: m.vtu, userData: dbUser || {}, dept: dbUser?.dept || 'N/A', year: dbUser?.year || 'N/A', gender: dbUser?.gender || 'N/A'})} className="p-3 rounded-xl border border-red-200 bg-red-50 flex justify-between items-center shadow-sm hover:bg-red-100 cursor-pointer">
                               <div className="overflow-hidden pr-2"><p className="font-bold text-xs text-red-900 capitalize truncate">{m.name}</p><p className="text-[9px] font-mono font-black text-red-500 mt-0.5">{m.vtu}</p></div>
                               <span className="shrink-0 text-[8px] px-2 py-1 bg-red-600 text-white font-black rounded uppercase tracking-widest">Missing</span>
                             </div>
                           );
                          })}

                          {activeTab === 'manual' && tabManual.map((at:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className="p-3 rounded-xl border border-orange-200 bg-orange-50 flex justify-between items-center cursor-pointer hover:border-orange-300">
                               <div className="overflow-hidden pr-2"><p className="font-bold text-xs text-gray-900 capitalize truncate">{at.studentName}</p><p className="text-[9px] font-mono font-black text-gray-500 mt-0.5">{at.vtuNumber}</p></div>
                               <div className="text-right shrink-0"><p className="text-[8px] bg-orange-500 text-white px-2 py-1 rounded font-black uppercase tracking-widest mb-0.5 inline-block">Manual</p><p className="text-[8px] font-bold text-orange-400 italic block truncate w-16">By {at.enteredBy?.split('@')[0]}</p></div>
                             </div>
                           );
                          })}

                          {activeTab === 'suspicious' && suspicious.map((log: any, i: number) => (
                            <div key={i} className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex justify-between items-center col-span-1 md:col-span-2 shadow-sm">
                              <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-purple-700 uppercase tracking-widest mb-1 flex items-center gap-1"><span className="text-sm">🚨</span> Proxy Blocked</p>
                                <div className="flex gap-3">
                                  <p className="text-[8px] font-bold text-gray-500 uppercase truncate">Input: <span className="font-mono text-black font-black">{log.proxyVtu}</span></p>
                                  <p className="text-[8px] font-bold text-gray-500 uppercase border-l border-purple-200 pl-3 truncate">Owner: <span className="font-mono text-black font-black">{log.originalVtu}</span></p>
                                </div>
                              </div>
                            </div>
                          ))}

                          {((activeTab === 'verified' && tabVerified.length === 0) || 
                            (activeTab === 'missing' && tabMissing.length === 0) || 
                            (activeTab === 'manual' && tabManual.length === 0) || 
                            (activeTab === 'suspicious' && suspicious.length === 0)) && 
                            <div className="col-span-1 md:col-span-2 py-8 flex flex-col items-center justify-center border border-dashed border-gray-200 rounded-2xl bg-white">
                              <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest text-center">No data found</p>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  {!isAnalytics && (
                    // FIX 4: Compact Grid (3 cols on large screens), smaller cards, custom manual backgrounds
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {attendees.map((at:any, i:number) => {
                        const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                        return (
                        <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className={`p-3 rounded-xl border ${at.isOverride ? 'border-orange-200 bg-orange-50/50 hover:border-orange-400' : 'border-gray-100 bg-gray-50/50 hover:bg-white hover:border-[#FF5722] hover:shadow-sm'} flex justify-between items-center cursor-pointer transition-all group`}>
                           <div className="overflow-hidden pr-2">
                             <p className="font-bold text-xs text-gray-900 truncate capitalize group-hover:text-[#FF5722] transition-colors">{dbUser?.name || at.studentName || 'Unknown'}</p>
                             <p className="text-[9px] font-mono font-bold text-gray-400 group-hover:text-gray-700 transition-colors mt-0.5">{at.vtuNumber}</p>
                           </div>
                           {at.isOverride ? (
                              <span className="shrink-0 block text-[8px] bg-orange-100 text-orange-600 px-2 py-1 rounded font-black uppercase tracking-widest">Manual</span>
                           ) : (
                              <span className="shrink-0 block text-[8px] bg-green-50 text-green-600 px-2 py-1 rounded font-black uppercase tracking-widest">Verified</span>
                           )}
                        </div>
                        );
                      })}
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

                {/* COORDINATOR MANAGEMENT SIDEBAR */}
                <div className="lg:col-span-4 space-y-6">
                  <div className="p-6 md:p-8 rounded-[2.5rem] border-2 border-gray-100 bg-white shadow-sm hover:border-gray-200 transition-colors">
                    <h2 className="font-black mb-6 uppercase text-[10px] tracking-[0.2em] text-gray-400 flex items-center gap-2"><span className="text-lg">👑</span> Add Coordinator</h2>
                    <input type="email" value={coordinatorEmail} onChange={(e) => setCoordinatorEmail(e.target.value)} placeholder="Student Email..." className="w-full p-4 border border-gray-100 rounded-2xl mb-4 outline-none font-bold text-sm bg-gray-50 focus:bg-white focus:border-[#FF5722] transition-all" />
                    <button onClick={handleAddCoordinator} disabled={isProcessing} className="w-full bg-[#111827] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isProcessing ? 'Processing...' : 'Approve Access'}</button>

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
                </div>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 2: UNIFIED ROSTER & CRM */}
          {/* ========================================== */}
          {adminTab === 'roster' && (
            <div className="space-y-6 animate-in fade-in">
              
              {/* TOP ACTION BAR: FIXED LAYOUT */}
              <div className="bg-white p-4 md:p-6 rounded-3xl shadow-md border border-[#FF5722]/20 flex flex-col gap-4 mt-6">
                <div className="flex flex-col md:flex-row gap-4 w-full">
                  <div className="relative flex-grow">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Search VTU, Name..." 
                      value={vtuLookup} 
                      onChange={(e) => setVtuLookup(e.target.value)} 
                      className="w-full pl-12 pr-4 py-4 rounded-2xl outline-none font-black text-sm bg-gray-50 border border-transparent focus:bg-white focus:border-[#FF5722] transition-all"
                    />
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                    <select 
                      value={crmFilters.year} 
                      onChange={e => setCrmFilters({...crmFilters, year: e.target.value})} 
                      className="px-4 py-4 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#FF5722]"
                    >
                      <option value="All">All Years</option>
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                    </select>
                    <select value={crmTab} onChange={e => setCrmTab(e.target.value as any)} className="px-4 py-4 bg-gray-50 rounded-2xl font-bold text-xs outline-none border border-transparent focus:border-[#FF5722]">
                      <option value="members">Members</option>
                      <option value="guests">Guests</option>
                    </select>
                    <button onClick={() => setShowExportModal(true)} className="px-6 py-4 bg-green-600 text-white font-black rounded-2xl uppercase text-[10px] shadow-lg active:scale-95 transition-all">
                      Export
                    </button>
                  </div>
                </div>
              </div>

              {/* ADMIN TOOLS ROW */}
              <div className="grid md:grid-cols-3 gap-4 mt-6">
                {/* Bulk Upload */}
                <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-2xl p-4 flex items-center justify-between hover:bg-blue-100 transition relative cursor-pointer shadow-sm">
                  <div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Bulk Upload Roster</p>
                    <p className="text-[9px] font-bold text-blue-400 mt-1">Upload .csv file (VTU, NAME)</p>
                  </div>
                  <span className="text-xl">📁</span>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                
                {/* Yearly Purge */}
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Yearly Purge</p>
                    <select value={selectedPurgeYear} onChange={(e) => setSelectedPurgeYear(e.target.value)} className="mt-1 px-2 py-1 text-[9px] rounded-md font-bold bg-white border border-red-200 outline-none text-red-500">
                      <option value="1">Yr 1</option><option value="2">Yr 2</option><option value="3">Yr 3</option><option value="4">Yr 4</option>
                    </select>
                  </div>
                  <button onClick={handleYearPurge} disabled={isPurging} className="px-4 py-2 bg-red-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-700 transition disabled:opacity-50">Purge</button>
                </div>

                {/* 🚨 NUCLEAR RESET BUTTON */}
                <div className="bg-[#111827] rounded-2xl p-4 flex items-center justify-between border-2 border-red-600/50 shadow-md">
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Nuclear Reset</p>
                    <p className="text-[8px] font-bold text-gray-400 mt-1 uppercase">Clear All Phone Locks</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if(confirm("🚨 DANGER: This will force EVERY student to re-link their phones. Proceed?")) {
                        const token = await auth.currentUser?.getIdToken();
                        const res = await fetch(`${API_URL}/admin/global-device-reset`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }});
                        if(res.ok) {
                          alert("All devices unlinked! 🔓");
                          localStorage.removeItem('uba_master_roster'); // ⚡ KILLS THE STALE CACHE
                          fetchData(true);
                        }
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-700 active:scale-95 transition-all shadow-lg"
                  >
                    WIPE LOCKS
                  </button>
                </div>
              </div>

              {/* UNIFIED DATA TABLE */}
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <th className="p-4">Student Details</th>
                        <th className="p-4 text-center">Events</th>
                        <th className="p-4">Device Status</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
  {crmUsers
    .filter((u: any) => {
      const s = vtuLookup.toLowerCase();
      // ⚡ IMPROVED SEARCH: Matches anywhere in VTU, Name, or Dept
      return !s || 
             String(u.vtuNumber).toLowerCase().includes(s) || 
             (u.name || '').toLowerCase().includes(s) || 
             (u.dept || '').toLowerCase().includes(s);
    })
    // ⚡ BYPASS LIMIT: If search is active, show all matches. If not, show only 15.
    .slice(0, vtuLookup ? 10000 : rosterLimit) 
    .map((u: any) => (
      <tr key={u.vtuNumber} className="hover:bg-orange-50/30 transition-colors group">
         <td className="p-4">
            <p className="font-black text-sm text-gray-900">{u.name}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">{u.vtuNumber} • {u.dept || 'NO DEPT'} • YR {u.year || '?'}</p>
         </td>
         <td className="p-4 text-center">
            <span className="bg-white px-3 py-1 rounded-lg border font-black text-orange-600">{u.eventsAttended}</span>
         </td>
         <td className="p-4">
            {/* FIX: Deep-check for Device ID */}
            {(u.registeredDeviceId || u.userData?.registeredDeviceId) ? (
              <span className="text-[9px] font-black text-gray-500 bg-gray-100 px-2 py-1 rounded border">🔒 LOCKED</span>
            ) : (
              <span className="text-[9px] font-black text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 animate-pulse">🔓 UNSET</span>
            )}
         </td>
         <td className="p-4 text-right">
            <button 
              onClick={() => executeCrmAction(
                crmTab === 'guests' ? '/admin/promote-member' : '/admin/demote-guest',
                { vtu: u.vtuNumber },
                "Roster Updated!"
              )}
              className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all ${crmTab === 'guests' ? 'bg-green-600 text-white shadow-md' : 'bg-red-50 text-red-500'}`}
            >
              {crmTab === 'guests' ? 'Promote' : 'Demote'}
            </button>
         </td>
      </tr>
    ))}
</tbody>
                  </table>
                </div>
                {/* LOAD MORE BUTTON */}
                {crmUsers.length > rosterLimit && !vtuLookup && (
                  <button 
                    onClick={() => setRosterLimit(10000)} 
                    className="w-full py-6 bg-gray-50 text-gray-500 font-black uppercase text-xs tracking-widest hover:bg-gray-100 active:scale-95 transition-all border-t border-gray-100"
                  >
                    Load All {crmUsers.length} Students ↓
                  </button>
                )}
              </div>

            </div>
          )}

          {/* ========================================== */}
          {/* TAB 3: SCHEDULE */}
          {/* ========================================== */}
          {adminTab === 'schedule' && (
            <div className="max-w-2xl mx-auto animate-in fade-in">
              <div className="p-8 rounded-[2.5rem] border-2 border-orange-500 bg-[#FFF9F5] shadow-lg">
                <h2 className="font-black mb-6 uppercase text-xs tracking-[0.2em] text-orange-500 flex items-center gap-3"><span className="text-2xl">🗓️</span> Schedule Future Event</h2>
                
                <input type="text" placeholder="Event Title (e.g. Village Drive)" value={scheduleForm.title} onChange={e => setScheduleForm({...scheduleForm, title: e.target.value})} className="w-full p-4 rounded-xl mb-4 outline-none font-bold text-sm bg-white shadow-sm border border-orange-100" />
                
                <div className="flex gap-4 mb-4">
                  <input type="date" value={scheduleForm.date} onChange={e => setScheduleForm({...scheduleForm, date: e.target.value})} className="flex-1 p-4 rounded-xl outline-none font-bold text-sm bg-white shadow-sm border border-orange-100 text-gray-600" />
                  <input type="time" value={scheduleForm.time} onChange={e => setScheduleForm({...scheduleForm, time: e.target.value})} className="flex-1 p-4 rounded-xl outline-none font-bold text-sm bg-white shadow-sm border border-orange-100 text-gray-600" />
                </div>


                {/* ⚡ NEW EVENT TYPE TOGGLE ⚡ */}
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Event Type</p>
                <div className="flex gap-3 mb-6">
                  <button onClick={() => setScheduleForm({...scheduleForm, type: 'standard'})} className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${scheduleForm.type === 'standard' ? 'bg-[#111827] text-white shadow-lg' : 'bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50'}`}>Standard Event</button>
                  <button onClick={() => setScheduleForm({...scheduleForm, type: 'verifiable'})} className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${scheduleForm.type === 'verifiable' ? 'bg-[#FF5722] text-white shadow-lg' : 'bg-white border-2 border-orange-100 text-orange-400 hover:bg-orange-50'}`}>Verifiable (Trip)</button>
                </div>

                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Target Audience (Leave blank for all)</p>
                <div className="flex gap-3 mb-6">
                  {['1', '2', '3', '4'].map(yr => (
                    <button key={yr} onClick={() => toggleAudience(yr)} className={`flex-1 py-3 rounded-xl font-black text-sm transition ${scheduleForm.targetAudience.includes(yr) ? 'bg-orange-500 text-white shadow-md' : 'bg-white border border-orange-200 text-orange-400 hover:bg-orange-50'}`}>Year {yr}</button>
                  ))}
                </div>

                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Base Roster CSV (Optional)</p>
                <div className="relative w-full border-2 border-dashed border-orange-200 bg-white rounded-xl p-6 text-center mb-6 hover:bg-orange-50 transition cursor-pointer">
                  <p className="text-xs font-bold text-orange-500">{scheduleManifest.length > 0 ? `✓ ${scheduleManifest.length} Students Loaded` : '+ Upload CSV'}</p>
                  <input type="file" ref={scheduleFileRef} onChange={handleScheduleCSV} accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>

                <button onClick={submitSchedule} disabled={isProcessing} className="w-full bg-gray-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50">
                  {isProcessing ? 'Scheduling...' : '📅 Schedule Event'}
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </ProtectedRoute>
  );
}