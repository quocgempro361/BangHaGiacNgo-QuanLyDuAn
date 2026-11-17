import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import {
  CategoryItem,
  ProjectMember,
  TaskCategory,
  TaskItem,
  TaskStatus,
} from '../types/project';
import {
  ALL_STATUSES,
  canBeParent,
  canUserCreateSubtaskInParent,
  getEffectiveCategory,
  isB1TestTask,
} from '../utils/taskHelpers';

interface NewTaskModalProps {
  isOpen: boolean;
  defaultParentId: string | null;
  tasks: TaskItem[];
  members: ProjectMember[];
  categories: CategoryItem[];
  currentUser: ProjectMember;
  onClose: () => void;
  onCreateTask: (input: {
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
  }) => Promise<void>;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  defaultParentId,
  tasks,
  members,
  categories,
  currentUser,
  onClose,
  onCreateTask,
}) => {
  const isManager =
    (currentUser.role === 'admin' || currentUser.role === 'moderator') &&
    currentUser.isActive;
  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  // Admin & Moderator see all active official parent tasks; Member sees ONLY active official parent tasks assigned to their UID
  const eligibleParents = useMemo(() => {
    return tasks
      .filter((t) => !isB1TestTask(t) && t.parentId === null && !t.archivedAt)
      .filter((p) => canUserCreateSubtaskInParent(currentUser, p));
  }, [tasks, currentUser]);

  const initialParentId = useMemo(() => {
    if (defaultParentId && eligibleParents.some((p) => p.id === defaultParentId)) {
      return defaultParentId;
    }
    if (isManager) return defaultParentId ?? '';
    return eligibleParents[0]?.id ?? '';
  }, [defaultParentId, eligibleParents, isManager]);

  const [parentId, setParentId] = useState<string>(initialParentId);
  const [displayCode, setDisplayCode] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [customAssigneeNote, setCustomAssigneeNote] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Chưa bắt đầu');
  const [nextStep, setNextStep] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedParent = useMemo(
    () => eligibleParents.find((p) => p.id === parentId) ?? null,
    [eligibleParents, parentId]
  );

  useEffect(() => {
    if (!isOpen) return;
    const nextParent =
      defaultParentId && eligibleParents.some((p) => p.id === defaultParentId)
        ? defaultParentId
        : isManager
        ? defaultParentId ?? ''
        : eligibleParents[0]?.id ?? '';
    setParentId(nextParent);
    setDisplayCode('');
    setTitle('');
    if (nextParent) {
      const pObj = eligibleParents.find((p) => p.id === nextParent);
      setCategoryId(pObj?.categoryId ?? '');
    } else {
      setCategoryId(activeCategories[0]?.id ?? '');
    }
    setAssigneeUids(isManager ? [] : [currentUser.uid]);
    setCustomAssigneeNote('');
    setStatus('Chưa bắt đầu');
    setNextStep('');
    setDueDate('');
    setError(null);
    setSubmitting(false);
  }, [isOpen, defaultParentId, isManager, currentUser.uid]);

  // Inherit parent's categoryId automatically when parent selection changes
  useEffect(() => {
    if (!isOpen) return;
    if (selectedParent) {
      setCategoryId(selectedParent.categoryId ?? '');
    }
  }, [selectedParent?.id, selectedParent?.categoryId, isOpen]);

  if (!isOpen) return null;

  const memberCannotCreate = !isManager && eligibleParents.length === 0;

  const suggestedCode = (() => {
    const visibleTasks = tasks.filter((t) => !isB1TestTask(t) && !t.archivedAt);
    if (!parentId) {
      const allParentsCount = visibleTasks.filter(
        (t) => t.parentId === null
      ).length;
      return `${allParentsCount + 1}`;
    }
    const siblings = visibleTasks.filter((t) => t.parentId === parentId);
    return selectedParent
      ? `${selectedParent.displayCode}.${siblings.length + 1}`
      : '1.1';
  })();

  const toggleUid = (uid: string) => {
    setAssigneeUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || memberCannotCreate) return;
    setError(null);

    const cleanParentId = parentId || null;
    if (!isManager && !cleanParentId) {
      setError(
        'Thành viên chỉ được tạo việc con trực thuộc một nhóm việc cha đã được phân công theo UID.'
      );
      return;
    }

    const validation = canBeParent(cleanParentId, null, tasks);
    if (!validation.ok) {
      setError(validation.reason || 'Quan hệ cha-con không hợp lệ.');
      return;
    }
    if (!title.trim()) {
      setError('Vui lòng nhập tên đầu việc.');
      return;
    }

    const effectiveCatId = cleanParentId
      ? isManager
        ? categoryId || selectedParent?.categoryId || null
        : selectedParent?.categoryId || null
      : categoryId || null;

    const matchedCategory = categories.find((c) => c.id === effectiveCatId);

    const resolvedUids = isManager ? assigneeUids : [currentUser.uid];
    const uidNames = resolvedUids
      .map((uid) => {
        const matched =
          members.find((m) => m.uid === uid) ??
          (uid === currentUser.uid ? currentUser : undefined);
        return matched
          ? matched.displayName || matched.sheetAlias || matched.email
          : '';
      })
      .filter((n): n is string => Boolean(n));
    const extraNames = isManager
      ? customAssigneeNote
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const displayNames = Array.from(new Set([...uidNames, ...extraNames]));

    setSubmitting(true);
    try {
      await onCreateTask({
        displayCode: displayCode.trim() || suggestedCode,
        title: title.trim(),
        parentId: cleanParentId,
        categoryId: effectiveCatId,
        category: matchedCategory?.name ?? null,
        assignees: displayNames,
        assigneeUids: resolvedUids,
        status,
        nextStep: nextStep.trim() || null,
        dueDate: dueDate || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo công việc.');
    } finally {
      setSubmitting(false);
    }
  };

  const parentCatMeta = selectedParent
    ? getEffectiveCategory(selectedParent, tasks, categories)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-huyen-lam/45 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isManager ? 'Thêm đầu việc mới' : 'Thêm việc con'}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-nga-xam shadow-xl overflow-hidden">
        <div className="px-4 py-3 bg-nga-thien border-b border-nga-xam flex items-center justify-between">
          <h2 className="text-base font-semibold text-huyen-lam">
            {!isManager || parentId ? 'Thêm việc con' : 'Thêm đầu việc mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-huyen-lam transition-colors"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {memberCannotCreate ? (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-minh-kim-soft border border-minh-kim-border text-xs sm:text-sm text-minh-kim-ink flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Chưa có nhóm việc cha được phân công cho bạn
                </div>
                <p>
                  Tài khoản Thành viên chỉ được tạo <strong>việc con</strong> thuộc nhóm việc cha mà bạn đang phụ trách. Vui lòng liên hệ Quản trị viên để được phân công vào nhóm cha trước.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold bg-huyen-lam text-nga-thien rounded-lg hover:bg-lam-tri-tue transition-colors min-h-[42px]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3.5 max-h-[82dvh] overflow-y-auto"
          >
            {error && (
              <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-huyen-lam mb-1">
                {isManager
                  ? 'Cấp công việc (tối đa 2 cấp)'
                  : 'Thuộc nhóm việc cha được phân quyền'}
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
              >
                {isManager && <option value="">Đầu việc cha (cấp 1)</option>}
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    Việc con của: {p.displayCode}. {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Mã hiển thị
                </label>
                <input
                  type="text"
                  maxLength={24}
                  value={displayCode}
                  onChange={(e) => setDisplayCode(e.target.value)}
                  placeholder={suggestedCode}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-nga-xam rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Tên đầu việc
                </label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tên công việc..."
                  className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Hạng mục{' '}
                  {parentId && !isManager && '(kế thừa từ việc cha)'}
                </label>
                {parentId && !isManager ? (
                  <div className="px-3 py-2 text-sm bg-nga-thien border border-nga-xam rounded-lg text-huyen-lam min-h-[42px] flex items-center">
                    {parentCatMeta?.category || 'Chưa phân hạng mục'}
                  </div>
                ) : (
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                  >
                    <option value="">
                      {parentId && parentCatMeta?.category
                        ? `Mặc định kế thừa (${parentCatMeta.category})`
                        : '-- Chưa phân hạng mục --'}
                    </option>
                    {activeCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Trạng thái ban đầu
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg text-huyen-lam focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                >
                  {ALL_STATUSES.filter((s) => s !== 'Hoàn thành').map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isManager ? (
              <div className="space-y-2 p-3 bg-nga-thien border border-nga-xam rounded-lg">
                <div className="text-xs font-semibold text-huyen-lam">
                  Phân công theo tài khoản Firebase UID (quyết định quyền sửa)
                </div>
                {members.filter((m) => m.isActive).length === 0 ? (
                  <p className="text-xs text-ink-muted">
                    Chưa có thành viên hoạt động nào khác.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((m) => m.isActive)
                      .map((m) => (
                        <label
                          key={m.uid}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white border border-nga-xam rounded-lg cursor-pointer hover:border-lam-tri-tue/50"
                        >
                          <input
                            type="checkbox"
                            checked={assigneeUids.includes(m.uid)}
                            onChange={() => toggleUid(m.uid)}
                            className="accent-huyen-lam"
                          />
                          <span>
                            {m.displayName}
                            {m.sheetAlias && m.sheetAlias !== m.displayName
                              ? ` (${m.sheetAlias})`
                              : ''}
                          </span>
                        </label>
                      ))}
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-ink-muted mb-1">
                    Nhãn tên hiển thị bổ sung (tùy chọn, không cấp quyền)
                  </label>
                  <input
                    type="text"
                    value={customAssigneeNote}
                    onChange={(e) => setCustomAssigneeNote(e.target.value)}
                    placeholder="VD: Nhóm"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue"
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-muted bg-nga-thien border border-nga-xam rounded-lg px-3 py-2">
                Người phụ trách (gắn UID của bạn):{' '}
                <strong className="text-huyen-lam">
                  {currentUser.displayName}
                </strong>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Bước tiếp theo
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="Ghi ngắn gọn bước kế tiếp..."
                  className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-huyen-lam mb-1">
                  Hạn xử lý
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-ink-muted hover:text-huyen-lam min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-huyen-lam text-nga-thien rounded-lg hover:bg-lam-tri-tue transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {submitting
                  ? 'Đang lưu...'
                  : !isManager || parentId
                  ? 'Tạo việc con'
                  : 'Tạo công việc'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
