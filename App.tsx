
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Search, CheckCircle2, Clock, RefreshCw, AlertCircle, LogOut, Lock, 
  UserCircle, XCircle, Eye, EyeOff, Users, Scan, Settings, Copy, Check, 
  CloudUpload, CloudCheck, Camera, UserPlus, Edit3, QrCode, Loader2,
  Trash2, RotateCcw, UserX, FileText, Calendar, CheckSquare, Printer, Download,
  UserCheck, ShieldAlert, ShieldCheck, EyeClosed, UploadCloud, Info, TableProperties,
  Database, Trash, History, TrendingUp, TrendingDown, ChevronRight
} from 'lucide-react';
import { 
  Assignment, Station, GroupedAssignment, User, UserSession, 
  LeaveRequest, DeactivationRequest, ReactivationRequest, AssignmentActionRequest,
  PositionChangeRequest
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
const POSITION_REQ_KEY = 'spx_position_requests';

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
  const [positionChangeRequests, setPositionChangeRequests] = useState<PositionChangeRequest[]>([]);
  
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveData, setLeaveData] = useState({ type: 'Tahunan', duration: '', reason: '', photoUrl: '' });
  
  const [showDeactivateModal, setShowDeactivateModal] = useState<{ userId: string, name: string } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  const [showPositionModal, setShowPositionModal] = useState<{ user: User, type: 'Promotion' | 'Demotion' } | null>(null);
  const [posNewValue, setPosNewValue] = useState("");
  const [posReason, setPosReason] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editWA, setEditWA] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editDOB, setEditDOB] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // --- Roles & Permissions ---
  const userRole = session?.user.role || "courier";
  const userPos = (session?.user.position || "").toUpperCase();
  
  const isShiftLead = userPos.includes('SHIFT LEAD');
  const isHubLeadOrPIC = userPos.includes('HUB LEAD') || userPos.includes('PIC HUB');
  const isAdmin = userRole === 'admin';
  const isAdminTracer = userPos.includes('ADMIN TRACER');
  
  const isAuthorized = isShiftLead || isHubLeadOrPIC || isAdmin;
  const canSeeDirectory = isAuthorized; 
  const canManageUsers = isAuthorized; 
  const canManageRoles = isAdmin || isHubLeadOrPIC; 
  const canDeleteAT = isAuthorized || isAdminTracer;

  const downloadTemplate = () => {
    const headers = ['Nama Kurir', 'Jumlah Paket', 'Task ID', 'Status', 'Update Terakhir'];
    const exampleData = ['Andi Pratama', '45', 'TASK-HUB-001', 'Pending', '08:00'];
    const csvContent = [headers.join(','), exampleData.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "spx_import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    const savedPosReqs = localStorage.getItem(POSITION_REQ_KEY);
    
    if (savedLeave) setLeaveRequests(JSON.parse(savedLeave));
    if (savedDeactivate) setDeactivateRequests(JSON.parse(savedDeactivate));
    if (savedReactivate) setReactivateRequests(JSON.parse(savedReactivate));
    if (savedAtActions) setAtActionRequests(JSON.parse(savedAtActions));
    if (savedPosReqs) setPositionChangeRequests(JSON.parse(savedPosReqs));

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
    localStorage.setItem(POSITION_REQ_KEY, JSON.stringify(positionChangeRequests));
  }, [leaveRequests, deactivateRequests, reactivateRequests, atActionRequests, positionChangeRequests]);

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
      if (user && (password.trim() === (user.password || ""))) {
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
        setAssignments(prev => [...importPreview, ...prev]);
        setImportPreview(null);
        alert("Data berhasil diunggah ke database spreadsheet secara permanen!");
        fetchData(); 
      } else {
        alert("Gagal mengunggah data ke server.");
      }
    } catch {
      alert("Terjadi kesalahan sistem saat mengunggah.");
    } finally {
      setIsUploading(false);
    }
  };

  // --- AT Action Management ---
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
    alert(`Pengajuan ${showAtActionModal.type === 'Delete' ? 'penghapusan' : 'pemulihan'} dikirim.`);
  };

  const approveAtAction = (req: AssignmentActionRequest) => {
    if (!session) return;
    setAssignments(prev => prev.map(a => {
      if (req.assignmentIds.includes(a.id)) {
        return { 
          ...a, 
          status: req.type === 'Delete' ? 'Deleted' : 'Pending',
          deletionReason: req.type === 'Delete' ? req.reason : undefined,
          deletedAt: req.type === 'Delete' ? new Date().toLocaleString() : undefined
        };
      }
      return a;
    }));
    setAtActionRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session.user.name } : r));
  };

  // --- Member Action Management ---
  const requestDeactivation = () => {
    if (!showDeactivateModal || !session || !deactivateReason) return;
    const newReq: DeactivationRequest = {
      id: Math.random().toString(36).substr(2, 9),
      targetUserId: showDeactivateModal.userId,
      targetUserName: showDeactivateModal.name,
      requesterId: session.user.id,
      requesterName: session.user.name,
      reason: deactivateReason,
      status: 'Pending',
      createdAt: new Date().toLocaleString()
    };
    setDeactivateRequests([newReq, ...deactivateRequests]);
    setShowDeactivateModal(null);
    setDeactivateReason("");
    alert("Permintaan deaktivasi dikirim.");
  };

  const approveDeactivation = (req: DeactivationRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, status: 'Inactive' } : u));
    setDeactivateRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
  };

  const requestReactivation = (userId: string, name: string) => {
    if (!session) return;
    const reason = prompt("Masukkan alasan re-aktivasi (Wajib):");
    if (!reason) return;
    const newReq: ReactivationRequest = {
      id: Math.random().toString(36).substr(2, 9),
      targetUserId: userId,
      targetUserName: name,
      requesterId: session.user.id,
      requesterName: session.user.name,
      reason: reason,
      status: 'Pending',
      createdAt: new Date().toLocaleString()
    };
    setReactivateRequests([newReq, ...reactivateRequests]);
    alert("Permintaan re-aktivasi dikirim.");
  };

  const approveReactivation = (req: ReactivationRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, status: 'Active' } : u));
    setReactivateRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
  };

  // --- Position Change Management ---
  const requestPositionChange = () => {
    if (!showPositionModal || !posNewValue || !posReason || !session) return;
    const newReq: PositionChangeRequest = {
      id: Math.random().toString(36).substr(2, 9),
      targetUserId: showPositionModal.user.id,
      targetUserName: showPositionModal.user.name,
      oldPosition: showPositionModal.user.position,
      newPosition: posNewValue,
      type: showPositionModal.type,
      requesterId: session.user.id,
      requesterName: session.user.name,
      reason: posReason,
      status: 'Pending',
      createdAt: new Date().toLocaleString()
    };
    setPositionChangeRequests([newReq, ...positionChangeRequests]);
    setShowPositionModal(null);
    setPosNewValue("");
    setPosReason("");
    alert(`Permintaan ${showPositionModal.type === 'Promotion' ? 'Promosi' : 'Demosi'} dikirim.`);
  };

  const approvePositionChange = (req: PositionChangeRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, position: req.newPosition } : u));
    setPositionChangeRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
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

  const pendingApprovalsCount = useMemo(() => {
    return leaveRequests.filter(r => r.status === 'Pending').length + 
           deactivateRequests.filter(r => r.status === 'Pending').length + 
           reactivateRequests.filter(r => r.status === 'Pending').length + 
           atActionRequests.filter(r => r.status === 'Pending').length +
           positionChangeRequests.filter(r => r.status === 'Pending').length;
  }, [leaveRequests, deactivateRequests, reactivateRequests, atActionRequests, positionChangeRequests]);

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
              <p className="text-gray-400 text-sm mt-4 uppercase font-bold tracking-[0.2em] max-w-xs">Operasional Hub Tertutup.</p>
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
        {/* Stats */}
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

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex gap-2">
            <button onClick={() => { setShowSettings(true); setSettingsTab('leave'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-orange-50 text-[#EE4D2D] font-black text-[10px] uppercase border border-orange-100">
              <Calendar size={16} /> Cuti
            </button>
            {(isAuthorized) && (
              <button onClick={() => { setShowSettings(true); setSettingsTab('approvals'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#EE4D2D] text-white font-black text-[10px] uppercase shadow-md relative">
                <CheckSquare size={16} /> Approval Hub
                {pendingApprovalsCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-black text-white text-[9px] rounded-full border-2 border-white flex items-center justify-center font-black animate-pulse">{pendingApprovalsCount}</span>}
              </button>
            )}
            {isAuthorized && (
               <button onClick={() => { setShowSettings(true); setSettingsTab('history'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase">
                 <History size={16} /> Log Archive
               </button>
            )}
          </div>
          
          <div className="flex gap-2">
            {isAuthorized && (
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
            {canSeeDirectory && (
              <button onClick={() => { setShowSettings(true); setSettingsTab('directory'); }} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-black text-white font-black text-[10px] uppercase">
                <UserPlus size={16} /> Team Directory
              </button>
            )}
          </div>
        </div>

        {/* Search */}
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
            <div key={group.id} className={`bg-white p-4 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col group animate-fade-in relative`}>
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

      {/* Settings & Admin Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/98 backdrop-blur-2xl animate-fade-in">
          <div className="bg-white rounded-[44px] w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-black p-8 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <ShieldCheck size={28} className="text-[#EE4D2D]" />
                <h2 className="text-xl font-black uppercase italic">Hub Management Dashboard</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-3 bg-white/10 rounded-xl hover:bg-white/20"><XCircle size={32} /></button>
            </div>
            
            <nav className="flex border-b border-gray-100 bg-white sticky top-0 z-20 overflow-x-auto no-scrollbar shrink-0">
              <button onClick={() => { setEditUserTarget(null); setSettingsTab('profile'); }} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'profile' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Profil</button>
              {canSeeDirectory && (
                <button onClick={() => setSettingsTab('directory')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'directory' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Directory</button>
              )}
              {isAuthorized && (
                <button onClick={() => setSettingsTab('approvals')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'approvals' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'} flex items-center gap-2`}>
                  Approvals
                  {pendingApprovalsCount > 0 && <span className="bg-[#EE4D2D] text-white px-2 py-0.5 rounded-md text-[8px] font-black">{pendingApprovalsCount}</span>}
                </button>
              )}
              {isAuthorized && (
                <button onClick={() => setSettingsTab('history')} className={`px-8 py-5 font-black text-[11px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'history' ? 'text-[#EE4D2D] border-b-4 border-[#EE4D2D]' : 'text-gray-400'}`}>Trash</button>
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
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Nama Lengkap</p>
                      <input type="text" value={editFullName} onChange={e => setEditFullName(e.target.value)} className="w-full font-black text-black outline-none text-base bg-transparent" />
                    </div>
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

              {settingsTab === 'directory' && (
                <div className="space-y-8 animate-fade-in">
                  <div className="flex flex-col md:flex-row gap-4 mb-2">
                    <div className="relative flex-1">
                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                       <input type="text" placeholder="Search team members..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white border border-gray-200 outline-none text-sm font-bold" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredUsers.map(user => {
                      const pos = (user.position || "").toUpperCase();
                      const isTargetHubLead = pos.includes('HUB LEAD') || pos.includes('PIC HUB');
                      const isTargetShiftLead = pos.includes('SHIFT LEAD');
                      
                      return (
                        <div key={user.id} className={`bg-white p-6 rounded-[32px] border shadow-sm flex flex-col gap-5 group hover:shadow-lg transition-all ${user.status === 'Inactive' ? 'opacity-50 grayscale' : 'border-gray-50'}`}>
                          <div className="flex items-center gap-4">
                             <div className={`w-14 h-14 rounded-2xl ${getAvatarColor(user.name)} flex items-center justify-center text-white font-black overflow-hidden shadow-inner`}>
                               {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : getInitials(user.name)}
                             </div>
                             <div className="flex-1 min-w-0">
                               <h4 className="font-black text-gray-900 text-sm uppercase truncate">{user.nickname || user.name}</h4>
                               <div className="flex flex-wrap gap-1 mt-1">
                                 <span className={`text-[7px] px-1.5 py-0.5 rounded-md font-black uppercase ${isTargetHubLead ? 'bg-amber-100 text-amber-700' : isTargetShiftLead ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                   {user.position || user.role}
                                 </span>
                                 {user.status === 'Inactive' && <span className="bg-red-100 text-red-700 text-[7px] px-1.5 py-0.5 rounded-md font-black uppercase">NONAKTIF</span>}
                               </div>
                             </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-auto">
                            {canManageUsers && (
                              <button onClick={() => handleOpenEditUser(user)} className="py-2.5 bg-gray-50 text-gray-400 rounded-xl font-black text-[8px] uppercase hover:bg-orange-50 hover:text-[#EE4D2D] transition-all flex items-center justify-center gap-1.5">
                                <Edit3 size={12} /> Profil
                              </button>
                            )}
                            {isShiftLead && user.status !== 'Inactive' && (
                              <>
                                <button onClick={() => setShowPositionModal({ user, type: 'Promotion' })} className="py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[8px] uppercase hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5">
                                  <TrendingUp size={12} /> Promosi
                                </button>
                                <button onClick={() => setShowPositionModal({ user, type: 'Demotion' })} className="py-2.5 bg-amber-50 text-amber-600 rounded-xl font-black text-[8px] uppercase hover:bg-amber-100 transition-all flex items-center justify-center gap-1.5">
                                  <TrendingDown size={12} /> Demosi
                                </button>
                                <button onClick={() => setShowDeactivateModal({ userId: user.id, name: user.name })} className="py-2.5 bg-red-50 text-red-600 rounded-xl font-black text-[8px] uppercase hover:bg-red-100 transition-all flex items-center justify-center gap-1.5">
                                  <UserX size={12} /> Nonaktif
                                </button>
                              </>
                            )}
                            {isShiftLead && user.status === 'Inactive' && (
                              <button onClick={() => requestReactivation(user.id, user.name)} className="col-span-2 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[8px] uppercase hover:bg-emerald-100 transition-all flex items-center justify-center gap-1.5">
                                <RotateCcw size={12} /> Re-aktivasi
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {settingsTab === 'approvals' && (
                <div className="space-y-12 animate-fade-in">
                  {/* Position Change Approvals */}
                  {positionChangeRequests.filter(r => r.status === 'Pending').length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={14} /> Promotion & Demotion Approval</p>
                      <div className="grid gap-3">
                        {positionChangeRequests.filter(r => r.status === 'Pending').map(req => (
                          <div key={req.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-5">
                               <div className={`p-4 rounded-2xl ${req.type === 'Promotion' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                 {req.type === 'Promotion' ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                               </div>
                               <div>
                                 <p className="text-[10px] font-black text-gray-400 uppercase">Target: {req.targetUserName}</p>
                                 <h4 className="font-black text-gray-900 text-sm uppercase italic flex items-center gap-2">
                                   {req.oldPosition} <ChevronRight size={14} className="text-gray-300" /> <span className="text-[#EE4D2D]">{req.newPosition}</span>
                                 </h4>
                                 <p className="text-[9px] font-bold text-gray-400 mt-1 italic">Reason: "{req.reason}"</p>
                                 <p className="text-[8px] font-bold text-[#EE4D2D] mt-1 uppercase">Req by: {req.requesterName} • {req.createdAt}</p>
                               </div>
                            </div>
                            <button onClick={() => approvePositionChange(req)} className="px-6 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-600 transition-all">Setujui</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Member Status Approvals */}
                  {(deactivateRequests.filter(r => r.status === 'Pending').length > 0 || reactivateRequests.filter(r => r.status === 'Pending').length > 0) && (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><UserCheck size={14} /> Status Change Approval</p>
                      <div className="grid gap-3">
                        {deactivateRequests.filter(r => r.status === 'Pending').map(req => (
                          <div key={req.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-5">
                               <div className="p-4 rounded-2xl bg-red-50 text-red-600"><UserX size={24} /></div>
                               <div>
                                 <p className="text-[10px] font-black text-gray-400 uppercase">Nonaktifkan: {req.targetUserName}</p>
                                 <p className="text-[9px] font-bold text-gray-400 mt-1 italic">Reason: "{req.reason}"</p>
                                 <p className="text-[8px] font-bold text-[#EE4D2D] mt-1 uppercase">Req by: {req.requesterName}</p>
                               </div>
                            </div>
                            <button onClick={() => approveDeactivation(req)} className="px-6 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-red-600 transition-all">Approve</button>
                          </div>
                        ))}
                        {reactivateRequests.filter(r => r.status === 'Pending').map(req => (
                          <div key={req.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-5">
                               <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600"><RotateCcw size={24} /></div>
                               <div>
                                 <p className="text-[10px] font-black text-gray-400 uppercase">Aktifkan: {req.targetUserName}</p>
                                 <p className="text-[9px] font-bold text-gray-400 mt-1 italic">Reason: "{req.reason}"</p>
                                 <p className="text-[8px] font-bold text-[#EE4D2D] mt-1 uppercase">Req by: {req.requesterName}</p>
                               </div>
                            </div>
                            <button onClick={() => approveReactivation(req)} className="px-6 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-600 transition-all">Approve</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingApprovalsCount === 0 && (
                    <div className="flex flex-col items-center justify-center p-20 text-center opacity-20">
                       <CheckCircle2 size={64} className="mb-4 text-emerald-500" />
                       <h3 className="text-xl font-black uppercase italic tracking-tighter">Semua Terproses</h3>
                       <p className="text-sm font-bold uppercase tracking-widest mt-2">Tidak ada permintaan menunggu persetujuan.</p>
                    </div>
                  )}
                </div>
              )}

              {settingsTab === 'history' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-gray-100">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 uppercase">Archive Management</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Penugasan & Member terhapus / histori perubahan.</p>
                    </div>
                    <History className="text-gray-300" size={32} />
                  </div>

                  <div className="grid gap-3">
                    {assignments.filter(a => a.status === 'Deleted').map(a => (
                      <div key={a.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between group hover:border-[#EE4D2D] transition-all">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-300"><Package size={24} /></div>
                           <div>
                             <h4 className="font-black text-gray-900 text-sm uppercase">{a.courierName} • {a.station}</h4>
                             <p className="text-[10px] font-black text-red-400 italic">Reason: "{a.deletionReason || 'Administrative Cleanup'}"</p>
                           </div>
                        </div>
                        {isShiftLead && (
                           <button onClick={() => approveAtAction({ id: 'dummy', assignmentIds: [a.id], type: 'Restore', status: 'Approved', reason: 'Restoration', createdAt: '', requesterId: '', requesterName: '', taskIds: [] })} className="px-5 py-2.5 bg-black text-white rounded-xl font-black text-[9px] uppercase hover:bg-emerald-600 transition-all">Pulihkan</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promotion / Demotion Modal */}
      {showPositionModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl animate-fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-md p-10 shadow-2xl space-y-8">
             <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className={`p-4 rounded-2xl ${showPositionModal.type === 'Promotion' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                      {showPositionModal.type === 'Promotion' ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                   </div>
                   <div>
                      <h2 className="text-xl font-black uppercase italic tracking-tighter">{showPositionModal.type === 'Promotion' ? 'Promosi' : 'Demosi'} Tim</h2>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Network Authority Control</p>
                   </div>
                </div>
                <button onClick={() => setShowPositionModal(null)} className="text-gray-300 hover:text-black transition-all"><XCircle size={32} /></button>
             </div>

             <div className="space-y-4">
                <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Target Anggota</p>
                  <p className="font-black text-gray-900 text-lg uppercase">{showPositionModal.user.name}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase italic">Posisi Saat Ini: {showPositionModal.user.position}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Jabatan Baru (Wajib)</p>
                  <input 
                    type="text"
                    value={posNewValue}
                    onChange={(e) => setPosNewValue(e.target.value)}
                    className="w-full p-6 rounded-[28px] bg-gray-50 border border-gray-100 outline-none focus:border-[#EE4D2D] font-black text-sm uppercase"
                    placeholder="Contoh: SHIFT LEAD 2"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Alasan (Wajib)</p>
                  <textarea 
                    value={posReason}
                    onChange={(e) => setPosReason(e.target.value)}
                    className="w-full p-6 rounded-[28px] bg-gray-50 border border-gray-100 outline-none focus:border-[#EE4D2D] transition-all font-bold text-sm h-32 resize-none"
                    placeholder="Jelaskan alasan perubahan jabatan ini..."
                  />
                </div>
             </div>

             <button 
               onClick={requestPositionChange}
               disabled={!posNewValue || !posReason}
               className={`w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all ${(!posNewValue || !posReason) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white active:scale-95'}`}
             >
               KIRIM PENGAJUAN
             </button>
          </div>
        </div>
      )}

      {/* Deactivation Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl animate-fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-md p-10 shadow-2xl space-y-8">
             <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className="p-4 rounded-2xl bg-red-50 text-red-600"><UserX size={32} /></div>
                   <div>
                      <h2 className="text-xl font-black uppercase italic tracking-tighter">Deaktivasi Member</h2>
                      <p className="text-[10px] font-black text-gray-400 uppercase">Security Authority System</p>
                   </div>
                </div>
                <button onClick={() => setShowDeactivateModal(null)} className="text-gray-300 hover:text-black transition-all"><XCircle size={32} /></button>
             </div>

             <div className="space-y-4">
                <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Target Penonaktifan</p>
                  <p className="font-black text-gray-900 text-lg uppercase">{showDeactivateModal.name}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Alasan (Wajib)</p>
                  <textarea 
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    className="w-full p-6 rounded-[28px] bg-gray-50 border border-gray-100 outline-none focus:border-red-500 transition-all font-bold text-sm h-32 resize-none"
                    placeholder="Jelaskan alasan penonaktifan..."
                  />
                </div>
             </div>

             <button 
               onClick={requestDeactivation}
               disabled={!deactivateReason}
               className={`w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all ${!deactivateReason ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white active:scale-95'}`}
             >
               KIRIM REQUEST
             </button>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 mt-16 pb-16 text-center opacity-30 select-none">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.5em] mb-2">Shopee Xpress Hub Secure Management</p>
        <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest leading-none">ENTERPRISE EDITION v4.5.0 • SECURE MODE ON</p>
      </footer>
    </div>
  );
};

export default App;
