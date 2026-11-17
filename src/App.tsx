import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import {
  AppRoute,
  AuthSettings,
  CategoryItem,
  MemberInvite,
  ProjectMember,
  TaskCategory,
  TaskItem,
  TaskStatus,
  UserRole,
} from './types/project';
import {
  addCommentInFirestore,
  archiveOrRestoreTaskInFirestore,
  assignMemberToTasksInFirestore,
  AuthResolutionResult,
  bootstrapOwnerAdmin,
  createCategoryInFirestore,
  createOrUpdateInvite,
  createTaskInFirestore,
  deleteUnusedCategoryInFirestore,
  importOfficialTasksToFirestore,
  removeInviteInFirestore,
  resolveUserMembership,
  seedDefaultCategories,
  subscribeAuthSettings,
  subscribeCategories,
  subscribeInvites,
  subscribeTasks,
  subscribeUsers,
  swapCategoryOrderInFirestore,
  updateCategoryInFirestore,
  updateInviteInFirestore,
  updateMemberInFirestore,
  updateOpenGoogleLoginSetting,
  updateTaskInFirestore,
  verifyOfficialImportInFirestore,
} from './services/firestoreService';
import {
  OfficialImportPlanItem,
  OfficialImportSummary,
} from './utils/officialImport';
import { exportTasksToCSV } from './utils/taskHelpers';
import { TbhgnLogo } from './components/TbhgnLogo';
import { AuthGate } from './components/AuthGate';
import { OverviewView } from './components/OverviewView';
import { TasksView } from './components/TasksView';
import { MyTasksView } from './components/MyTasksView';
import { MembersView } from './components/MembersView';
import { CategoriesView } from './components/CategoriesView';
import { ImportPreviewView } from './components/ImportPreviewView';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { NewTaskModal } from './components/NewTaskModal';

interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

function formatActionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith('CONFLICT:')) {
    return raw.slice('CONFLICT:'.length).trim();
  }
  if (raw.startsWith('PREFLIGHT:')) {
    return raw.slice('PREFLIGHT:'.length).trim();
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      errorCode?: string;
      operationType?: string;
      path?: string;
    };
    if (parsed.error) {
      const codePrefix = parsed.errorCode ? `[${parsed.errorCode}] ` : '';
      const loc =
        parsed.operationType || parsed.path
          ? ` (${[parsed.operationType, parsed.path].filter(Boolean).join(' @ ')})`
          : '';
      return `${codePrefix}${parsed.error}${loc}`;
    }
  } catch {
    // Plain error string
  }
  return raw;
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [resolution, setResolution] = useState<AuthResolutionResult | null>(
    null
  );
  const [authError, setAuthError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invites, setInvites] = useState<MemberInvite[]>([]);
  const [authSettings, setAuthSettings] = useState<AuthSettings>({
    allowOpenGoogleLogin: false,
  });

  const [route, setRoute] = useState<AppRoute>('overview');
  const [adminTab, setAdminTab] = useState<'members' | 'categories' | 'import'>('members');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskParentId, setNewTaskParentId] = useState<
    string | null | undefined
  >(undefined);
  const [tasksFilterPreset, setTasksFilterPreset] = useState<{
    status?: string;
    categoryId?: string;
    reviewOnly?: boolean;
    key: number;
  }>({ key: 0 });
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 5200);
  }, []);

  const verifyMembership = useCallback(async (user: User) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await resolveUserMembership(user);
      setResolution(res);
    } catch (err) {
      setResolution(null);
      setAuthError(formatActionError(err));
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      setAuthError(formatActionError(err));
    });

    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setResolution(null);
        setTasks([]);
        setCategories([]);
        setMembers([]);
        setInvites([]);
        setAuthSettings({ allowOpenGoogleLogin: false });
        setSelectedTaskId(null);
        setAuthLoading(false);
        return;
      }
      await verifyMembership(user);
    });

    return () => unsub();
  }, [verifyMembership]);

  const currentUser = useMemo(() => {
    if (resolution?.status === 'active') return resolution.profile;
    return null;
  }, [resolution]);

  // Real-time listener on own /users/{uid} doc to reflect role or lock changes immediately
  useEffect(() => {
    if (!authUser || resolution?.status !== 'active') return;
    const unsubSelf = onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setResolution({
            status: 'unauthorized',
            email: authUser.email || '',
          });
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        const updatedProfile: ProjectMember = {
          uid: snap.id,
          displayName: String(d.displayName ?? ''),
          email: String(d.email ?? ''),
          role: (d.role as UserRole) ?? 'viewer',
          canApprove: Boolean(d.canApprove),
          isActive: Boolean(d.isActive),
          sheetAlias: String(d.sheetAlias ?? ''),
          createdAt: resolution.profile.createdAt,
        };
        if (!updatedProfile.isActive) {
          setResolution({ status: 'locked', profile: updatedProfile });
        } else {
          setResolution({ status: 'active', profile: updatedProfile });
        }
      },
      (err) => {
        console.warn('Self profile listener warning:', err);
      }
    );
    return () => unsubSelf();
  }, [authUser, resolution?.status]);

  // Real-time Firestore data listeners for authenticated active members
  useEffect(() => {
    if (!currentUser || !currentUser.isActive) {
      setTasks([]);
      setCategories([]);
      setMembers([]);
      setInvites([]);
      setAuthSettings({ allowOpenGoogleLogin: false });
      return;
    }

    const unsubTasks = subscribeTasks(setTasks, (err) => {
      showToast('error', formatActionError(err));
    });
    const unsubCategories = subscribeCategories(setCategories, (err) => {
      showToast('error', formatActionError(err));
    });

    let unsubUsers: (() => void) | undefined;
    let unsubInvites: (() => void) | undefined;
    let unsubAuthSettings: (() => void) | undefined;

    if (currentUser.role === 'admin') {
      unsubUsers = subscribeUsers(setMembers, (err) => {
        showToast('error', formatActionError(err));
      });
      unsubInvites = subscribeInvites(setInvites, (err) => {
        showToast('error', formatActionError(err));
      });
      unsubAuthSettings = subscribeAuthSettings(setAuthSettings, (err) => {
        showToast('error', formatActionError(err));
      });
    } else {
      setMembers([currentUser]);
      setInvites([]);
      setAuthSettings({ allowOpenGoogleLogin: false });
    }

    return () => {
      unsubTasks();
      unsubCategories();
      if (unsubUsers) unsubUsers();
      if (unsubInvites) unsubInvites();
      if (unsubAuthSettings) unsubAuthSettings();
    };
  }, [currentUser?.uid, currentUser?.role, currentUser?.isActive, showToast]);

  const handleSignInPopup = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request'
      ) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setAuthError(
        err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google.'
      );
    }
  };

  const handleSignInRedirect = async () => {
    setAuthError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Không thể chuyển hướng đăng nhập Google.'
      );
    }
  };

  const handleBootstrapAdmin = async (sheetAlias: string) => {
    if (!authUser) return;
    setAuthError(null);
    try {
      const profile = await bootstrapOwnerAdmin(authUser, sheetAlias);
      setResolution({ status: 'active', profile });
      showToast('success', 'Đã khởi tạo Quản trị viên đầu tiên trên Firestore.');
    } catch (err) {
      setAuthError(formatActionError(err));
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => t.id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  const handleSaveTask = async (
    taskId: string,
    patch: Partial<TaskItem>,
    expectedVersion: number
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) {
      return { ok: false, error: 'Phiên đăng nhập không hợp lệ.' };
    }
    try {
      const { newVersion } = await updateTaskInFirestore(
        taskId,
        patch,
        expectedVersion,
        currentUser
      );
      showToast('success', `Đã lưu lên Firestore (v${newVersion})`);
      return { ok: true };
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      return { ok: false, error: msg };
    }
  };

  const handleQuickUpdate = async (
    taskId: string,
    patch: Partial<Pick<TaskItem, 'status' | 'nextStep'>>,
    expectedVersion: number
  ): Promise<{ ok: boolean; error?: string }> => {
    return await handleSaveTask(taskId, patch, expectedVersion);
  };

  const handleAddComment = async (
    taskId: string,
    content: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) {
      return { ok: false, error: 'Phiên đăng nhập không hợp lệ.' };
    }
    try {
      await addCommentInFirestore(taskId, content, currentUser);
      showToast('success', 'Đã đăng góp ý lên Firestore');
      return { ok: true };
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      return { ok: false, error: msg };
    }
  };

  const handleCreateTask = async (input: {
    displayCode: string;
    title: string;
    parentId: string | null;
    categoryId: string | null;
    category: TaskCategory | null;
    assignees: string[];
    assigneeUids: string[];
    status: TaskStatus | null;
    nextStep: string | null;
    dueDate: string | null;
  }) => {
    if (!currentUser) return;
    const maxSort = tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1);

    try {
      await createTaskInFirestore(
        {
          ...input,
          sortOrder: maxSort + 1,
        },
        currentUser
      );
      showToast('success', `Đã tạo công việc ${input.displayCode}`);
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      throw new Error(msg);
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await archiveOrRestoreTaskInFirestore(taskId, true, currentUser);
      setSelectedTaskId(null);
      showToast('success', 'Đã lưu trữ công việc');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleRestoreTask = async (taskId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await archiveOrRestoreTaskInFirestore(taskId, false, currentUser);
      showToast('success', 'Đã khôi phục công việc');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleToggleOpenGoogleLogin = async (allowOpen: boolean) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await updateOpenGoogleLoginSetting(allowOpen, currentUser);
      showToast(
        'success',
        allowOpen
          ? 'Đã bật cho phép người mới đăng nhập Google ở quyền Viewer'
          : 'Đã tắt đăng nhập mở cho tài khoản chưa được mời'
      );
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleSeedDefaultCategories = async () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const count = await seedDefaultCategories(currentUser);
      showToast(
        'success',
        count > 0
          ? `Đã khởi tạo ${count} hạng mục mặc định TBHGN`
          : '3 hạng mục mặc định đã tồn tại.'
      );
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleCreateCategory = async (input: {
    name: string;
    color: string;
    sortOrder: number;
  }) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await createCategoryInFirestore(input, currentUser);
      showToast('success', `Đã thêm hạng mục "${input.name}"`);
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleUpdateCategory = async (
    categoryId: string,
    patch: Partial<Pick<CategoryItem, 'name' | 'color' | 'sortOrder' | 'isActive'>>
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await updateCategoryInFirestore(categoryId, patch, currentUser);
      showToast('success', 'Đã cập nhật hạng mục');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleSwapCategoryOrder = async (
    catA: CategoryItem,
    catB: CategoryItem
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await swapCategoryOrderInFirestore(catA, catB, currentUser);
      showToast('success', 'Đã cập nhật thứ tự hạng mục');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleDeleteUnusedCategory = async (categoryId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await deleteUnusedCategoryInFirestore(categoryId, tasks);
      showToast('success', 'Đã xóa hạng mục chưa sử dụng');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleAddInvite = async (input: {
    displayName: string;
    email: string;
    role: UserRole;
    canApprove: boolean;
    sheetAlias: string;
  }) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await createOrUpdateInvite(input, currentUser);
      showToast('success', `Đã cấp quyền cho ${input.email}`);
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleUpdateMember = async (
    uid: string,
    email: string,
    patch: Partial<
      Pick<ProjectMember, 'role' | 'canApprove' | 'isActive' | 'sheetAlias' | 'displayName'>
    >
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await updateMemberInFirestore(uid, email, patch);
      showToast('success', 'Đã cập nhật thông tin thành viên');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleUpdateInvite = async (
    email: string,
    patch: Partial<Pick<MemberInvite, 'role' | 'canApprove' | 'isActive'>>
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await updateInviteInFirestore(email, patch);
      showToast('success', 'Đã cập nhật lời mời');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleDeleteInvite = async (email: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      await removeInviteInFirestore(email);
      showToast('success', 'Đã thu hồi lời mời');
    } catch (err) {
      showToast('error', formatActionError(err));
    }
  };

  const handleAssignTasksToMember = async (
    member: ProjectMember,
    taskIds: string[]
  ): Promise<{ updatedCount: number; skippedCount: number }> => {
    if (!currentUser || currentUser.role !== 'admin' || !currentUser.isActive) {
      throw new Error('Chỉ Quản trị viên đang hoạt động mới được giao công việc.');
    }
    try {
      const result = await assignMemberToTasksInFirestore(
        member,
        taskIds,
        currentUser
      );
      if (result.updatedCount > 0) {
        showToast(
          'success',
          `Đã giao ${result.updatedCount} công việc cho ${member.displayName}`
        );
      } else {
        showToast(
          'success',
          'Không có công việc mới cần gán thêm (các việc chọn đã được gán trước đó).'
        );
      }
      return result;
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      throw new Error(msg);
    }
  };

  const handleExportCSV = () => {
    const csv = exportTasksToCSV(tasks, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TBHGN_firestore_sao_luu_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Đã xuất file sao lưu CSV');
  };

  const handleExportJSON = () => {
    if (!currentUser || currentUser.role !== 'admin' || !currentUser.isActive) {
      showToast('error', 'Chỉ Quản trị viên mới được xuất toàn bộ dữ liệu JSON.');
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      categories,
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TBHGN_firestore_sao_luu_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Đã xuất file sao lưu JSON');
  };

  if (authLoading || !authUser || !currentUser) {
    return (
      <AuthGate
        loading={authLoading}
        authEmail={authUser?.email ?? null}
        resolution={resolution}
        authError={authError}
        onSignInPopup={handleSignInPopup}
        onSignInRedirect={handleSignInRedirect}
        onBootstrapAdmin={handleBootstrapAdmin}
        onSignOut={handleSignOut}
        onRetryCheck={() =>
          authUser ? verifyMembership(authUser) : Promise.resolve()
        }
      />
    );
  }

  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;

  const navItems: Array<{
    id: AppRoute;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'overview',
      label: 'Tổng quan',
      shortLabel: 'Tổng quan',
      icon: LayoutDashboard,
    },
    {
      id: 'tasks',
      label: 'Công việc',
      shortLabel: 'Công việc',
      icon: ClipboardList,
    },
    {
      id: 'my-tasks',
      label: 'Việc của tôi',
      shortLabel: 'Của tôi',
      icon: UserCheck,
    },
    {
      id: 'members',
      label: 'Thành viên',
      shortLabel: 'Thành viên',
      icon: Users,
    },
  ];

  const roleDisplay =
    currentUser.role === 'admin'
      ? 'Admin'
      : currentUser.role === 'member'
      ? 'Member'
      : 'Viewer';

  const categoriesPanel = isAdmin ? (
    <CategoriesView
      categories={categories}
      tasks={tasks}
      currentUser={currentUser}
      onSeedDefaults={handleSeedDefaultCategories}
      onCreateCategory={handleCreateCategory}
      onUpdateCategory={handleUpdateCategory}
      onSwapOrder={handleSwapCategoryOrder}
      onDeleteUnusedCategory={handleDeleteUnusedCategory}
      onSelectTask={(id) => setSelectedTaskId(id)}
      onFilterTasksByCategory={(categoryId) => {
        setTasksFilterPreset({
          categoryId,
          key: Date.now(),
        });
        setRoute('tasks');
      }}
    />
  ) : null;

  const handleExecuteOfficialImport = async (
    items: OfficialImportPlanItem[],
    summary: OfficialImportSummary
  ) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Chỉ Quản trị viên mới được nhập dữ liệu chính thức.');
    }
    try {
      const result = await importOfficialTasksToFirestore(
        items,
        summary,
        currentUser
      );
      showToast(
        'success',
        result.importedCount > 0
          ? `Đã nhập ${result.importedCount} công việc chính thức vào Firestore (bỏ qua ${result.skippedIds.length} bản ghi đã tồn tại).`
          : `Không ghi thêm bản ghi mới (đã bỏ qua ${result.skippedIds.length} bản ghi tồn tại sẵn).`
      );
      return result;
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      throw new Error(msg);
    }
  };

  const handleVerifyOfficialFirestore = async (expectedIds: string[]) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Chỉ Quản trị viên mới được đối chiếu trực tiếp Firestore.');
    }
    try {
      const verification = await verifyOfficialImportInFirestore(expectedIds);
      showToast(
        verification.allChecksPassed ? 'success' : 'error',
        verification.allChecksPassed
          ? `Đối chiếu Firestore thật đạt 20/20 công việc và ${verification.resultUrlCount}/13 URL.`
          : `Đối chiếu Firestore thật có sai lệch: ${verification.mismatches.join(' ')}`
      );
      return verification;
    } catch (err) {
      const msg = formatActionError(err);
      showToast('error', msg);
      throw new Error(msg);
    }
  };

  const importPanel = isAdmin ? (
    <ImportPreviewView
      existingTasks={tasks}
      existingCategories={categories}
      currentUser={currentUser}
      onNavigateToCategories={() => setAdminTab('categories')}
      onExecuteImport={handleExecuteOfficialImport}
      onVerifyLiveFirestore={handleVerifyOfficialFirestore}
    />
  ) : null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F8FA] text-[#0F172A] overflow-x-hidden">
      {/* Desktop Sidebar (240px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-[#13294B] text-white border-r border-[#0F203C]">
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-white/10 shrink-0">
          <TbhgnLogo size={30} className="shrink-0" />
          <span className="text-sm font-bold tracking-tight whitespace-nowrap truncate">
            TBHGN
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Điều hướng chính">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              route === item.id &&
              !(item.id === 'members' && adminTab !== 'members');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setRoute(item.id);
                  if (item.id === 'members') setAdminTab('members');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white/15 text-[#F5D77F]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRoute('members');
                  setAdminTab('categories');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  route === 'members' && adminTab === 'categories'
                    ? 'bg-white/15 text-[#F5D77F]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <FolderKanban className="w-4 h-4 shrink-0" />
                <span>Quản lý hạng mục</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRoute('members');
                  setAdminTab('import');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  route === 'members' && adminTab === 'import'
                    ? 'bg-white/15 text-[#F5D77F]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Nhập dữ liệu dự án</span>
              </button>
            </>
          )}
        </nav>

        {/* Signed-in Google Profile, Export & Logout */}
        <div className="p-3 border-t border-white/10 space-y-2.5 text-xs">
          <div className="px-2.5 py-2 rounded-lg bg-[#0E203B] border border-white/10 space-y-0.5">
            <div className="font-semibold text-white truncate">
              {currentUser.displayName}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {currentUser.email}
            </div>
            <div className="text-[11px] text-[#F5D77F]">
              {roleDisplay}
              {currentUser.canApprove && currentUser.role !== 'admin'
                ? ' · Được duyệt'
                : ''}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 transition-colors"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="px-2.5 py-2 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col lg:pl-60 min-w-0">
        {/* Compact Top Bar (52px) */}
        <header className="sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-sm border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:hidden min-w-0">
            <TbhgnLogo size={28} className="shrink-0" />
            <span className="text-sm font-bold text-[#13294B] whitespace-nowrap">
              TBHGN
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span className="font-semibold text-[#13294B]">TBHGN</span>
            <span aria-hidden="true">/</span>
            <span>
              {route === 'members' && adminTab === 'categories'
                ? 'Quản lý hạng mục'
                : route === 'members' && adminTab === 'import'
                ? 'Nhập dữ liệu dự án'
                : navItems.find((n) => n.id === route)?.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="lg:hidden text-xs font-medium text-slate-700 max-w-[110px] truncate">
              {currentUser.displayName}
            </span>

            <button
              type="button"
              onClick={handleExportCSV}
              aria-label="Xuất dữ liệu sao lưu CSV"
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#13294B] bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 min-h-[40px] min-w-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xuất CSV</span>
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Đăng xuất"
              className="lg:hidden inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg min-h-[40px] min-w-[40px]"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Main Viewport Content */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-8">
          {route === 'overview' && (
            <OverviewView
              tasks={tasks}
              categories={categories}
              currentUser={currentUser}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onNavigateToTasks={(preset) => {
                setTasksFilterPreset({
                  status: preset?.status,
                  reviewOnly: preset?.reviewOnly,
                  key: Date.now(),
                });
                setRoute('tasks');
              }}
            />
          )}

          {route === 'tasks' && (
            <TasksView
              key={tasksFilterPreset.key}
              tasks={tasks}
              categories={categories}
              currentUser={currentUser}
              initialStatusFilter={tasksFilterPreset.status ?? 'all'}
              initialCategoryFilter={tasksFilterPreset.categoryId ?? 'all'}
              initialReviewOnly={tasksFilterPreset.reviewOnly ?? false}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onOpenNewTask={(parentId) => setNewTaskParentId(parentId ?? null)}
            />
          )}

          {route === 'my-tasks' && (
            <MyTasksView
              tasks={tasks}
              categories={categories}
              currentUser={currentUser}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onNavigateToTasks={() => setRoute('tasks')}
              onQuickUpdate={handleQuickUpdate}
            />
          )}

          {route === 'members' && (
            <MembersView
              members={members}
              invites={invites}
              tasks={tasks}
              currentUser={currentUser}
              authSettings={authSettings}
              adminTab={adminTab}
              onChangeAdminTab={setAdminTab}
              categoriesPanel={categoriesPanel}
              importPanel={importPanel}
              onToggleOpenGoogleLogin={handleToggleOpenGoogleLogin}
              onAssignTasksToMember={handleAssignTasksToMember}
              onAddInvite={handleAddInvite}
              onUpdateMember={handleUpdateMember}
              onUpdateInvite={handleUpdateInvite}
              onDeleteInvite={handleDeleteInvite}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Điều hướng di động"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 min-h-[56px] pb-[env(safe-area-inset-bottom)] bg-white/95 backdrop-blur-sm border-t border-slate-200 grid grid-cols-4"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.id)}
              className={`min-h-[54px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-[#13294B]' : 'text-slate-500'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  active ? 'text-[#13294B]' : 'text-slate-400'
                }`}
              />
              <span className="truncate max-w-full px-1">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Task Detail Slide-Over / Sheet */}
      <TaskDetailDrawer
        task={selectedTask}
        allTasks={tasks}
        categories={categories}
        currentUser={currentUser}
        members={members}
        onClose={() => setSelectedTaskId(null)}
        onSelectTask={(id) => setSelectedTaskId(id)}
        onSaveTask={handleSaveTask}
        onAddComment={handleAddComment}
        onOpenAddSubtask={(parentId) => setNewTaskParentId(parentId)}
        onArchiveTask={handleArchiveTask}
        onRestoreTask={handleRestoreTask}
      />

      {/* New Task Modal */}
      <NewTaskModal
        isOpen={newTaskParentId !== undefined}
        defaultParentId={newTaskParentId ?? null}
        tasks={tasks}
        members={members}
        categories={categories}
        currentUser={currentUser}
        onClose={() => setNewTaskParentId(undefined)}
        onCreateTask={handleCreateTask}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-[4.5rem] lg:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-50 sm:max-w-md px-3.5 py-2.5 rounded-xl border shadow-lg flex items-center gap-2.5 text-xs font-medium ${
            toast.type === 'success'
              ? 'bg-[#13294B] text-white border-[#0E203B]'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1 break-words">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
            className="min-w-[32px] min-h-[32px] flex items-center justify-center opacity-75 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
