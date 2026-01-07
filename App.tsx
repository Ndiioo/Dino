
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, Search, CheckCircle2, Clock, RefreshCw, AlertCircle, LogOut, Lock, 
  UserCircle, XCircle, Eye, EyeOff, Users, Scan, Settings, Copy, Check, 
  Camera, UserPlus, Edit3, QrCode, Loader2,
  Calendar, CheckSquare, Trash, TrendingUp, Megaphone,
  X, Monitor, Key, Shield, ShieldCheck, ShieldX, UserMinus, Wifi, WifiOff, CloudCheck, EyeClosed,
  Filter
} from 'lucide-react';
import { 
  Assignment, Station, GroupedAssignment, User, UserSession, 
  LeaveRequest, DeactivationRequest, ReactivationRequest, AssignmentActionRequest,
  PositionChangeRequest, AccessRequest
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

const SESSION_KEY = 'spx_v4_session';
const LEAVE_KEY = 'spx_leave_requests';
const DEACTIVATE_KEY = 'spx_deactivate_requests';
const REACTIVATE_KEY = 'spx_reactivate_requests';
const AT_ACTION_KEY = 'spx_at_action_requests';
const POSITION_REQ_KEY = 'spx_position_requests';
const ACCESS_REQ_KEY = 'spx_access_requests';
const USERS_CACHE_KEY = 'spx_users_cache';
const ASSIGNMENTS_CACHE_KEY = 'spx_assignments_cache';

const SYNC_INTERVAL = 30000; // 30 seconds

const extractIdAndName = (fullName: string) => {
  if (!fullName) return { id: '', name: 'N/A' };
  const idMatch = fullName.match(/\[(.*?)\]/);
  const id = idMatch ? idMatch[1].trim() : '';
  let rawName = fullName.replace(/\[.*?\]/, '').trim();
  const placeholders = ['courier partner', 'tanpa nama', 'null', 'undefined', '-'];
  if (placeholders.includes(rawName.toLowerCase()) || !rawName) rawName = '';
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
  const [autoSaveActive, setAutoSaveActive] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Requests States
  const [atActionRequests, setAtActionRequests] = useState<AssignmentActionRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deactivateRequests, setDeactivateRequests] = useState<DeactivationRequest[]>([]);
  const [reactivateRequests, setReactivateRequests] = useState<ReactivationRequest[]>([]);
  const [positionChangeRequests, setPositionChangeRequests] = useState<PositionChangeRequest[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);

  // Modals States
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveData, setLeaveData] = useState({ type: 'Tahunan' as any, duration: '', reason: '', submissionDate: new Date().toISOString().split('T')[0] });
  const [showPositionModal, setShowPositionModal] = useState<{ user: User, type: 'Promotion' | 'Demotion' } | null>(null);
  const [posNewValue, setPosNewValue] = useState("");
  const [posReason, setPosReason] = useState("");
  const [showAccessModal, setShowAccessModal] = useState<{ user: User, type: 'Grant' | 'Revoke' } | null>(null);
  const [accessReason, setAccessReason] = useState("");

  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editWA, setEditWA] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editDOB, setEditDOB] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editFullName, setEditFullName] = useState("");

  const photoRef = useRef<HTMLInputElement>(null);

  // --- Roles & Permissions Logic ---
  const userRole = session?.user.role || "courier";
  const userPos = (session?.user.position || "").toUpperCase();
  const hasAccessGranted = session?.user.accessGranted || false;
  
  const isShiftLead = userPos.includes('SHIFT LEAD');
  const isHubLeadOrPIC = userPos.includes('HUB LEAD') || userPos.includes('PIC HUB');
  const isAdmin = userRole === 'admin';
  
  const isAuthorized = isHubLeadOrPIC || isAdmin || (isShiftLead && hasAccessGranted);
  const canManageUsers = isHubLeadOrPIC || isAdmin || isShiftLead; 
  const canSeeDirectory = isAuthorized || isShiftLead; 

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot' || (e.ctrlKey && e.key === 'p')) {
        setIsPrivacyMode(true);
        alert('Keamanan SPX: Capture dilarang.');
        setTimeout(() => setIsPrivacyMode(false), 2000);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleVisibilityChange = () => setIsPrivacyMode(document.visibilityState === 'hidden' || !document.hasFocus());
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', () => setIsPrivacyMode(true));
    window.addEventListener('focus', () => setIsPrivacyMode(false));

    // Online/Offline Listeners
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial Load
    const savedLeave = localStorage.getItem(LEAVE_KEY);
    const savedDeactivate = localStorage.getItem(DEACTIVATE_KEY);
    const savedReactivate = localStorage.getItem(REACTIVATE_KEY);
    const savedAtActions = localStorage.getItem(AT_ACTION_KEY);
    const savedPosReqs = localStorage.getItem(POSITION_REQ_KEY);
    const savedAccessReqs = localStorage.getItem(ACCESS_REQ_KEY);
    const savedUsers = localStorage.getItem(USERS_CACHE_KEY);
    const savedAssignments = localStorage.getItem(ASSIGNMENTS_CACHE_KEY);
    
    if (savedLeave) setLeaveRequests(JSON.parse(savedLeave));
    if (savedDeactivate) setDeactivateRequests(JSON.parse(savedDeactivate));
    if (savedReactivate) setReactivateRequests(JSON.parse(savedReactivate));
    if (savedAtActions) setAtActionRequests(JSON.parse(savedAtActions));
    if (savedPosReqs) setPositionChangeRequests(JSON.parse(savedPosReqs));
    if (savedAccessReqs) setAccessRequests(JSON.parse(savedAccessReqs));
    if (savedUsers) setAllUsers(JSON.parse(savedUsers));
    if (savedAssignments) setAssignments(JSON.parse(savedAssignments));

    initializeAppData();

    const syncTimer = setInterval(() => { if (!loading && !refreshing) fetchData(); }, SYNC_INTERVAL);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', () => setIsPrivacyMode(true));
      window.removeEventListener('focus', () => setIsPrivacyMode(false));
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(syncTimer);
    };
  }, []);

  useEffect(() => {
    const saveState = () => {
      setAutoSaveActive(true);
      localStorage.setItem(LEAVE_KEY, JSON.stringify(leaveRequests));
      localStorage.setItem(DEACTIVATE_KEY, JSON.stringify(deactivateRequests));
      localStorage.setItem(REACTIVATE_KEY, JSON.stringify(reactivateRequests));
      localStorage.setItem(AT_ACTION_KEY, JSON.stringify(atActionRequests));
      localStorage.setItem(POSITION_REQ_KEY, JSON.stringify(positionChangeRequests));
      localStorage.setItem(ACCESS_REQ_KEY, JSON.stringify(accessRequests));
      localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(allUsers));
      localStorage.setItem(ASSIGNMENTS_CACHE_KEY, JSON.stringify(assignments));
      setTimeout(() => setAutoSaveActive(false), 800);
    };
    saveState();
  }, [leaveRequests, deactivateRequests, reactivateRequests, atActionRequests, positionChangeRequests, accessRequests, allUsers, assignments]);

  const initializeAppData = async () => {
    setLoading(true);
    try {
      const [staffList, courierList] = await Promise.all([fetchStaffData(), fetchCourierLoginData()]);
      const users = [...staffList, ...courierList].map(u => ({ ...u, status: u.status || 'Active' }));
      setAllUsers(prev => {
        return users.map(u => {
          const localMatch = prev.find(p => p.id === u.id);
          return localMatch ? { ...u, ...localMatch } : u;
        });
      });
      const savedSessionStr = localStorage.getItem(SESSION_KEY);
      if (savedSessionStr) {
        try { 
          const parsed = JSON.parse(savedSessionStr);
          const verifiedUser = users.find(u => u.id === parsed.user.id);
          if (verifiedUser) {
            const localUser = (JSON.parse(localStorage.getItem(USERS_CACHE_KEY) || '[]') as User[]).find(lu => lu.id === verifiedUser.id);
            setSession({ user: localUser || verifiedUser });
          }
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
      setLastSyncTime(new Date().toLocaleTimeString());
      if (session) {
        setAllUsers(prev => prev.map(u => u.id === session.user.id ? { ...u, lastActive: new Date().toISOString() } : u));
      }
      if (allData.length > 0 && !isInitial) getLogisticsInsights(allData).then(txt => setInsights(txt));
    } catch (e) { console.warn(e); } finally { setRefreshing(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const user = allUsers.find(u => u.id === username.trim());
      if (user && (password.trim() === (user.password || ""))) {
        if (user.status === 'Deleted') {
          alert("Member tersebut sudah dihapus dan tidak dapat login lagi.");
          return;
        }
        if (user.status === 'Inactive') { alert("Akun Nonaktif."); return; }
        const s: UserSession = { user };
        setSession(s);
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        return;
      }
      alert("ID/Password Salah.");
    } catch { alert("Gagal koneksi."); } finally { setIsLoggingIn(false); }
  };

  const handleDeleteMember = async (userId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus member ini secara permanen? Member tidak akan bisa login lagi.")) return;
    setIsSaving(true);
    try {
      const success = await updateUserProfile(userId, { status: 'Deleted' });
      if (success) {
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'Deleted' } : u));
        alert("Member berhasil dihapus.");
      }
    } catch { alert("Gagal menghapus."); } finally { setIsSaving(false); }
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
      const payload: any = { nickname: editNickname, whatsapp: editWA, photoUrl: editPhoto, name: editFullName };
      if (targetId === session?.user.id) payload.dateOfBirth = editDOB;
      if (isHubLeadOrPIC || isAdmin) payload.position = editPosition;
      const success = await updateUserProfile(targetId, payload);
      if (success) {
        setAllUsers(prev => prev.map(u => u.id === targetId ? { ...u, ...payload } : u));
        if (targetId === session?.user.id) {
          const updatedUser = { ...session.user, ...payload };
          setSession({ user: updatedUser });
          localStorage.setItem(SESSION_KEY, JSON.stringify({ user: updatedUser }));
        }
        setEditUserTarget(null);
        alert("Profil Updated.");
      }
    } catch { alert("Gagal update."); } finally { setIsSaving(false); }
  };

  const handleCompleteTask = async (id: string, taskId: string, station: Station) => {
    setIsSaving(true);
    try {
      const success = await updateSpreadsheetTask(taskId, 'Completed', station);
      if (success) {
        setAssignments(prev => prev.map(a => a.id === id ? { ...a, status: 'Completed', completedAt: new Date().toLocaleString() } : a));
        setSelectedGroup(null);
        alert("Selesai!");
      }
    } catch { alert("Error."); } finally { setIsSaving(false); }
  };

  const handleApproveAccessAction = (req: AccessRequest) => {
    setAllUsers(prev => prev.map(u => u.id === req.userId ? { 
      ...u, 
      role: req.requestedRole, 
      accessGranted: req.type === 'Grant' 
    } : u));
    setAccessRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedBy: session?.user.name } : r));
    if (session?.user.id === req.userId) {
      const updatedUser = { ...session.user, role: req.requestedRole, accessGranted: req.type === 'Grant' };
      setSession({ user: updatedUser });
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: updatedUser }));
    }
    alert(`Akses ${req.type === 'Grant' ? 'Diberikan' : 'Dicabut'}! Perubahan aktif.`);
  };

  // --- Leave Approval Handlers ---
  const handleApproveLeaveL1 = (id: string) => {
    setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Approved_L1', approvedByL1: session?.user.name } : r));
    alert("Approval Cuti L1 Selesai.");
  };

  const handleApproveLeaveFinal = (id: string) => {
    setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Approved', approvedByFinal: session?.user.name } : r));
    alert("Approval Cuti Final Selesai.");
  };

  const handleApprovePositionL1 = (req: PositionChangeRequest) => {
    setPositionChangeRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved_L1', approvedByL1: session?.user.name } : r));
    alert("Approval L1 Selesai. Menunggu Approval Akhir dari Hub Lead.");
  };

  const handleApprovePositionFinal = async (req: PositionChangeRequest) => {
    setIsSaving(true);
    try {
      const success = await updateUserProfile(req.targetUserId, { position: req.newPosition });
      if (success) {
        setAllUsers(prev => prev.map(u => u.id === req.targetUserId ? { ...u, position: req.newPosition } : u));
        setPositionChangeRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'Approved', approvedByFinal: session?.user.name } : r));
        alert("Approval Akhir Selesai. Jabatan berhasil diperbarui dan disinkronkan ke Database.");
      }
    } catch { alert("Gagal sinkronisasi database."); } finally { setIsSaving(false); }
  };

  const handleRejectRequest = (type: any, id: string) => {
    const reason = prompt("Alasan:");
    if (!reason) return;
    if (type === 'leave') setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Rejected' } : r));
    if (type === 'access') setAccessRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Rejected' } : r));
    if (type === 'position') setPositionChangeRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'Rejected' } : r));
  };

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
    alert("Pengajuan posisi dikirim untuk approval berjenjang.");
  };

  const activeLeaves = useMemo(() => leaveRequests.filter(r => r.status === 'Approved'), [leaveRequests]);
  const onlineUsers = useMemo(() => {
    const now = new Date();
    return allUsers.filter(u => u.status !== 'Deleted' && u.lastActive && (now.getTime() - new Date(u.lastActive).getTime()) < (SYNC_INTERVAL * 2));
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allUsers.filter(u => u.status !== 'Deleted' && (u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || (u.nickname && u.nickname.toLowerCase().includes(q))));
  }, [allUsers, searchQuery]);

  const pendingApprovalsCount = useMemo(() => {
    return leaveRequests.filter(r => r.status === 'Pending' || r.status === 'Approved_L1').length + 
           deactivateRequests.filter(r => r.status === 'Pending').length + 
           reactivateRequests.filter(r => r.status === 'Pending').length + 
           atActionRequests.filter(r => r.status === 'Pending').length +
           positionChangeRequests.filter(r => r.status === 'Pending' || r.status === 'Approved_L1').length +
           accessRequests.filter(r => r.status === 'Pending').length;
  }, [leaveRequests, deactivateRequests, reactivateRequests, atActionRequests, positionChangeRequests, accessRequests]);

  const marqueeText = useMemo(() => {
    let text = `Sync: ${lastSyncTime} | `;
    if (activeLeaves.length > 0) text += `ON LEAVE: ${activeLeaves.map(r => r.courierName).join(", ")} | `;
    const pendingAccess = accessRequests.filter(r => r.status === 'Pending');
    if (pendingAccess.length > 0) text += `REQ ACCESS: ${pendingAccess.map(r => r.userName).join(", ")} | `;
    if (activeLeaves.length === 0 && pendingAccess.length === 0) text += "Hub Tompobulu, Biringbulu, & Bungaya normal.";
    return text;
  }, [activeLeaves, accessRequests, lastSyncTime]);

  const groupedCouriers = useMemo(() => {
    const groups: Record<string, GroupedAssignment & { id: string }> = {};
    let baseData = assignments.filter(a => a.status === 'Pending' || a.status === 'Ongoing');
    if (session?.user.role === 'courier') baseData = baseData.filter(a => extractIdAndName(a.courierName).id === session.user.id);
    baseData.forEach(a => {
      const { id, name } = extractIdAndName(a.courierName);
      const userProfile = allUsers.find(u => u.id === id);
      if (!userProfile || userProfile.status === 'Inactive' || userProfile.status === 'Deleted' || (selectedStation !== 'All' && a.station !== selectedStation)) return;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!name.toLowerCase().includes(q) && !id.toLowerCase().includes(q) && !a.taskId.toLowerCase().includes(q)) return;
      }
      if (!groups[id]) groups[id] = { id, courierName: userProfile?.nickname || name || id, station: a.station, totalPackages: 0, tasks: [], status: 'Ongoing', lastUpdated: a.lastUpdated };
      groups[id].tasks.push(a);
      groups[id].totalPackages += a.packageCount;
    });
    return Object.values(groups);
  }, [assignments, session, selectedStation, searchQuery, allUsers]);

  const stats = useMemo(() => ({
    pkg: assignments.reduce((s, a) => s + (a.status !== 'Deleted' ? a.packageCount : 0), 0),
    team: allUsers.filter(u => u.status !== 'Inactive' && u.status !== 'Deleted').length,
    done: assignments.filter(a => a.status === 'Completed').length,
    todo: assignments.filter(a => a.status === 'Pending' || a.status === 'Ongoing').length
  }), [assignments, allUsers]);

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <Loader2 className="w-8 h-8 text-[#EE4D2D] animate-spin" />
      <p className="mt-3 font-black text-[#EE4D2D] text-[10px] uppercase italic tracking-tighter">Syncing...</p>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-[320px] w-full bg-white rounded-3xl shadow-xl p-6 border border-gray-100 animate-fade-in">
        <div className="flex justify-center mb-6">
           <div className="bg-[#EE4D2D] px-4 py-2 rounded-xl shadow-lg transform -rotate-1">
             <span className="text-white font-black text-sm italic tracking-tighter uppercase">SPX <span className="font-light">Task</span></span>
           </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 focus-within:border-orange-500">
            <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">User ID</p>
            <div className="flex items-center gap-2">
              <UserCircle size={16} className="text-gray-400" />
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="000000" className="bg-transparent font-bold text-gray-900 outline-none w-full text-xs" required />
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 focus-within:border-orange-500">
            <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">Password</p>
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-400" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="bg-transparent font-bold text-gray-900 outline-none w-full text-xs" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </div>
          </div>
          <button type="submit" disabled={isLoggingIn} className="w-full bg-[#EE4D2D] text-white py-3.5 rounded-xl font-black text-[10px] shadow-lg active:scale-95 uppercase tracking-widest mt-4">
            {isLoggingIn ? "Loading..." : "LOGIN DASHBOARD"}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#fcfcfc] pb-20 font-['Plus_Jakarta_Sans'] transition-all duration-700 ${isPrivacyMode ? 'blur-3xl' : ''}`}>
      {isPrivacyMode && (
        <div className="fixed inset-0 z-[1000] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-6">
           <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 shadow-2xl">
              <EyeClosed size={48} className="text-[#EE4D2D] mb-4 mx-auto" />
              <h2 className="text-white text-lg font-black uppercase italic">Security Shield</h2>
              <p className="text-gray-400 text-[10px] mt-2 uppercase font-bold tracking-widest">Hub Secured.</p>
           </div>
        </div>
      )}

      {autoSaveActive && (
        <div className="fixed bottom-4 left-4 z-[1000] flex items-center gap-1.5 bg-black/80 text-white px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest animate-fade-in shadow-xl">
           <CloudCheck size={12} className="text-emerald-400" /> Syncing
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#EE4D2D] px-3 py-2.5 md:py-4 rounded-b-2xl md:rounded-b-[32px] shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-black/90 px-2 py-1 rounded-lg border border-white/10">
              <span className="text-white font-black text-[9px] md:text-xs italic tracking-tighter uppercase">SPX Hub</span>
            </div>
            {!isOnline && (
              <div className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg border border-white/10 text-white animate-pulse">
                <WifiOff size={10} />
                <span className="text-[8px] font-black uppercase">Offline Mode</span>
              </div>
            )}
            {refreshing && <Loader2 size={12} className="text-white animate-spin" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setEditUserTarget(null); setShowSettings(true); setSettingsTab('profile'); }} className="flex items-center gap-1.5 bg-white/10 p-1 rounded-lg border border-white/5">
              <div className={`w-6 h-6 rounded-md ${getAvatarColor(session.user.name)} flex items-center justify-center overflow-hidden`}>
                {session.user.photoUrl ? <img src={session.user.photoUrl} className="w-full h-full object-cover" /> : <span className="text-[8px] font-black text-white">{getInitials(session.user.name)}</span>}
              </div>
              <span className="text-[9px] font-black text-white hidden sm:block truncate max-w-[60px]">{session.user.nickname || session.user.name.split(' ')[0]}</span>
            </button>
            <button onClick={() => fetchData()} disabled={refreshing || !isOnline} className="p-1.5 bg-white/10 rounded-lg text-white disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button>
            <button onClick={() => { localStorage.removeItem(SESSION_KEY); setSession(null); }} className="p-1.5 bg-black/30 rounded-lg text-white"><LogOut size={14} /></button>
          </div>
        </div>
      </header>

      <div className="bg-black text-white py-2 overflow-hidden border-b border-white/10 relative z-40">
        <div className="max-w-7xl mx-auto px-3 flex items-center gap-3">
           <div className="shrink-0 flex items-center gap-1.5 bg-[#EE4D2D] px-2 py-0.5 rounded-full font-black text-[8px] uppercase italic">
              <Megaphone size={10} /> LIVE
           </div>
           <marquee className="font-black text-[9px] uppercase tracking-widest italic" scrollamount="4">{marqueeText}</marquee>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-3 mt-4 space-y-4">
        {(isShiftLead || isHubLeadOrPIC) && (
           <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                    <Monitor size={14} className="text-[#EE4D2D]" />
                    <h3 className="text-[9px] font-black text-gray-900 uppercase tracking-widest">Team Monitor</h3>
                 </div>
                 <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">{onlineUsers.length} Online</span>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                 {onlineUsers.map(user => (
                   <div key={user.id} className="flex flex-col items-center gap-1 shrink-0">
                      <div className="relative">
                        <div className={`w-9 h-9 rounded-xl ${getAvatarColor(user.name)} flex items-center justify-center text-white font-black text-[10px] border-2 border-white ring-1 ring-emerald-100`}>{getInitials(user.name)}</div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
                      </div>
                      <span className="text-[7px] font-black text-gray-900 uppercase truncate max-w-[45px]">{user.nickname || user.name.split(' ')[0]}</span>
                   </div>
                 ))}
              </div>
           </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Paket', val: stats.pkg, icon: Package, col: 'text-orange-600' },
            { label: 'Tim', val: stats.team, icon: Users, col: 'text-indigo-600' },
            { label: 'Done', val: stats.done, icon: CheckCircle2, col: 'text-emerald-600' },
            { label: 'Todo', val: stats.todo, icon: Clock, col: 'text-slate-700' }
          ].map((s, i) => (
            <div key={i} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
              <div className={`p-1.5 rounded-lg bg-gray-50 ${s.col}`}><s.icon size={16} /></div>
              <div>
                <p className="text-[7px] font-black text-gray-400 uppercase">{s.label}</p>
                <p className="text-sm font-black text-gray-900 leading-none">{s.val}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex gap-1.5">
            <button onClick={() => { setShowSettings(true); setSettingsTab('leave'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 text-[#EE4D2D] font-black text-[9px] uppercase border border-orange-100"><Calendar size={14} /> Cuti</button>
            {(isShiftLead || isHubLeadOrPIC) && (
              <button onClick={() => { setShowSettings(true); setSettingsTab('approvals'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EE4D2D] text-white font-black text-[9px] uppercase relative">
                <CheckSquare size={14} /> Inbox
                {pendingApprovalsCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-black text-white text-[8px] rounded-full flex items-center justify-center font-black animate-bounce">{pendingApprovalsCount}</span>}
              </button>
            )}
            {isAuthorized && <button onClick={() => { setShowSettings(true); setSettingsTab('history'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white font-black text-[9px] uppercase"><Trash size={14} /> Trash</button>}
          </div>
          <div className="flex gap-1.5">
            {canSeeDirectory && <button onClick={() => { setShowSettings(true); setSettingsTab('directory'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black text-white font-black text-[9px] uppercase"><UserPlus size={14} /></button>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Cari..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-3 rounded-xl bg-white border border-gray-100 shadow-sm outline-none font-bold text-xs" />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="shrink-0 p-2 bg-white rounded-xl border border-gray-100 shadow-sm text-[#EE4D2D]">
              <Filter size={14} />
            </div>
            {['All', ...STATIONS].map((hub) => (
              <button
                key={hub}
                onClick={() => setSelectedStation(hub as any)}
                className={`px-4 py-2.5 rounded-xl font-black text-[8px] uppercase tracking-widest whitespace-nowrap transition-all border ${
                  selectedStation === hub 
                    ? 'bg-[#EE4D2D] text-white border-[#EE4D2D] shadow-md shadow-orange-100 active:scale-95' 
                    : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 active:bg-gray-50'
                }`}
              >
                {hub}
              </button>
            ))}
          </div>
        </div>

        {!isOnline && assignments.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-3">
            <WifiOff size={18} className="text-amber-600 shrink-0" />
            <p className="text-[10px] font-bold text-amber-800">Menampilkan data tersimpan. Verifikasi tugas offline tetap berfungsi.</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-16">
          {groupedCouriers.map(group => (
            <div key={group.id} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-col group animate-fade-in relative">
               <div className="flex justify-between items-start mb-3">
                 <div className="bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded-md text-[6px] font-black uppercase tracking-widest">{group.station}</div>
                 <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
               </div>
               <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg ${getAvatarColor(group.courierName)} flex items-center justify-center text-white font-black text-[9px] shrink-0`}>{getInitials(group.courierName)}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-black text-gray-900 uppercase truncate leading-none mb-0.5">{group.courierName}</h4>
                    <p className="text-[7px] font-bold text-gray-400">ID: {group.id}</p>
                  </div>
               </div>
               <button onClick={() => setSelectedGroup(group as any)} className="w-full py-2 bg-black text-white rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5 mt-auto">
                 <QrCode size={10} /> VERIFIKASI
               </button>
            </div>
          ))}
        </div>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/98 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-black p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#EE4D2D]" />
                <h2 className="text-[11px] font-black uppercase italic tracking-tighter">Management HUB</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-1.5 bg-white/10 rounded-lg"><XCircle size={20} /></button>
            </div>
            
            <nav className="flex border-b border-gray-100 bg-white sticky top-0 z-20 overflow-x-auto no-scrollbar shrink-0">
              <button onClick={() => setSettingsTab('profile')} className={`px-4 py-3 font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'profile' ? 'text-[#EE4D2D] border-b-2 border-[#EE4D2D]' : 'text-gray-400'}`}>Profil</button>
              <button onClick={() => setSettingsTab('leave')} className={`px-4 py-3 font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'leave' ? 'text-[#EE4D2D] border-b-2 border-[#EE4D2D]' : 'text-gray-400'}`}>Cuti</button>
              {canSeeDirectory && <button onClick={() => setSettingsTab('directory')} className={`px-4 py-3 font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'directory' ? 'text-[#EE4D2D] border-b-2 border-[#EE4D2D]' : 'text-gray-400'}`}>Team</button>}
              {(isShiftLead || isHubLeadOrPIC) && (
                <button onClick={() => setSettingsTab('approvals')} className={`px-4 py-3 font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'approvals' ? 'text-[#EE4D2D] border-b-2 border-[#EE4D2D]' : 'text-gray-400'} flex items-center gap-1.5`}>
                  Inbox {pendingApprovalsCount > 0 && <span className="bg-[#EE4D2D] text-white px-1 py-0.5 rounded-md text-[6px] font-black">{pendingApprovalsCount}</span>}
                </button>
              )}
              {isAuthorized && <button onClick={() => setSettingsTab('history')} className={`px-4 py-3 font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${settingsTab === 'history' ? 'text-[#EE4D2D] border-b-2 border-[#EE4D2D]' : 'text-gray-400'}`}>Archive</button>}
            </nav>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 no-scrollbar">
              {settingsTab === 'profile' && (
                <div className="max-w-xs mx-auto space-y-4 animate-fade-in text-center">
                   <div className="relative inline-block">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-gray-100 shadow-md overflow-hidden flex items-center justify-center">
                        {session.user.photoUrl ? <img src={session.user.photoUrl} className="w-full h-full object-cover" /> : <div className="text-gray-200 font-black text-3xl">{getInitials(session.user.name)}</div>}
                      </div>
                      <button onClick={() => photoRef.current?.click()} className="absolute -bottom-1 -right-1 bg-black text-white p-1.5 rounded-lg shadow-sm"><Camera size={12} /></button>
                      <input type="file" ref={photoRef} className="hidden" accept="image/*" />
                   </div>
                   <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-left space-y-2">
                      <div>
                        <p className="text-[7px] font-black text-gray-400 uppercase mb-0.5">Nama</p>
                        <p className="font-black text-gray-900 text-xs uppercase">{session.user.name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[7px] font-black text-gray-400 uppercase mb-0.5">Posisi</p>
                          <p className="font-black text-[#EE4D2D] text-[9px] uppercase">{session.user.position}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-gray-400 uppercase mb-0.5">FMS ID</p>
                          <p className="font-mono font-bold text-gray-600 text-[9px]">{session.user.id}</p>
                        </div>
                      </div>
                   </div>
                   <button onClick={() => setShowLeaveForm(true)} className="w-full py-3 bg-orange-50 text-[#EE4D2D] rounded-lg font-black text-[9px] uppercase border border-orange-100">AJUKAN CUTI</button>
                </div>
              )}

              {settingsTab === 'directory' && (
                <div className="space-y-3 animate-fade-in">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input type="text" placeholder="Cari..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 pr-4 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[10px] font-bold" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {filteredUsers.map(u => {
                       const isTargetOnline = onlineUsers.some(ou => ou.id === u.id);
                       const isTargetAuthorized = u.role === 'admin' || u.accessGranted;
                       return (
                        <div key={u.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                             <div className={`w-8 h-8 rounded-lg ${getAvatarColor(u.name)} flex items-center justify-center text-white font-black text-[9px] shrink-0 relative`}>
                               {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : getInitials(u.name)}
                               {isTargetOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white"></div>}
                             </div>
                             <div className="min-w-0">
                                <h4 className="font-black text-gray-900 text-[9px] uppercase truncate">{u.nickname || u.name}</h4>
                                <p className="text-[7px] font-black text-gray-400 uppercase">{u.position}</p>
                             </div>
                             {isTargetAuthorized && <ShieldCheck size={12} className="text-emerald-500 ml-auto" />}
                          </div>
                          <div className="grid grid-cols-2 gap-1 mt-1">
                            {canManageUsers && <button onClick={() => handleOpenEditUser(u)} className="py-1.5 bg-gray-50 text-gray-500 rounded-md font-black text-[6px] uppercase flex items-center justify-center gap-1"><Edit3 size={8} /> Edit</button>}
                            {isAuthorized && u.status === 'Active' && (
                              <button onClick={() => setShowPositionModal({ user: u, type: 'Promotion' })} className="py-1.5 bg-indigo-50 text-indigo-600 rounded-md font-black text-[6px] uppercase">Promosi</button>
                            )}
                            {isAuthorized && <button onClick={() => handleDeleteMember(u.id)} className="col-span-2 py-1.5 bg-red-50 text-red-600 rounded-md font-black text-[6px] uppercase flex items-center justify-center gap-1 disabled:opacity-50" disabled={!isOnline}><UserMinus size={8} /> Hapus Member</button>}
                          </div>
                        </div>
                       );
                    })}
                  </div>
                </div>
              )}

              {settingsTab === 'approvals' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Position Change Approvals (Two-Step Workflow) */}
                  {(isShiftLead || isHubLeadOrPIC) && (
                    <div className="space-y-2">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10} /> Approval Penugasan Tim</p>
                      <div className="grid gap-1.5">
                        {positionChangeRequests.filter(r => r.status === 'Pending' || r.status === 'Approved_L1').map(req => {
                          const canApproveL1 = isShiftLead && req.status === 'Pending';
                          const canApproveFinal = isHubLeadOrPIC && req.status === 'Approved_L1';
                          
                          return (
                            <div key={req.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                 <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600"><TrendingUp size={14} /></div>
                                 <div className="min-w-0">
                                   <p className="text-[9px] font-black text-gray-900 uppercase truncate">{req.targetUserName}</p>
                                   <p className="text-[6px] font-bold text-gray-400 uppercase">{req.oldPosition} → {req.newPosition}</p>
                                   {req.status === 'Approved_L1' && <span className="text-[5px] font-black bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded uppercase">L1 Approved</span>}
                                 </div>
                              </div>
                              <div className="flex gap-1">
                                 <button onClick={() => handleRejectRequest('position', req.id)} className="p-1.5 bg-red-50 text-red-600 rounded-md" disabled={!isOnline}><X size={12} /></button>
                                 {canApproveL1 && <button onClick={() => handleApprovePositionL1(req)} className="p-1.5 bg-indigo-600 text-white rounded-md font-black text-[7px] uppercase px-2 disabled:opacity-50" disabled={!isOnline}>Approve L1</button>}
                                 {canApproveFinal && <button onClick={() => handleApprovePositionFinal(req)} className="p-1.5 bg-black text-white rounded-md font-black text-[7px] uppercase px-2 disabled:opacity-50" disabled={!isOnline}>Final Approve</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Calendar size={10} /> Inbox Cuti</p>
                    <div className="grid gap-1.5">
                      {leaveRequests.filter(r => {
                        if (isHubLeadOrPIC) return r.status === 'Approved_L1' || (r.status === 'Pending' && allUsers.find(u => u.id === r.courierId)?.position.toUpperCase().includes('SHIFT LEAD'));
                        if (isShiftLead) return r.status === 'Pending' && !allUsers.find(u => u.id === r.courierId)?.position.toUpperCase().includes('SHIFT LEAD');
                        return false;
                      }).map(req => (
                        <div key={req.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                             <div className="p-1.5 rounded-lg bg-orange-50 text-[#EE4D2D]"><Calendar size={14} /></div>
                             <div className="min-w-0">
                               <p className="text-[9px] font-black text-gray-900 uppercase truncate">{req.courierName}</p>
                               <p className="text-[6px] font-bold text-gray-400 uppercase">{req.duration}</p>
                             </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                             <button onClick={() => handleRejectRequest('leave', req.id)} className="p-1.5 bg-red-50 text-red-600 rounded-md" disabled={!isOnline}><X size={12} /></button>
                             {isShiftLead && req.status === 'Pending' && <button onClick={() => handleApproveLeaveL1(req.id)} className="p-1.5 bg-indigo-600 text-white rounded-md disabled:opacity-50" disabled={!isOnline}><Check size={12} /></button>}
                             {isHubLeadOrPIC && <button onClick={() => handleApproveLeaveFinal(req.id)} className="p-1.5 bg-black text-white rounded-md disabled:opacity-50" disabled={!isOnline}><Check size={12} /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-white border-t border-gray-100 flex justify-center shrink-0">
               <button onClick={() => setShowSettings(false)} className="w-full py-3 bg-gray-100 text-gray-900 rounded-xl font-black text-[8px] uppercase tracking-widest transition-all">TUTUP</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Task QR Modal --- */}
      {selectedGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/90 backdrop-blur-lg animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-[280px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-[#EE4D2D] p-3 text-white flex justify-between items-center shrink-0">
              <div>
                <p className="text-[7px] font-black uppercase opacity-70 mb-0.5">{selectedGroup.station}</p>
                <h2 className="text-[10px] font-black uppercase truncate max-w-[150px]">{selectedGroup.courierName}</h2>
              </div>
              <button onClick={() => setSelectedGroup(null)}><XCircle size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 no-scrollbar">
              {selectedGroup.tasks.map(t => (
                <div key={t.taskId} className="bg-white rounded-xl p-3 border border-gray-100 flex flex-col items-center gap-3 shadow-sm">
                  <div className="w-full">
                    <p className="text-[7px] font-black text-gray-400 uppercase">Token</p>
                    <h4 className="text-[10px] font-black text-gray-900 font-mono leading-none">{t.taskId}</h4>
                  </div>
                  <div className="p-3 border-4 border-black rounded-xl bg-white shadow-md">
                    <QRCodeSVG value={t.taskId} size={150} level="H" includeMargin={true} />
                  </div>
                  <button onClick={() => handleCompleteTask(t.id, t.taskId, t.station)} disabled={isSaving || !isOnline} className="w-full bg-[#EE4D2D] text-white py-2 rounded-lg font-black text-[8px] uppercase flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {isSaving ? <Loader2 className="animate-spin" size={10} /> : <Scan size={10} />} KONFIRMASI
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPositionModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-[280px] p-5 shadow-2xl space-y-4">
             <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600"><TrendingUp size={20} /></div>
                   <h2 className="text-[10px] font-black uppercase italic">Posisi</h2>
                </div>
                <button onClick={() => setShowPositionModal(null)}><XCircle size={18} /></button>
             </div>
             <div className="bg-gray-50 p-2 rounded-lg">
                <p className="text-[6px] font-black text-gray-400 uppercase">Member</p>
                <p className="font-black text-gray-900 text-[9px] uppercase">{showPositionModal.user.name}</p>
             </div>
             <input type="text" value={posNewValue} onChange={(e) => setPosNewValue(e.target.value)} className="w-full p-2 rounded-lg bg-gray-50 text-[9px] font-black uppercase border border-gray-100" placeholder="Posisi Baru..." />
             <textarea value={posReason} onChange={(e) => setPosReason(e.target.value)} className="w-full p-2 rounded-lg bg-gray-50 text-[9px] h-12 resize-none font-bold" placeholder="Alasan..." />
             <button onClick={requestPositionChange} disabled={!posNewValue || !posReason || !isOnline} className="w-full py-2.5 bg-black text-white rounded-lg font-black text-[8px] uppercase disabled:opacity-50">KONFIRMASI</button>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 mt-8 pb-8 text-center opacity-30 select-none">
        <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">@Ndiioo Hub System</p>
        <p className="text-[6px] font-bold text-gray-300 uppercase tracking-tighter leading-none">v5.5.0 • OFFLINE SYNC ENABLED</p>
      </footer>
    </div>
  );
};

export default App;
