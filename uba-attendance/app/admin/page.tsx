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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sosFileInputRef = useRef<HTMLInputElement>(null);
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  
  const [data, setData] = useState<any>({ meetings: [], attendance: [], users: [], suspiciousLogs: [], stats: {} });
  const [coordinators, setCoordinators] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // --- ENTERPRISE NAVIGATION STATE ---
  const [adminTab, setAdminTab] = useState<'operations' | 'roster' | 'schedule'>('operations');
  
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  // --- DEAN'S REPORT FILTER MODAL STATE ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFilters, setExportFilters] = useState({ year: 'All', status: 'All' });

  // Event Scheduling States
  const [scheduleForm, setScheduleForm] = useState({ title: '', date: '', time: '', venue: '', targetAudience: [] as string[] });
  const [scheduleManifest, setScheduleManifest] = useState<any[]>([]);

  // CRM States
  const [crmTab, setCrmTab] = useState<'members' | 'guests'>('members');
  const [crmFilters, setCrmFilters] = useState({ gender: 'All', year: 'All', minEvents: 1 });

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
    const attendanceMap = (data.attendance || []).reduce((acc: any, scan: any) => {
      acc[scan.vtuNumber] = (acc[scan.vtuNumber] || 0) + 1;
      return acc;
    }, {});

    return (data.users || []).map((u: any) => ({
      ...u,
      eventsAttended: attendanceMap[u.vtuNumber] || 0
    })).filter((u: any) => {
      // 1. Tab Filter
      if (crmTab === 'members' && u.isGuest) return false;
      if (crmTab === 'guests' && !u.isGuest) return false;
      // 2. Gender Filter
      if (crmFilters.gender !== 'All' && u.gender !== crmFilters.gender) return false;
      // 3. Year Filter
      if (crmFilters.year !== 'All' && String(u.year) !== crmFilters.year) return false;
      // 4. Events Filter (Ghost vs Active)
      if (u.eventsAttended < crmFilters.minEvents) return false;
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
      if (res.ok) { showToast("Device lock reset!"); fetchData(true); setSelectedStudent(null); }
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
      setScheduleForm({ title: '', date: '', time: '', venue: '', targetAudience: [] });
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
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload)
    });
    if (res.ok) { showToast(successMsg); fetchData(true); } 
    else { showToast("Action failed"); }
    setIsProcessing(false);
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
      const vtu = String(u.vtuNumber);
      const attended = userAttendanceMap[vtu] ? userAttendanceMap[vtu].size : 0;
      const expected = expectedTripsMap[vtu] || 0;
      const percentage = expected === 0 ? (attended > 0 ? 100 : 0) : Math.round((attended / expected) * 100);
      return {
         name: u.name || 'Unknown', vtu: vtu, dept: u.dept || 'N/A', year: u.year || 'N/A',
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
      // For emergency scans, vtu field is used instead of vtuNumber
      const vtuKey = curr.vtuNumber || curr.vtu;
      const user = (data.users || []).find((u: any) => String(u.vtuNumber) === String(vtuKey));
      
      // Use Master Roster data if available, otherwise fallback to temporary scan data
      const gen = String(user?.gender || curr.gender || 'Unknown').toUpperCase();
      const year = String(user?.year || curr.year || 'Unknown');
      
      if (!acc.years[year]) acc.years[year] = { Male: 0, Female: 0, total: 0 };
      if (gen.startsWith('M')) { 
        acc.gender['Male'] = (acc.gender['Male'] || 0) + 1; 
        acc.years[year].Male += 1; 
      } 
      else if (gen.startsWith('F')) { 
        acc.gender['Female'] = (acc.gender['Female'] || 0) + 1; 
        acc.years[year].Female += 1; 
      }
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

  if (initialLoad) return <div className="h-screen flex items-center justify-center bg-white"><div className="animate-spin rounded-full h-10 w-10 border-t-4 border-[#FF5722]"></div></div>;

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
          const vtu = selectedStudent.vtuNumber || selectedStudent.vtu;
          const studentContact = masterRoster.find((u:any) => String(u.vtuNumber) === String(vtu)) || selectedStudent;
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
              <h1 className="font-black uppercase tracking-tighter italic text-sm md:text-xl text-gray-900 hidden md:block">HQ Console</h1>
            </div>
            
            {/* DESKTOP TABS */}
            <div className="hidden md:flex bg-gray-100 p-1 rounded-2xl">
              <button onClick={() => setAdminTab('operations')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'operations' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Operations</button>
              <button onClick={() => setAdminTab('roster')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'roster' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Roster & CRM</button>
              <button onClick={() => setAdminTab('schedule')} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adminTab === 'schedule' ? 'bg-white text-[#FF5722] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Schedule</button>
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
                <div key={m.id} className={`p-6 md:p-8 rounded-[3rem] shadow-lg relative transition-all group ${m.isSOS ? 'border-4 border-red-600 bg-red-50 hover:border-red-700' : 'border border-[#FF5722] bg-white hover:border-[#FF5722]'}`}>
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                     <div>
                       <div className="flex items-center gap-3">
                         <h3 className="font-black text-2xl uppercase italic tracking-tighter text-gray-900">{m.isSOS ? `🚨 ${m.title || m.meetingTitle}` : m.title}</h3>
                         {m.status === 'active' && !m.isSOS && <span className="bg-[#FF5722] text-white text-[8px] font-black px-2 py-0.5 rounded animate-pulse uppercase tracking-widest">Live Now</span>}
                         {m.isSOS && <span className="bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-widest animate-pulse">SOS</span>}
                       </div>
                       <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{m.isSOS ? `🚨 EMERGENCY SESSION BY: ${m.coordinatorEmail || m.syncedBy || 'Unknown'}` : `Host: ${m.createdByName || m.coordinatorId}`}</p>
                     </div>
                     <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                       <button onClick={() => setAnalyticsViewMap({...analyticsViewMap, [m.id]: !isAnalytics})} className={`flex-1 lg:flex-none px-4 py-3 rounded-xl text-[9px] font-black border transition uppercase shadow-sm tracking-widest ${isAnalytics ? 'bg-gray-900 text-white' : 'text-[#FF5722] border-[#FF5722] bg-[#FFF9F5]'}`}>{isAnalytics ? 'Close Analytics' : 'Analytics'}</button>
                       <button onClick={() => downloadMeetingCSV(m.id, m.title)} className="flex-1 lg:flex-none px-4 py-3 rounded-xl text-[9px] font-black border border-gray-200 hover:bg-gray-50 shadow-sm uppercase tracking-widest">Export</button>
                       <button onClick={() => handleDeleteMeeting(m.id, m.isSOS)} className="px-4 py-3 rounded-xl text-[9px] bg-red-50 font-black text-red-500 hover:bg-red-500 hover:text-white transition shadow-sm uppercase tracking-widest">Archive</button>
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
                          const maxArr = [1,2,3,4].map(yr => (stats.years[yr.toString()]?.total || 0));
                          const max = Math.max(...maxArr, 1);
                          const height = (yData.total / max) * 100;
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
                          {m.type === 'verifiable' && <button onClick={() => setTab('missing')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'missing' ? 'text-white bg-red-500 shadow-md' : 'text-red-500 bg-red-50 hover:bg-red-100'}`}>Abandoned ({tabMissing.length})</button>}
                          <button onClick={() => setTab('manual')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'manual' ? 'text-gray-900 border-2 border-gray-900 bg-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>Manual ({tabManual.length})</button>
                          <button onClick={() => setTab('suspicious')} className={`flex-1 py-3 px-4 font-black text-[9px] uppercase tracking-widest transition-all whitespace-nowrap rounded-xl ${activeTab === 'suspicious' ? 'text-purple-700 bg-purple-200 shadow-md' : 'text-purple-500 bg-purple-50 hover:bg-purple-100'}`}>Suspicious ({suspicious.length})</button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {activeTab === 'verified' && tabVerified.map((at:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className="p-4 rounded-2xl border border-gray-200 bg-white flex justify-between items-center shadow-sm hover:border-[#FF5722] hover:shadow-md transition-all cursor-pointer">
                               <div><p className="font-bold text-sm text-gray-900 capitalize truncate w-40">{at.studentName}</p><p className="text-[10px] font-mono font-black text-[#FF5722] mt-0.5">{at.vtuNumber}</p></div>
                             </div>
                           );
                          })}

                          {activeTab === 'missing' && tabMissing.map((m:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(m.vtu));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({studentName: dbUser?.name || m.name || 'Unknown', vtuNumber: m.vtu, userData: dbUser || {}, dept: dbUser?.dept || 'N/A', year: dbUser?.year || 'N/A', gender: dbUser?.gender || 'N/A'})} className="p-4 rounded-2xl border border-red-200 bg-red-50 flex justify-between items-center shadow-sm hover:bg-red-100 transition-all cursor-pointer">
                               <div><p className="font-bold text-sm text-red-900 capitalize truncate w-40">{m.name}</p><p className="text-[10px] font-mono font-black text-red-500 mt-0.5">{m.vtu}</p></div>
                               <span className="text-[8px] px-2 py-1 bg-red-600 text-white font-black rounded uppercase tracking-widest shadow-sm">Missing</span>
                             </div>
                           );
                          })}

                          {activeTab === 'manual' && tabManual.map((at:any, i:number) => {
                           const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                           return (
                             <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className="p-4 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex justify-between items-center cursor-pointer hover:border-gray-500 transition-colors">
                               <div><p className="font-bold text-sm text-gray-900 capitalize truncate w-32">{at.studentName}</p><p className="text-[10px] font-mono font-black text-gray-500 mt-0.5">{at.vtuNumber}</p></div>
                               <div className="text-right"><p className="text-[8px] bg-gray-900 text-white px-2 py-1 rounded font-black uppercase tracking-widest mb-1 inline-block">Manual</p><p className="text-[8px] font-bold text-gray-400 italic block truncate w-20">By {at.enteredBy?.split('@')[0]}</p></div>
                             </div>
                           );
                          })}

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
                      {attendees.map((at:any, i:number) => {
                        const dbUser = (data.users || []).find((u:any)=>String(u.vtuNumber) === String(at.vtuNumber));
                        return (
                        <div key={i} onClick={() => setSelectedStudent({...at, studentName: dbUser?.name || at.studentName || 'Unknown', userData: dbUser || at.userData || {}, dept: dbUser?.dept || at.dept || 'N/A', year: dbUser?.year || at.year || 'N/A', gender: dbUser?.gender || at.gender || 'N/A'})} className="p-4 rounded-2xl border border-gray-100 bg-[#FFF9F5]/40 flex justify-between items-center hover:bg-white hover:border-[#FF5722] hover:shadow-md cursor-pointer transition-all group">
                           <div>
                             <p className="font-bold text-sm text-gray-900 truncate w-32 capitalize group-hover:text-[#FF5722] transition-colors">{at.studentName}</p>
                             <p className="text-[10px] font-mono font-black text-gray-400 group-hover:text-gray-900 transition-colors mt-0.5">{at.vtuNumber}</p>
                           </div>
                           {at.isOverride && <span className="block text-[7px] text-red-500 font-black uppercase tracking-[0.2em] mt-1">Manual</span>}
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
          {/* TAB 2: ROSTER & CRM */}
          {/* ========================================== */}
          {adminTab === 'roster' && (
            <div className="space-y-6 animate-in fade-in">
              {/* HORIZONTAL 4-COLUMN GRID */}
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
                
                {/* STUDENT SEARCH (Multi-Result) */}
                <div className="p-6 rounded-[2rem] border-2 border-[#FF5722] bg-[#FFF9F5] shadow-sm">
                  <h2 className="font-black text-[10px] tracking-[0.2em] uppercase mb-4 text-[#FF5722] flex items-center gap-2"><span className="text-lg">🔎</span> Student Tracker</h2>
                  <input type="text" placeholder="Search VTU or Name..." value={vtuLookup} onChange={(e) => setVtuLookup(e.target.value)} className="w-full p-4 mb-4 text-sm rounded-2xl outline-none font-black border border-[#FF5722]/30 bg-white shadow-inner focus:border-[#FF5722] transition-colors" />
                  
                  {/* Multi-result display */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {vtuLookup.length >= 2 && (data.users || []).filter((u: any) => 
                      String(u.vtuNumber).includes(vtuLookup) || 
                      (u.name && u.name.toLowerCase().includes(vtuLookup.toLowerCase()))
                    ).slice(0, 10).map((u: any) => (
                      <div key={u.vtuNumber} onClick={() => setSelectedStudent({studentName: u.name, vtuNumber: u.vtuNumber, dept: u.dept, year: u.year, gender: u.gender, userData: u})} className="p-4 rounded-xl border border-white bg-white cursor-pointer hover:shadow-lg hover:border-[#FF5722] transition-all">
                        <p className="font-black text-sm text-gray-900 truncate capitalize">{u.name}</p>
                        <p className="text-[9px] font-bold text-gray-500 mt-1">{u.vtuNumber} • {u.dept} • Yr {u.year}</p>
                      </div>
                    ))}
                    {vtuLookup.length >= 2 && (data.users || []).filter((u: any) => 
                      String(u.vtuNumber).includes(vtuLookup) || 
                      (u.name && u.name.toLowerCase().includes(vtuLookup.toLowerCase()))
                    ).length === 0 && (
                      <p className="text-center text-xs text-gray-400 py-6 font-black uppercase">No matches found</p>
                    )}
                  </div>
                </div>

                {/* CRM: CLUB MANAGEMENT */}
                <div className="p-6 rounded-[2rem] border-2 border-blue-500 bg-white shadow-sm">
                  <h2 className="font-black mb-4 uppercase text-[10px] tracking-[0.2em] text-blue-600 flex items-center gap-2"><span className="text-lg">👥</span> Club CRM</h2>
                  
                  <div className="flex gap-2 mb-4 bg-gray-50 p-1 rounded-xl">
                    <button onClick={() => setCrmTab('members')} className={`flex-1 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition ${crmTab === 'members' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500'}`}>Members</button>
                    <button onClick={() => setCrmTab('guests')} className={`flex-1 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition ${crmTab === 'guests' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500'}`}>Guests</button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <select value={crmFilters.year} onChange={e => setCrmFilters({...crmFilters, year: e.target.value})} className="p-2 bg-gray-50 border border-gray-100 rounded-lg font-bold text-[10px] outline-none">
                      <option value="All">All Yrs</option><option value="1">Yr 1</option><option value="2">Yr 2</option><option value="3">Yr 3</option><option value="4">Yr 4</option>
                    </select>
                    <select value={crmFilters.gender} onChange={e => setCrmFilters({...crmFilters, gender: e.target.value})} className="p-2 bg-gray-50 border border-gray-100 rounded-lg font-bold text-[10px] outline-none">
                      <option value="All">All</option><option value="Male">M</option><option value="Female">F</option>
                    </select>
                    <input type="number" min="0" placeholder="Min" value={crmFilters.minEvents} onChange={e => setCrmFilters({...crmFilters, minEvents: parseInt(e.target.value) || 0})} className="p-2 bg-gray-50 border border-gray-100 rounded-lg font-bold text-[10px] outline-none w-full" />
                  </div>

                  <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {crmUsers.slice(0, 8).map((u: any) => (
                      <div key={u.vtuNumber} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:border-blue-300 transition group">
                        <div className="truncate flex-1">
                          <p className="font-bold text-xs text-gray-900 capitalize truncate">{u.name || 'Unknown'}</p>
                          <p className="text-[9px] text-gray-500">{u.vtuNumber}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">{u.eventsAttended}</span>
                          {crmTab === 'members' ? (
                            <button onClick={() => executeCrmAction('/admin/crm/demote', { vtu: u.vtuNumber }, "Demoted")} className="text-[8px] text-red-500 font-black opacity-0 group-hover:opacity-100">↓</button>
                          ) : (
                            <button onClick={() => executeCrmAction('/admin/crm/promote', { vtu: u.vtuNumber }, "Promoted")} className="text-[8px] text-green-500 font-black opacity-0 group-hover:opacity-100">↑</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {crmUsers.length === 0 && <p className="text-center text-[10px] font-black text-gray-400 uppercase py-6">No users</p>}
                  </div>
                </div>

                {/* ROSTER MANAGEMENT */}
                <div className="p-6 rounded-[2rem] border-2 border-gray-100 bg-white shadow-sm">
                  <h2 className="font-black mb-4 uppercase text-[10px] tracking-[0.2em] text-gray-400 flex items-center gap-2"><span className="text-lg">🗄️</span> Master Roster</h2>
                  
                  <button onClick={() => setShowExportModal(true)} className="w-full mb-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-black py-3 rounded-xl uppercase tracking-widest text-[9px] shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                    <span>📊</span> Dean's Report
                  </button>
                  
                  <div className="relative w-full border-2 border-dashed border-blue-200 bg-blue-50 rounded-xl p-4 text-center hover:bg-blue-100 transition cursor-pointer mb-4">
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">{isUploading ? "Processing..." : "+ Upload CSV"}</p>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  
                  <div className="flex gap-2">
                    <select value={selectedPurgeYear} onChange={(e) => setSelectedPurgeYear(e.target.value)} className="px-3 py-2 text-[10px] rounded-lg font-black border border-gray-200 bg-gray-50 outline-none">
                      <option value="1">Yr 1</option><option value="2">Yr 2</option><option value="3">Yr 3</option><option value="4">Yr 4</option>
                    </select>
                    <button onClick={handleYearPurge} className="flex-1 bg-white border border-red-100 text-red-500 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors">Purge</button>
                  </div>
                </div>

                {/* SOS RECOVERY */}
                <div className="p-6 rounded-[2rem] border-2 border-red-200 bg-red-50 shadow-sm">
                  <h2 className="font-black mb-4 uppercase text-[10px] tracking-[0.2em] text-red-500 flex items-center gap-2"><span className="text-lg">🚨</span> Emergency</h2>
                  
                  <div className="relative w-full border-2 border-dashed border-red-300 bg-white rounded-xl p-6 text-center hover:bg-red-50 transition cursor-pointer">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{isRestoringBackup ? 'Restoring...' : '📤 SOS Restore'}</p>
                    <p className="text-[8px] font-bold text-red-400 mt-2 uppercase">Upload .txt backup</p>
                    <input type="file" ref={sosFileInputRef} onChange={handleSOSFileUpload} accept=".txt" className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                </div>

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

                <input type="text" placeholder="Venue (Optional)" value={scheduleForm.venue} onChange={e => setScheduleForm({...scheduleForm, venue: e.target.value})} className="w-full p-4 rounded-xl mb-6 outline-none font-bold text-sm bg-white shadow-sm border border-orange-100" />

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