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
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  // Admin sees all active parent tasks; Member sees ONLY active parent tasks assigned to their UID
  const eligibleParents = useMemo(() => {
    return tasks
      .filter((t) => t.parentId === null && !t.archivedAt)
      .filter((p) => canUserCreateSubtaskInParent(currentUser, p));
  }, [tasks, currentUser]);

  const initialParentId = useMemo(() => {
    if (defaultParentId && eligibleParents.some((p) => p.id === defaultParentId)) {
      return defaultParentId;
    }
    if (isAdmin) return defaultParentId ?? '';
    return eligibleParents[0]?.id ?? '';
  }, [defaultParentId, eligibleParents, isAdmin]);

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
        : isAdmin
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
    setAssigneeUids(isAdmin ? [] : [currentUser.uid]);
    setCustomAssigneeNote('');
    setStatus('Chưa bắt đầu');
    setNextStep('');
    setDueDate('');
    setError(null);
    setSubmitting(false);
  }, [isOpen, defaultParentId, isAdmin, currentUser.uid]);

  // Inherit parent's categoryId automatically when parent selection changes
  useEffect(() => {
    if (!isOpen) return;
    if (selectedParent) {
      setCategoryId(selectedParent.categoryId ?? '');
    }
  }, [selectedParent?.id, selectedParent?.categoryId, isOpen]);

  if (!isOpen) return null;

  const memberCannotCreate = !isAdmin && eligibleParents.length === 0;

  const suggestedCode = (() => {
    if (!parentId) {
      const allParentsCount = tasks.filter(
        (t) => t.parentId === null && !t.archivedAt
      ).length;
      return `T${allParentsCount + 1}`;
    }
    const siblings = tasks.filter(
      (t) => t.parentId === parentId && !t.archivedAt
    );
    return selectedParent
      ? `${selectedParent.displayCode}.${siblings.length + 1}`
      : 'T1.1';
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
    if (!isAdmin && !cleanParentId) {
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
      ? isAdmin
        ? categoryId || selectedParent?.categoryId || null
        : selectedParent?.categoryId || null
      : categoryId || null;

    const matchedCategory = categories.find((c) => c.id === effectiveCatId);

    const resolvedUids = isAdmin ? assigneeUids : [currentUser.uid];
    const uidNames = resolvedUids
      .map((uid) => members.find((m) => m.uid === uid)?.displayName)
      .filter((n): n is string => Boolean(n));
    const extraNames = isAdmin
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isAdmin ? 'Thêm đầu việc mới' : 'Thêm việc con'}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#13294B]">
            {!isAdmin || parentId ? 'Thêm việc con' : 'Thêm đầu việc mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {memberCannotCreate ? (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-[#FFF8E7] border border-[#D9A84E] text-xs sm:text-sm text-[#7C4D00] flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Chưa có nhóm việc cha được phân quyền cho bạn
                </div>
                <p>
                  Tài khoản Member chỉ được tạo <strong>việc con</strong> thuộc nhóm việc cha có gắn Firebase UID của bạn trong trường <code className="font-mono-tabular">assigneeUids</code>. Hiện chưa có việc cha nào phù hợp. Vui lòng liên hệ Quản trị viên để được phân công vào nhóm cha trước.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto"
          >
            {error && (
              <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAdmin
                  ? 'Cấp công việc (tối đa 2 cấp)'
                  : 'Thuộc nhóm việc cha được phân quyền'}
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
              >
                {isAdmin && <option value="">Đầu việc cha (cấp 1)</option>}
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    Việc con của: {p.displayCode}. {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mã hiển thị
                </label>
                <input
                  type="text"
                  value={displayCode}
                  onChange={(e) => setDisplayCode(e.target.value)}
                  placeholder={suggestedCode}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tên đầu việc
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tên công việc..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hạng mục{' '}
                  {parentId && !isAdmin && '(kế thừa từ việc cha)'}
                </label>
                {parentId && !isAdmin ? (
                  <div className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                    {parentCatMeta?.category || 'Chưa phân hạng mục'}
                  </div>
                ) : (
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
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
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Trạng thái ban đầu
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  {ALL_STATUSES.filter((s) => s !== 'Hoàn thành').map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isAdmin ? (
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-700">
                  Phân công theo tài khoản Firebase UID (quyết định quyền sửa)
                </div>
                {members.filter((m) => m.isActive).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Chưa có thành viên hoạt động nào khác.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((m) => m.isActive)
                      .map((m) => (
                        <label
                          key={m.uid}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={assigneeUids.includes(m.uid)}
                            onChange={() => toggleUid(m.uid)}
                          />
                          <span>{m.displayName}</span>
                        </label>
                      ))}
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Nhãn tên hiển thị bổ sung (tùy chọn, không cấp quyền)
                  </label>
                  <input
                    type="text"
                    value={customAssigneeNote}
                    onChange={(e) => setCustomAssigneeNote(e.target.value)}
                    placeholder="VD: Nhóm"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Người phụ trách (gắn UID của bạn):{' '}
                <strong className="text-[#13294B]">
                  {currentUser.displayName}
                </strong>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bước tiếp theo
                </label>
                <input
                  type="text"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  placeholder="Ghi ngắn gọn bước kế tiếp..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hạn xử lý
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[42px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50 min-h-[42px]"
              >
                {submitting
                  ? 'Đang lưu...'
                  : !isAdmin || parentId
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
