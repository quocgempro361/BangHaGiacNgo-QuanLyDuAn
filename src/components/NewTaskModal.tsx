import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
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
import { isTemporaryAccountEmail } from '../utils/memberMapping';

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

function formatShortParentOption(parent: TaskItem): string {
  const cleanTitle = parent.title.trim();
  const shortTitle =
    cleanTitle.length > 52
      ? `${cleanTitle.slice(0, 49).trimEnd()}…`
      : cleanTitle;
  return `Con · ${parent.displayCode}. ${shortTitle}`;
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const memberCannotCreate = !isManager && eligibleParents.length === 0;
  const activeMembers = members.filter((m) => m.isActive);

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
        'Bạn chỉ có thể tạo việc con thuộc một công việc chính đã được giao.'
      );
      return;
    }

    const validation = canBeParent(cleanParentId, null, tasks);
    if (!validation.ok) {
      setError(validation.reason || 'Nhóm công việc chính được chọn không hợp lệ.');
      return;
    }
    if (!title.trim()) {
      setError('Vui lòng nhập tên công việc.');
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

  const fieldClass =
    'w-full px-3 py-1.5 text-[13.5px] bg-white border border-[#DFD8CA] rounded-xl text-huyen-lam placeholder:text-[#969EAE] focus:outline-none focus:ring-2 focus:ring-lam-sang/25 focus:border-lam-sang h-[38px] transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-huyen-lam/45 backdrop-blur-[1.5px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isManager ? 'Thêm đầu việc mới' : 'Thêm việc con'}
    >
      <div className="bg-trang-nga w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-[#E5DFD2] shadow-[0_20px_48px_-12px_rgba(20,36,63,0.28)] flex flex-col max-h-[88dvh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3 bg-[#FAF8F3] border-b border-[#EAE3D5] flex items-center justify-between shrink-0">
          <h2 className="text-[15.5px] font-semibold text-huyen-lam tracking-[-0.01em]">
            {!isManager || parentId ? 'Thêm việc con' : 'Thêm đầu việc mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#6E7889] hover:bg-[#EFEAE0] hover:text-huyen-lam transition-colors"
          >
            <X className="w-[18px] h-[18px] shrink-0" />
          </button>
        </div>

        {memberCannotCreate ? (
          <div className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-minh-kim-soft border border-minh-kim-border text-xs sm:text-sm text-minh-kim-ink flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Chưa có công việc chính nào được giao cho bạn
                </div>
                <p>
                  Tài khoản Thành viên chỉ được thêm <strong>việc con</strong> vào nhóm công việc mà bạn đang phụ trách. Vui lòng liên hệ Quản trị viên để được phân công trước.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-[38px] text-sm font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {error && (
                <div className="px-3 py-2 text-xs font-medium text-chu-sa bg-chu-sa-soft border border-chu-sa-border rounded-xl">
                  {error}
                </div>
              )}

              {/* Khối 1 — Cấu trúc công việc */}
              <section className="space-y-3" aria-label="Cấu trúc công việc">
                <div className="flex items-center gap-2 text-xs font-semibold text-huyen-lam">
                  <span className="w-5 h-5 rounded-md bg-[#F2EDE1] text-huyen-lam font-mono-tabular text-[11px] inline-flex items-center justify-center">
                    1
                  </span>
                  <span>Cấu trúc công việc</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#434F63] mb-1">
                    {isManager ? 'Loại công việc' : 'Thuộc công việc chính'}
                  </label>
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className={fieldClass}
                  >
                    {isManager && <option value="">Công việc chính</option>}
                    {eligibleParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatShortParentOption(p)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11.5px] text-[#6E7889] leading-snug">
                    {!isManager
                      ? 'Việc con mới sẽ nằm trong công việc chính được chọn.'
                      : parentId
                      ? 'Việc con sẽ tự kế thừa hạng mục mặc định từ công việc chính.'
                      : 'Chọn Công việc chính cho việc độc lập, hoặc chọn Con · ... để gắn vào nhóm sẵn có.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Mã hiển thị
                    </label>
                    <input
                      type="text"
                      maxLength={24}
                      value={displayCode}
                      onChange={(e) => setDisplayCode(e.target.value)}
                      placeholder={suggestedCode}
                      className={`${fieldClass} font-mono-tabular`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Tên đầu việc
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={300}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Nhập tên công việc..."
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Hạng mục{' '}
                      {parentId && !isManager && (
                        <span className="text-[#7E8796] font-normal">
                          (theo việc chính)
                        </span>
                      )}
                    </label>
                    {parentId && !isManager ? (
                      <div className="px-3 h-[38px] text-[13.5px] bg-[#FAF8F3] border border-[#E6E0D3] rounded-xl text-huyen-lam flex items-center">
                        {parentCatMeta?.category || 'Chưa phân hạng mục'}
                      </div>
                    ) : (
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">
                          {parentId && parentCatMeta?.category
                            ? `Theo việc chính (${parentCatMeta.category})`
                            : 'Chưa phân hạng mục'}
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
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Trạng thái lúc tạo
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                      className={fieldClass}
                    >
                      {ALL_STATUSES.filter((s) => s !== 'Hoàn thành').map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Khối 2 — Người thực hiện */}
              <section
                className="pt-3.5 border-t border-[#ECE6DA] space-y-3"
                aria-label="Người thực hiện"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-huyen-lam">
                  <span className="w-5 h-5 rounded-md bg-[#F2EDE1] text-huyen-lam font-mono-tabular text-[11px] inline-flex items-center justify-center">
                    2
                  </span>
                  <span>Người thực hiện</span>
                </div>

                {isManager ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-[#434F63]">
                        Người được giao
                      </div>
                      <p className="text-[11.5px] text-[#6E7889] mt-0.5 mb-2">
                        Người được chọn sẽ có quyền cập nhật công việc này.
                      </p>

                      {activeMembers.length === 0 ? (
                        <p className="text-xs text-[#7E8796]">
                          Chưa có thành viên hoạt động nào khác.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {activeMembers.map((m) => {
                            const selected = assigneeUids.includes(m.uid);
                            const primaryLabel =
                              m.displayName?.trim() ||
                              m.sheetAlias?.trim() ||
                              m.email;
                            const isTemp = isTemporaryAccountEmail(m.email);
                            const aliasHint =
                              m.sheetAlias &&
                              m.sheetAlias.trim() !== primaryLabel
                                ? `Tên gốc: ${m.sheetAlias}`
                                : '';
                            const tooltipText = [
                              primaryLabel,
                              aliasHint,
                              m.email,
                              isTemp ? 'Tài khoản tạm' : 'Đã đăng nhập',
                            ]
                              .filter(Boolean)
                              .join(' · ');

                            return (
                              <button
                                key={m.uid}
                                type="button"
                                onClick={() => toggleUid(m.uid)}
                                aria-pressed={selected}
                                title={tooltipText}
                                className={`inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                                  selected
                                    ? 'bg-huyen-lam border-huyen-lam text-trang-nga font-semibold shadow-[0_1px_2px_rgba(20,36,63,0.12)]'
                                    : 'bg-white border-[#DFD8CA] text-huyen-lam hover:bg-[#FAF8F3] hover:border-[#CBC2B0]'
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors ${
                                    selected
                                      ? 'bg-kim-quang text-huyen-lam'
                                      : 'border border-[#CBC2B0] bg-[#FAF8F3]'
                                  }`}
                                  aria-hidden="true"
                                >
                                  {selected && (
                                    <Check className="w-2.5 h-2.5 stroke-[2.75]" />
                                  )}
                                </span>
                                <span>{primaryLabel}</span>
                                {isTemp && (
                                  <span
                                    className={`text-[10.5px] font-normal ${
                                      selected
                                        ? 'text-kim-quang/90'
                                        : 'text-[#8B7344]'
                                    }`}
                                  >
                                    (tạm)
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#434F63] mb-0.5">
                        Tên hiển thị thêm (tuỳ chọn)
                      </label>
                      <p className="text-[11.5px] text-[#6E7889] mb-1.5">
                        Chỉ để hiển thị, không cấp quyền sửa.
                      </p>
                      <input
                        type="text"
                        value={customAssigneeNote}
                        onChange={(e) => setCustomAssigneeNote(e.target.value)}
                        placeholder="Ví dụ: Nhóm"
                        className={fieldClass}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 bg-[#FAF8F3] border border-[#E6E0D3] rounded-xl text-xs text-[#5B6678]">
                    <span>Người được giao: </span>
                    <strong className="font-semibold text-huyen-lam">
                      {currentUser.displayName}
                    </strong>
                    <span className="text-[#7E8796]">
                      {' '}
                      · Bạn có quyền cập nhật công việc này.
                    </span>
                  </div>
                )}
              </section>

              {/* Khối 3 — Theo dõi */}
              <section
                className="pt-3.5 border-t border-[#ECE6DA] space-y-3"
                aria-label="Theo dõi"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-huyen-lam">
                  <span className="w-5 h-5 rounded-md bg-[#F2EDE1] text-huyen-lam font-mono-tabular text-[11px] inline-flex items-center justify-center">
                    3
                  </span>
                  <span>Theo dõi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Bước tiếp theo
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={nextStep}
                      onChange={(e) => setNextStep(e.target.value)}
                      placeholder="Ví dụ: Soạn bản nháp, chờ duyệt..."
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#434F63] mb-1">
                      Hạn xử lý
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`${fieldClass} font-mono-tabular`}
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Sticky Modal Action Footer */}
            <div className="shrink-0 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#FAF8F3]/95 border-t border-[#EAE3D5] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-[38px] text-[13.5px] font-medium text-[#5E697A] hover:text-huyen-lam hover:bg-[#EFEAE0] rounded-xl transition-colors"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 h-[38px] text-[13.5px] font-semibold bg-huyen-lam text-trang-nga rounded-xl hover:bg-lam-tri-tue shadow-[0_1px_2px_rgba(20,36,63,0.16)] transition-colors disabled:opacity-50"
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
