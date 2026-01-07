
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Search, CheckCircle2, Clock, RefreshCw, AlertCircle, LogOut, Lock, 
  UserCircle, XCircle, Eye, EyeOff, Users, Scan, Settings, Copy, Check, 
  CloudUpload, CloudCheck, Camera, UserPlus, Edit3, QrCode, Loader2,
  Trash2, RotateCcw, UserX, FileText, Calendar, CheckSquare, Printer, Download,
  UserCheck, ShieldAlert, ShieldCheck, EyeClosed, UploadCloud, Info, TableProperties,
  Database
} from 'lucide-react';
import { 
  Assignment, Station, GroupedAssignment, User, UserSession, 
  LeaveRequest, DeactivationRequest, ReactivationRequest, AssignmentActionRequest
} from './types';
import { STATIONS } from './data';
import { getLogisticsInsights } from './geminiService';
import { 
  fetchSpreadsheetData, 
  updateSpreadsheetTask, 
  fetchStaffData, 
  fetchCourierLoginData, 
  updateUserProfile,
  uploadImportedData
} from './spreadsheetService';
import { QRCodeSVG } from 'qrcode.react';
import Papa from 'papaparse';

const SESSION_KEY = 'spx_v4_session';
const LEAVE_KEY = 'spx_leave_requests';
const DEACTIVATE_KEY = 'spx_deactivate_requests';
const REACTIVATE_KEY = 'spx_reactivate_requests';
const AT_ACTION_KEY = 'spx_at_action_requests';

const extractIdAndName = (fullName: string) => {
  if (!fullName) return { id: '', name: 'N/A' };
  const idMatch = fullName.match(/\[(.*?)\]/);
  const id = idMatch ? idMatch[1].trim() : '';
  let rawName = fullName.replace(/\[.*?\]/, '').trim();
  const placeholders = ['courier partner', 'tanpa nama', 'null', 'undefined', '-'];
  if (placeholders.includes(rawName.toLowerCase()) || !rawName) {
    rawName = '';
  }
  return { id, name: rawName };
};

const getAvatarColor = (name: string) => {
  const colors = ['bg-indigo-600', 'bg-rose-600', 'bg-amber-600', 'bg-emerald-600', 'bg-blue-600'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string) => {
  if (!name) return "?";
  const parts = name.trim().split(' ');
  if (parts.length > 1) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return name.charAt(0).toUpperCase();
};

const App: React.FC = () => {
  // --- States ---
  const [session, setSession] = useState<UserSession | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupedAssignment | null>(null);
  const [insights, setInsights] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'directory' | 'leave' | 'approvals' | 'history'>('profile');
  
  // --- Security ---
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  // --- AT Selection & Requests ---
  const [selectedAtIds, setSelectedAtIds] = useState<string[]>([]);
  const [atActionRequests, setAtActionRequests] = useState<AssignmentActionRequest[]>([]);
  const [showAtActionModal, setShowAtActionModal] = useState<{ type: 'Delete' | 'Restore', ids: string[] } | null>(null);
  const [atActionReason, setAtActionReason] = useState("");

  // --- Import States ---
  const [importPreview, setImportPreview] = useState<Assignment[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- Advanced Features States ---
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deactivateRequests, setDeactivateRequests] = useState<DeactivationRequest[]>([]);
  const [reactivateRequests, setReactivateRequests] = useState<ReactivationRequest[]>([]);
  
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveData, setLeaveData] = useState({ type: 'Tahunan', duration: '', reason: '', photoUrl: '' });
  
  const [showDeactivateModal, setShowDeactivateModal] = useState<{ userId: string, name: string } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editWA, setEditWA] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editDOB, setEditDOB] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const leavePhotoRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // --- Sync Edit Fields ---
  useEffect(() => {
    if (showSettings && settingsTab === 'profile' && !editUserTarget && session) {
      setEditFullName(session.user.name);
      setEditNickname(session.user.nickname || "");
      setEditWA(session.user.whatsapp || "");
      setEditPhoto(session.user.photoUrl || "");
      setEditDOB(session.user.dateOfBirth || "");
      setEditPosition(session.user.position || "");
    }
  }, [showSettings, settingsTab, editUserTarget, session]);

  // --- Roles & Permissions ---
  const userRole = session?.user.role || "courier";
  const userPos = session?.user.position.toUpperCase() || "";
  const isShiftLead = userPos.includes('SHIFT LEAD');
  const isHubLeadOrPIC = userPos.includes('HUB LEAD') || userPos.includes('PIC HUB');
  const isAdmin = userRole === 'admin';
  const isAdminTracer = userPos.includes('ADMIN TRACER');
  
  const canManageUsers = isHubLeadOrPIC || isAdmin;
  const canManageRoles = isHubLeadOrPIC || isAdmin;
  const canDeleteAT = isShiftLead || isHubLeadOrPIC || isAdmin || isAdminTracer;
  const isAuthorized = isShiftLead || isHubLeadOrPIC || isAdmin;
  const canSeeDirectory = userRole !== 'courier';

  // --- Effects ---
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || (e.ctrlKey && e.key === 'p')) {
        setIsPrivacyMode(true);
        alert('Keamanan SPX: Tindakan capture data dilarang.');
        setTimeout(() => setIsPrivacyMode(false), 2000);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleVisibilityChange = () => {
      setIsPrivacyMode(document.visibilityState === 'hidden' || !document.hasFocus());
    };
    
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', () => setIsPrivacyMode(true));
    window.addEventListener('focus', () => setIsPrivacyMode(false));

    const savedLeave = localStorage.getItem(LEAVE_KEY);
    const savedDeactivate = localStorage.getItem(DEACTIVATE_KEY);
    const savedReactivate = localStorage.getItem(REACTIVATE_KEY);
    const savedAtActions = localStorage.getItem(AT_ACTION_KEY);
    
    if (savedLeave) setLeaveRequests(JSON.parse(savedLeave));
    if (savedDeactivate) setDeactivateRequests(JSON.parse(savedDeactivate));
    if (savedReactivate) setReactivateRequests(JSON.parse(savedReactivate));
    if (savedAtActions) setAtActionRequests(JSON.parse(savedAtActions));

    initializeAppData();

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', () => setIsPrivacyMode(true));
      window.removeEventListener('focus', () => setIsPrivacyMode(false));
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LEAVE_KEY, JSON.stringify(leaveRequests));
    localStorage.setItem(DEACTIVATE_KEY, JSON.stringify(deactivateRequests));
    localStorage.setItem(REACTIVATE_KEY, JSON.stringify(reactivateRequests));
    localStorage.setItem(AT_ACTION_KEY, JSON.stringify(atActionRequests));
  }, [leaveRequests, deactivateRequests, reactivateRequests, atActionRequests]);

  const initializeAppData = async () => {
    setLoading(true);
    try {
      const [staffList, courierList] = await Promise.all([fetchStaffData(), fetchCourierLoginData()]);
      const users = [...staffList, ...courierList].map(u => ({ ...u, status: u.status || 'Active' }));
      setAllUsers(users);

      const savedSessionStr = localStorage.getItem(SESSION_KEY);
      if (savedSessionStr) {
        try { 
          const parsed = JSON.parse(savedSessionStr);
          const verifiedUser = users.find(u => u.id === parsed.user.id);
          if (verifiedUser) setSession({ user: verifiedUser });
        } catch { localStorage.removeItem(SESSION_KEY); }
      }
      await fetchData(true);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchData = async (isInitial = false) => {
    if (refreshing && !isInitial) return;
    try {
      if (!isInitial) setRefreshing(true);
      const allData: Assignment[] = [];
      for (const s of STATIONS) {
        const data = await fetchSpreadsheetData(s);
        allData.push(...data);
      }
      const finalData = allData.map(a => {
        const pendingDelete = atActionRequests.find(req => req.status === 'Approved' && req.assignmentIds.includes(a.id));
        if (pendingDelete) return { ...a, status: 'Deleted' as const };
        return a;
      });
      setAssignments(finalData);
      
      if (allData.length > 0 && !isInitial) { 
        getLogisticsInsights(allData).then(txt => setInsights(txt));
      }
    } catch (e) { console.warn(e); } finally { setRefreshing(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const user = allUsers.find(u => u.id === username.trim());
      if (user && (password.trim() === user.password)) {
        if (user.status === 'Inactive') {
          alert("Akun Anda dinonaktifkan. Silakan hubungi Hub Lead.");
          return;
        }
        const s: UserSession = { user };
        setSession(s);
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        return;
      }
      alert("ID atau Password salah.");
    } catch { alert("Gagal terhubung."); } finally { setIsLoggingIn(false); }
  };

  const handleOpenEditUser = (u: User) => {
    setEditUserTarget(u);
    setEditFullName(u.name);
    setEditNickname(u.nickname || '');
    setEditWA(u.whatsapp || '');
    setEditPhoto(u.photoUrl || '');
    setEditDOB(u.dateOfBirth || '');
    setEditPosition(u.position || '');
    setSettingsTab('profile');
  };

  const handleUpdateProfile = async () => {
    const targetId = editUserTarget?.id || session?.user.id;
    if (!targetId) return;
    setIsSaving(true);
    try {
      const payload: any = { 
        nickname: editNickname, 
        whatsapp: editWA, 
        photoUrl: editPhoto,
        name: editFullName,
      };
      if (targetId === session?.user.id) {
        payload.dateOfBirth = editDOB;
      }
      if (canManageRoles) {
        payload.position = editPosition;
      }
      const success = await updateUserProfile(targetId, payload);
      if (success) {
        setAllUsers(prev => prev.map(u => u.id === targetId ? { ...u, ...payload } : u));
        if (targetId === session?.user.id) {
          const updatedUser = { ...session.user, ...payload };
          setSession({ user: updatedUser });
          localStorage.setItem(SESSION_KEY, JSON.stringify({ user: updatedUser }));
        }
        setEditUserTarget(null);
        alert("Profil diperbarui!");
      }
    } catch { alert("Gagal update."); } finally { setIsSaving(false); }
  };

  const requestAtAction = () => {
    if (!showAtActionModal || !session || !atActionReason) return;
    const targetAssignments = assignments.filter(a => showAtActionModal.ids.includes(a.id));
    const newReq: AssignmentActionRequest = {
      id: Math.random().toString(36).substr(2, 9),
      assignmentIds: showAtActionModal.ids,
      taskIds: targetAssignments.map(a => a.taskId),
      requesterId: session.user.id,
      requesterName: session.user.name,
      reason: atActionReason,
      type: showAtActionModal.type,
      status: 'Pending',
      createdAt: new Date().toLocaleString()
    };
    setAtActionRequests([newReq, ...atActionRequests]);
    setShowAtActionModal(null);
    setAtActionReason("");
    setSelectedAtIds([]);
    alert(`Pengajuan ${showAtActionModal.type === 'Delete' ? 'penghapusan' : 'pemulihan'} dikirim untuk approval Hub Lead.`);
  };

  const approveAtAction = (req: AssignmentActionRequest) => {
    if (!session) return;
    setAssignments(prev => prev.map(a => {
      if (req.assignmentIds.includes(a.id)) {
        return { 
          ...a, 
          status: req.type === 'Delete' ? 'Deleted' : 'Pending',
          deletionReason: req.type === 'Delete' ? req.reason : undefined
        };
      }
      return a;
    }));
    setAtActionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session.user.name } : r));
    alert(`${req.type === 'Delete' ? 'Penghapusan' : 'Pemulihan'} disetujui.`);
  };

  const requestDeactivation = () => {
    if (!showDeactivateModal || !session || !deactivateReason) return;
    const newReq: DeactivationRequest = {
      id: Math.random().toString(36).substr(2, 9),
      targetUserId: showDeactivateModal.userId,
      targetUserName: showDeactivateModal.name,
      requesterId: session.user.id,
      requesterName: session.user.name,
      reason: deactivateReason,
      status: 'Pending'
    };
    setDeactivateRequests([newReq, ...deactivateRequests]);
    setShowDeactivateModal(null);
    setDeactivateReason("");
    alert("Pengajuan penonaktifan dikirim.");
  };

  const approveDeactivation = (req: DeactivationRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, status: 'Inactive' } : u));
    setDeactivateRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
  };

  const requestReactivation = (userId: string, name: string) => {
    if (!session) return;
    const newReq: ReactivationRequest = {
      id: Math.random().toString(36).substr(2, 9),
      targetUserId: userId,
      targetUserName: name,
      requesterId: session.user.id,
      requesterName: session.user.name,
      status: 'Pending'
    };
    setReactivateRequests([newReq, ...reactivateRequests]);
    alert("Pengajuan re-aktivasi dikirim.");
  };

  const approveReactivation = (req: ReactivationRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, status: 'Active' } : u));
    setReactivateRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
  };

  const downloadTemplate = () => {
    // Hub specific name implementation
    const hubName = selectedStation === 'All' ? 'HUB_GENERAL' : selectedStation;
    const templateData = [
      ["Nama Kurir", "Jumlah Paket", "Status", "Task ID", "Update Terakhir"],
      [`[FMS123] Contoh Nama ${hubName}`, "45", "Pending", `SPX-${hubName.slice(0,3).toUpperCase()}-001`, "08:00"]
    ];
    const csvContent = "data:text/csv;charset=utf-8," + templateData.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SPX_Template_Assignment_${hubName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Assignment[] = results.data.map((row: any, i) => ({
          id: `imp-${Date.now()}-${i}`,
          courierName: row['Nama Kurir'] || 'Imported User',
          packageCount: parseInt(row['Jumlah Paket']) || 0,
          station: selectedStation === 'All' ? 'Tompobulu' : selectedStation,
          taskId: row['Task ID'] || `TASK-IMP-${i}`,
          status: (row['Status'] || 'Pending') as any,
          lastUpdated: row['Update Terakhir'] || new Date().toLocaleTimeString()
        }));
        setImportPreview(imported);
        // Reset input so the same file can be uploaded again if needed
        e.target.value = '';
      }
    });
  };

  const confirmUpload = async () => {
    if (!importPreview) return;
    setIsUploading(true);
    try {
      const stationToUpload = selectedStation === 'All' ? 'Tompobulu' : selectedStation;
      const success = await uploadImportedData(stationToUpload, importPreview);
      if (success) {
        setAssignments([...importPreview, ...assignments]);
        setImportPreview(null);
        alert("Data berhasil diunggah ke database spreadsheet!");
      } else {
        alert("Gagal mengunggah data ke server.");
      }
    } catch {
      alert("Terjadi kesalahan sistem saat mengunggah.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyAT = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCompleteTask = async (id: string, taskId: string, station: Station) => {
    setIsSaving(true);
    try {
      const success = await updateSpreadsheetTask(taskId, 'Completed', station);
      if (success) {
        setAssignments(prev => prev.map(a => a.id === id ? { 
          ...a, 
          status: 'Completed', 
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) 
        } : a));
        alert("Tugas diselesaikan!");
      }
    } catch { alert("Error update."); } finally { setIsSaving(false); }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return allUsers;
    const q = searchQuery.toLowerCase();
    return allUsers.filter(u => 
      u.name.toLowerCase().includes(q) || 
      u.id.toLowerCase().includes(q) || 
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q)
    );
  }, [allUsers, searchQuery]);

  const groupedCouriers = useMemo(() => {
    const groups: Record<string, GroupedAssignment & { id: string }> = {};
    let baseData = assignments.filter(a => a.status !== 'Deleted');
    if (session?.user.role === 'courier') {
      baseData = baseData.filter(a => extractIdAndName(a.courierName).id === session.user.id);
    }
    baseData.forEach(a => {
      const { id, name } = extractIdAndName(a.courierName);
      const userProfile = allUsers.find(u => u.id === id);
      if (userProfile?.status === 'Inactive') return;
      if (selectedStation !== 'All' && a.station !== selectedStation) return;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const resolvedName = (userProfile?.nickname || userProfile?.name || name || '').toLowerCase();
        if (!resolvedName.includes(q) && !id.toLowerCase().includes(q) && !a.taskId.toLowerCase().includes(q)) return;
      }
      if (!groups[id]) {
        groups[id] = {
          id,
          courierName: userProfile ? (userProfile.nickname || userProfile.name) : (name || id || 'Kurir'),
          station: a.station,
          totalPackages: 0,
          tasks: [],
          status: 'Completed',
          lastUpdated: a.lastUpdated
        };
      }
      groups[id].tasks.push(a);
      groups[id].totalPackages += a.packageCount;
      if (a.status !== 'Completed') groups[id].status = 'Ongoing';
    });
    return Object.values(groups);
  }, [assignments, session, selectedStation, searchQuery, allUsers]);

  const stats = useMemo(() => {
    const visible = assignments.filter(a => a.status !== 'Deleted');
    return {
      pkg: visible.reduce((s, a) => s + a.packageCount, 0),
      team: allUsers.filter(u => u.status !== 'Inactive').length,
      done: visible.filter(a => a.status === 'Completed').length,
      todo: visible.filter(a => a.status !== 'Completed').length
    };
  }, [assignments, allUsers]);

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <Loader2 className="w-10 h-10 text-[#EE4D2D] animate-spin" />
      <p className="mt-4 font-black text-[#EE4D2D] text-xs uppercase italic tracking-tighter">SPX Secure Syncing...</p>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-[40px] shadow-2xl p-10 border border-gray-100 animate-fade-in">
        <div className="flex justify-center mb-10">
           <div className="bg-[#EE4D2D] px-6 py-3 rounded-2xl shadow-xl transform -rotate-1">
             <span className="text-white font-black text-xl italic tracking-tighter">SPX <span className="font-light">Express</span></span>
           </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 focus-within:border-orange-500 transition-all">
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">FMS ID / User ID</p>
            <div className="flex items-center gap-3">
              <UserCircle size={18} className="text-gray-400" />
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="000000" className="bg-transparent font-bold text-gray-900 outline-none w-full text-sm" required />
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 focus-within:border-orange-500 transition-all">
            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Password</p>
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-gray-400" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="bg-transparent font-bold text-gray-900 outline-none w-full text-sm" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          <button type="submit" disabled={isLoggingIn} className="w-full bg-[#EE4D2D] text-white py-5 rounded-2xl font-black text-xs shadow-xl active:scale-95 transition-all uppercase tracking-widest mt-6">
            {isLoggingIn ? "MENGOTENTIKASI..." : "LOGIN DASHBOARD"}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#fcfcfc] pb-24 font-['Plus_Jakarta_Sans'] transition-all duration-700 ${isPrivacyMode ? 'blur-3xl' : ''}`}>
      {isPrivacyMode && (
        <div className="fixed inset-0 z-[1000] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-12">
           <div className="p-12 rounded-[50px] bg-white/5 border border-white/10 shadow-2xl animate-pulse">
              <EyeClosed size={80} className="text-[#EE4D2D] mb-8 mx-auto" />
              <h2 className="text-white text-2xl font-black uppercase italic tracking-tighter">Security Shield Active</h2>
              <p className="text-gray-400 text-sm mt-4 uppercase font-bold tracking-[0.2em] max-w-xs">Capture data operasional dilarang. Hubungi Hub Lead untuk akses fisik.</p>
           </div>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#EE4D2D] px-3 py-3 md:px-4 md:py-4 rounded-b-[24px] md:rounded-b-[32px] shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="bg-black/90 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl border border-white/10">
            <span className="text-white font-black text-[10px] md:text-xs italic tracking-tighter uppercase">SPX Secure Hub</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <button onClick={() => { setEditUserTarget(null); setShowSettings(true); setSettingsTab('profile'); }} className="flex items-center gap-1.5 bg-white/10 p-1 md:p-1.5 rounded-lg md:rounded-xl border border-white/5 transition-all hover:bg-white/20">
              <div className={`w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg ${getAvatarColor(session.user.name)} flex items-center justify-center border border-white/30 overflow-hidden shadow-sm`}>
                {session.user.photoUrl ? <img src={session.user.photoUrl} className="w-full h-full object-cover" /> : <span className="text-[8px] md:text-[9px] font-black text-white">{getInitials(session.user.name)}</span>}
              </div>
              <span className="text-[9px] md:text-[10px] font-black text-white mr-1 hidden sm:block truncate max-w-[80px]">{session.user.nickname || session.user.name.split(' ')[0]}</span>
            </button>
            <button onClick={() => fetchData()} className={`p-1.5 md:p-2 bg-white/10 rounded-lg md:rounded-xl text-white ${refreshing ? 'animate-spin' : ''}`}><RefreshCw size={16} md:size={18} /></button>
            <button onClick={() => { localStorage.removeItem(SESSION_KEY); setSession(null); }} className="p-1.5 md:p-2 bg-black/30 rounded-lg md:rounded-xl text-white hover:bg-black/50"><LogOut size={16} md:size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Paket', val: stats.pkg, icon: Package, col: 'text-orange-600' },
            { label: 'Tim Aktif', val: stats.team, icon: Users, col: 'text-indigo-600' },
            { label: 'Berhasil', val: stats.done, icon: CheckCircle2, col: 'text-emerald-600' },
            { label: 'Antrean', val: stats.todo, icon: Clock, col: 'text-slate-700' }
          ].map((s, i) => (
            <div key={i} className="bg-white p-4 rounded-[24px] shadow-sm border border-gray-100 flex items-center gap-3">
              <div className={`p-2 rounded-xl bg-gray-50 ${s.col}`}><s.icon size={20} /></div>
              <div>
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-lg font-black text-gray-900">{s.val}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex gap-2">
            <button onClick={() => { setShowSettings(true); setSettingsTab('leave'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-orange-50 text-[#EE4D2D] font-black text-[10px] uppercase border border-orange-100">
              <Calendar size={16} /> Cuti
            </button>
            {(isShiftLead || isHubLeadOrPIC) && (
              <button onClick={() => { setShowSettings(true); setSettingsTab('approvals'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#EE4D2D] text-white font-black text-[10px] uppercase shadow-md relative">
                <CheckSquare size={16} /> Approval
                {(leaveRequests.filter(r => r.status === 'Pending').length > 0) && <span className="absolute -top-1 -right-1 w-4 h-4 bg-black text-white text-[8px] rounded-full border border-white flex items-center justify-center">!</span>}
              </button>
            )}
            {isAuthorized && (
               <button onClick={() => { setShowSettings(true); setSettingsTab('history'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase">
                 <Trash2 size={16} /> Deleted AT
               </button>
            )}
          </div>
          
          <div className="flex gap-2">
            {canManageUsers && (
              <div className="flex gap-2">
                <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-50 text-indigo-700 font-black text-[10px] uppercase border border-indigo-100">
                  <UploadCloud size={16} /> Import AT
                </button>
                <input type="file" ref={importRef} onChange={handleImport} className="hidden" accept=".csv" />
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white text-gray-400 font-black text-[10px] uppercase border border-gray-100">
                  <Download size={16} /> Template
                </button>
              </div>
            )}
            {isAuthorized && (
              <button onClick={() => { setShowSettings(true); setSettingsTab('directory'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-black text-white font-black text-[10px] uppercase">
                <UserPlus size={16} /> Kelola Tim
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Cari kurir, FMS ID, atau Task..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm focus:border-[#EE4D2D] outline-none font-bold text-gray-900 text-sm transition-all" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
             <button onClick={() => setSelectedStation('All')} className={`px-6 py-4 rounded-2xl font-black text-[9px] uppercase border tracking-widest transition-all ${selectedStation === 'All' ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-100'}`}>Semua</button>
             {STATIONS.map(s => (
               <button key={s} onClick={() => setSelectedStation(s)} className={`px-6 py-4 rounded-2xl font-black text-[9px] uppercase border tracking-widest transition-all ${selectedStation === s ? 'bg-[#EE4D2D] text-white border-[#EE4D2D]' : 'bg-white text-gray-500 border-gray-100'}`}>{s}</button>
             ))}
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
          {groupedCouriers.map((group) => (
            <div key={group.id} className={`bg-white p-4 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col group animate-fade-in relative ${selectedAtIds.some(id => group.tasks.map(t => t.id).includes(id)) ? 'ring-2 ring-[#EE4D2D]' : ''}`}>
               <div className="flex justify-between items-start mb-4">
                 <div className="bg-gray-100 text-gray-900 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest">{group.station}</div>
                 <div className={`w-2 h-2 rounded-full ${group.status === 'Completed' ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>
               </div>
               <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 rounded-2xl ${getAvatarColor(group.courierName)} flex items-center justify-center text-white font-black text-xs shadow-inner shrink-0`}>
                    {getInitials(group.courierName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[12px] font-black text-gray-900 uppercase leading-tight truncate">{group.courierName}</h4>
                    <p className="text-[9px] font-bold text-gray-400">ID: {group.id}</p>
                  </div>
               </div>
               <button onClick={() => setSelectedGroup(group as any)} className="w-full py-3.5 bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-[#EE4D2D] transition-all flex items-center justify-center gap-2 mt-auto">
                 <QrCode size={14} /> Verifikasi
               </button>
            </div>
          ))}
        </div>
      </main>

      {/* Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 p-6 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <TableProperties size={28} />
                  <div>
                    <h2 className="text-xl font-black uppercase italic tracking-tighter">Pratinjau Impor Data</h2>
                    <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest">Hub: {selectedStation === 'All' ? 'Tompobulu (Default)' : selectedStation}</p>
                  </div>
               </div>
               <button onClick={() => setImportPreview(null)} className="p-3 bg-white/20 rounded-2xl hover:bg-white/40"><XCircle size={28} /></button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
               <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Kurir</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Task ID</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Paket</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900 text-sm">{item.courierName}</td>
                          <td className="px-6 py-4 font-mono text-xs text-indigo-600">{item.taskId}</td>
                          <td className="px-6 py-4 font-black text-gray-900">{item.packageCount}</td>
                          <td className="px-6 py-4">
                             <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-orange-50 text-orange-600 border border-orange-100">
                               {item.status}
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>

            <div className="p-8 bg-white border-t border-gray-100 flex gap-4 shrink-0">
               <button onClick={() => setImportPreview(null)} className="flex-1 py-5 bg-gray-100 text-gray-500 rounded-[28px] font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all">BATAL</button>
               <button onClick={confirmUpload} disabled={isUploading} className="flex-2 py-5 bg-indigo-600 text-white rounded-[28px] font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                 {isUploading ? <Loader2 className="animate-spin" size={24} /> : <Database size={24} />} KONFIRMASI & UPLOAD KE DATABASE
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-[#EE4D2D] p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase opacity-70 mb-1">{selectedGroup.station}</p>
                <h2 className="text-xl font-black uppercase italic tracking-tighter truncate max-w-[280px]">{selectedGroup.courierName}</h2>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="p-3 bg-white/20 rounded-2xl hover:bg-white/40"><XCircle size={28} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50 no-scrollbar">
              {selectedGroup.tasks.map(t => (
                <div key={t.taskId} className="bg-white rounded-[32px] p-6 border border-gray-100 flex flex-col items-center gap-6 shadow-md relative">
                  <div className="w-full flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Token Penugasan</p>
                      <h4 className="text-lg font-black text-gray-900 font-mono tracking-tighter">{t.taskId}</h4>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => handleCopyAT(t.taskId)} className={`p-3 rounded-xl border transition-all ${copiedId === t.taskId ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-100'}`}>
                         {copiedId === t.taskId ? <Check size={20} /> : <Copy size={20} />}
                       </button>
                    </div>
                  </div>
                  <div className="p-8 border-[12px] border-black rounded-[48px] bg-white shadow-2xl">
                    <QRCodeSVG value={t.taskId} size={240} level="H" includeMargin={true} />
                  </div>
                  <button onClick={() => handleCompleteTask(t.id, t.taskId, t.station)} disabled={isSaving} className="w-full bg-[#EE4D2D] text-white py-5 rounded-[28px] font-black text-sm uppercase shadow-xl flex items-center justify-center gap-3">
                    {isSaving ? <Loader2 className="animate-spin" size={24} /> : <Scan size={24} />} SELESAIKAN TUGAS
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-2xl animate-fade-in">
          <div className="bg-white rounded-[44px] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-black p-8 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <Settings size={28} className="text-[#EE4D2D]" />
                <h2 className="text-xl font-black uppercase italic">Dashboard Hub</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-3 bg-white/10 rounded-xl hover:bg-white/20"><XCircle size={32} /></button>
            </div>
            
            <nav className="flex border-b border-gray-100 bg-white sticky top-0 z-20 overflow-x-auto no-scrollbar shrink-0">
              <button onClick={() => { setEditUserTarget(null); setSettingsTab('profile'); }} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'profile' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Profil</button>
              {canSeeDirectory && (
                <button onClick={() => setSettingsTab('directory')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'directory' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Direktori</button>
              )}
              <button onClick={() => setSettingsTab('leave')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'leave' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Cuti</button>
              {(isShiftLead || isHubLeadOrPIC) && (
                <button onClick={() => setSettingsTab('approvals')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'approvals' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Approval</button>
              )}
            </nav>

            <div className="flex-1 overflow-y-auto p-10 bg-gray-50/50 no-scrollbar">
              {settingsTab === 'profile' && (
                <div className="max-w-md mx-auto space-y-8 animate-fade-in">
                  <div className="flex flex-col items-center">
                    <div className="relative group">
                      <div className="w-32 h-32 rounded-[44px] bg-white border-4 border-gray-200 shadow-2xl overflow-hidden flex items-center justify-center">
                        {(editPhoto || (editUserTarget ? editUserTarget.photoUrl : session.user.photoUrl)) ? <img src={editPhoto || (editUserTarget ? editUserTarget.photoUrl : session.user.photoUrl)} className="w-full h-full object-cover" /> : <div className="text-gray-200 font-black text-6xl">{getInitials(editFullName || (editUserTarget ? editUserTarget.name : session.user.name))}</div>}
                      </div>
                      <button onClick={() => photoRef.current?.click()} className="absolute -bottom-2 -right-2 bg-black text-white p-3.5 rounded-2xl shadow-xl border-4 border-white transition-all"><Camera size={20} /></button>
                      <input type="file" ref={photoRef} onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setEditPhoto(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} accept="image/*" className="hidden" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white p-5 rounded-[32px] border border-gray-200 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Nama Lengkap (FMS)</p>
                      <input type="text" value={editFullName} onChange={e => setEditFullName(e.target.value)} className="w-full font-black text-black outline-none text-base bg-transparent" />
                    </div>
                    <div className="bg-white p-5 rounded-[32px] border border-gray-200 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1 flex items-center justify-between">
                        Tanggal Lahir 
                        {((editUserTarget ? editUserTarget.id : session.user.id) !== session.user.id) && <span className="text-red-500 text-[8px] bg-red-50 px-1 rounded">PRIVASI MEMBER</span>}
                      </p>
                      <input type="date" value={editDOB} onChange={e => setEditDOB(e.target.value)} disabled={(editUserTarget ? editUserTarget.id : session.user.id) !== session.user.id} className="w-full font-black text-black outline-none text-sm bg-transparent disabled:opacity-30" />
                    </div>
                    {canManageRoles && (
                      <div className="bg-indigo-50 p-5 rounded-[32px] border border-indigo-100 shadow-sm">
                        <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">Position / Role Management</p>
                        <input type="text" value={editPosition} onChange={e => setEditPosition(e.target.value)} className="w-full font-black text-indigo-900 outline-none text-sm bg-transparent" placeholder="Admin Tracer, Hub Lead, dll..." />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-5 rounded-[32px] border border-gray-200 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Nickname</p>
                        <input type="text" value={editNickname} onChange={e => setEditNickname(e.target.value)} className="w-full font-black text-black outline-none text-sm bg-transparent" />
                      </div>
                      <div className="bg-white p-5 rounded-[32px] border border-gray-200 shadow-sm">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">WhatsApp</p>
                        <input type="tel" value={editWA} onChange={e => setEditWA(e.target.value)} className="w-full font-black text-black outline-none text-sm bg-transparent" />
                      </div>
                    </div>
                  </div>
                  <button onClick={handleUpdateProfile} disabled={isSaving} className="w-full bg-[#EE4D2D] text-white py-6 rounded-[32px] font-black text-sm uppercase shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                    {isSaving ? <Loader2 className="animate-spin" size={24} /> : <CloudUpload size={24} />} SIMPAN PROFIL
                  </button>
                </div>
              )}
            </div>
            <div className="p-8 bg-white border-t border-gray-100 flex justify-center shrink-0">
               <button onClick={() => setShowSettings(false)} className="w-full max-w-sm py-5 bg-gray-100 text-gray-900 rounded-[28px] font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all">TUTUP</button>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 mt-16 pb-16 text-center opacity-30 select-none">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.5em] mb-2">Shopee Xpress Hub Secure Management</p>
        <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest leading-none">ENTERPRISE EDITION v4.3.0 • SECURE MODE ON</p>
      </footer>
    </div>
  );
};

export default App;
