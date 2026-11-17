import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileJson,
  FileWarning,
  FolderKanban,
  Info,
  Link2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { auth } from '../firebase';
import { CategoryItem, ProjectMember, TaskItem } from '../types/project';
import {
  buildOfficialImportPlan,
  loadOfficialJsonDataset,
  OFFICIAL_IMPORT_JSON_PATH,
  OfficialImportDataset,
  OfficialImportExecutionResult,
  OfficialImportPlanItem,
  OfficialImportSummary,
  OfficialImportVerification,
  validateOfficialImportPreflight,
} from '../utils/officialImport';
import { REVIEW_FLAG_LABELS } from '../utils/taskHelpers';
import { StatusBadge } from './StatusBadge';

interface ImportPreviewViewProps {
  existingTasks: TaskItem[];
  existingCategories: CategoryItem[];
  currentUser: ProjectMember;
  onNavigateToCategories?: () => void;
  onExecuteImport?: (
    items: OfficialImportPlanItem[],
    summary: OfficialImportSummary
  ) => Promise<OfficialImportExecutionResult>;
  onVerifyLiveFirestore?: (
    expectedIds: string[]
  ) => Promise<OfficialImportVerification>;
}

type PreviewFilter = 'all' | 'flagged' | 'with_urls' | 'conflicts';

export const ImportPreviewView: React.FC<ImportPreviewViewProps> = ({
  existingTasks,
  existingCategories,
  currentUser,
  onNavigateToCategories,
  onExecuteImport,
  onVerifyLiveFirestore,
}) => {
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;

  const [dataset, setDataset] = useState<OfficialImportDataset | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sourceRemovedAfterImport, setSourceRemovedAfterImport] =
    useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [importing, setImporting] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] =
    useState<OfficialImportExecutionResult | null>(null);
  const [liveVerification, setLiveVerification] =
    useState<OfficialImportVerification | null>(null);

  const fetchSourceJson = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    setSourceRemovedAfterImport(false);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const data = await loadOfficialJsonDataset(idToken, signal);
      setDataset(data);
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể đọc tệp dữ liệu JSON nguồn.';
      if (msg.includes('404')) {
        setSourceRemovedAfterImport(true);
      } else {
        setLoadError(msg);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetchSourceJson(controller.signal);
    return () => controller.abort();
  }, [isAdmin, fetchSourceJson]);

  const plan = useMemo(() => {
    if (!dataset) return null;
    return buildOfficialImportPlan(dataset, existingTasks, existingCategories);
  }, [dataset, existingTasks, existingCategories]);

  const filteredItems = useMemo(() => {
    if (!plan) return [];
    switch (filter) {
      case 'flagged':
        return plan.items.filter((i) => i.source.reviewFlags.length > 0);
      case 'with_urls':
        return plan.items.filter((i) =>
          i.source.resultLinks.some((l) => Boolean(l.url))
        );
      case 'conflicts':
        return plan.items.filter((i) => i.conflictStatus !== 'ready');
      default:
        return plan.items;
    }
  }, [plan, filter]);

  const expectedOfficialIds = useMemo(() => {
    if (plan) {
      return plan.items.map((i) => i.normalizedPayload.id);
    }
    const officialOnServer = existingTasks
      .filter((t) => t.id.startsWith('tbhgn_') && t.isTestRecord === false)
      .map((t) => t.id);
    return officialOnServer;
  }, [plan, existingTasks]);

  const handleVerifyLive = async () => {
    if (!onVerifyLiveFirestore || verifying) return;
    setExecError(null);
    setVerifying(true);
    try {
      const v = await onVerifyLiveFirestore(expectedOfficialIds);
      setLiveVerification(v);
    } catch (err) {
      setExecError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc đối chiếu từ Firestore thật.'
      );
    } finally {
      setVerifying(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900">
        Chỉ tài khoản <strong>Admin</strong> mới được truy cập màn hình chuẩn bị nhập dữ liệu dự án.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-nga-xam rounded-xl p-8 text-center text-sm text-ink-muted">
        Đang tải dữ liệu nguồn từ JSON và đối chiếu với Firestore...
      </div>
    );
  }

  if (sourceRemovedAfterImport) {
    const officialCount = existingTasks.filter(
      (t) => !t.archivedAt && t.id.startsWith('tbhgn_') && t.isTestRecord === false
    ).length;
    return (
      <div className="bg-white border border-nga-xam rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-huyen-lam shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-huyen-lam">
              Tệp JSON nguồn đã được dọn khỏi máy chủ sau khi nhập hoàn tất
            </h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Để bảo mật dữ liệu gốc, tệp JSON tạm trên máy chủ không còn lưu giữ trên repository. Hiện Firestore đang có{' '}
              <strong>{officialCount}/20</strong> đầu việc chính thức.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onVerifyLiveFirestore && expectedOfficialIds.length > 0 && (
            <button
              type="button"
              onClick={handleVerifyLive}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-huyen-lam text-white rounded-lg hover:bg-lam-tri-tue disabled:opacity-50 min-h-[40px]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {verifying ? 'Đang đọc Firestore...' : 'Đọc đối chiếu Firestore thật'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchSourceJson()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-nga-xam text-huyen-lam rounded-lg hover:bg-nga-thien min-h-[40px]"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>Kiểm tra lại tệp nguồn</span>
          </button>
        </div>

        {execError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
            <strong>Lỗi đối chiếu:</strong> {execError}
          </div>
        )}

        {liveVerification && (
          <div className="bg-nga-thien border border-nga-xam rounded-lg p-3 text-xs text-huyen-lam space-y-1">
            <div>
              Đối chiếu server ({liveVerification.verifiedAt}):{' '}
              <strong>{liveVerification.officialCount}/20</strong> đầu việc (
              {liveVerification.parentCount} cha · {liveVerification.childCount} con) ·{' '}
              <strong>{liveVerification.resultUrlCount}/13</strong> URL
            </div>
            <div className="text-ink-muted">
              Nhóm 3 ({liveVerification.groupProgress.tbhgn_3.completed}/{liveVerification.groupProgress.tbhgn_3.total}) ·
              Nhóm 4 ({liveVerification.groupProgress.tbhgn_4.completed}/{liveVerification.groupProgress.tbhgn_4.total}) ·
              Nhóm 5 ({liveVerification.groupProgress.tbhgn_5.completed}/{liveVerification.groupProgress.tbhgn_5.total})
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loadError || !dataset || !plan) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-2.5 text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">
              Không thể tải nguồn dữ liệu nhập
            </h2>
            <p className="text-xs text-red-800 mt-1">
              {loadError ?? 'Dữ liệu nguồn không khả dụng.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchSourceJson()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-100"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Thử tải lại</span>
        </button>
      </div>
    );
  }

  const { summary, items } = plan;

  const readinessStyles = (() => {
    switch (summary.readiness) {
      case 'has_conflicts':
        return {
          wrap: 'bg-red-50 border-red-200 text-red-950',
          badge: 'bg-red-100 text-red-900 border-red-300',
          icon: ShieldAlert,
        };
      case 'needs_categories':
        return {
          wrap: 'bg-minh-kim-soft border-minh-kim-border text-minh-kim-ink',
          badge: 'bg-[#FFE699] text-[#5C4300] border-minh-kim-border',
          icon: AlertTriangle,
        };
      case 'already_imported':
        return {
          wrap: 'bg-emerald-50 border-emerald-200 text-emerald-950',
          badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          icon: CheckCircle2,
        };
      default:
        return {
          wrap: 'bg-nga-thien border-nga-xam text-huyen-lam',
          badge: 'bg-white text-huyen-lam border-nga-xam',
          icon: Info,
        };
    }
  })();
  const ReadinessIcon = readinessStyles.icon;

  const preflight = validateOfficialImportPreflight(items, summary);
  const canExecuteImport =
    Boolean(onExecuteImport) &&
    preflight.ok &&
    summary.readyToImportCount > 0 &&
    !importing;

  const handleRunImport = async () => {
    if (!onExecuteImport || importing) return;
    setExecError(null);
    if (!preflight.ok) {
      setExecError(preflight.errors.join(' '));
      return;
    }
    setImporting(true);
    try {
      const res = await onExecuteImport(items, summary);
      setExecResult(res);
      setLiveVerification(res.verification);
    } catch (err) {
      setExecError(
        err instanceof Error
          ? err.message
          : 'Không thể nhập dữ liệu chính thức vào Firestore.'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleRunLiveVerification = async () => {
    if (!onVerifyLiveFirestore || verifying) return;
    setExecError(null);
    setVerifying(true);
    try {
      const v = await onVerifyLiveFirestore(
        items.map((i) => i.normalizedPayload.id)
      );
      setLiveVerification(v);
    } catch (err) {
      setExecError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc đối chiếu từ Firestore thật.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const activeVerification = liveVerification ?? execResult?.verification ?? null;

  return (
    <div className="space-y-5">
      {/* Stage B2.2 Readiness & Execution Banner */}
      <section
        aria-label="Trạng thái sẵn sàng nhập dữ liệu"
        className={`border rounded-xl p-4 space-y-3 ${readinessStyles.wrap}`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold ${readinessStyles.badge}`}
              >
                <ReadinessIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{summary.readinessLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/85 border border-nga-xam text-[11px] font-medium text-huyen-lam/85">
                <Database className="w-3 h-3 shrink-0" />
                <span>Giai đoạn B2.2: Nhập idempotent vào Firestore thật</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">
              {summary.readinessDescription}
            </p>
            <p className="text-[11px] opacity-80">
              Nguồn đọc: <span className="font-mono-tabular">{dataset.source.fileName}</span> ({dataset.source.tab}, dòng {dataset.source.rows}) · Tệp nội bộ: <span className="font-mono-tabular">{OFFICIAL_IMPORT_JSON_PATH}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchSourceJson()}
              disabled={importing || verifying}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-nga-thien disabled:opacity-50 transition-colors min-h-[40px]"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Đối chiếu lại nguồn</span>
            </button>

            {onVerifyLiveFirestore && (
              <button
                type="button"
                onClick={handleRunLiveVerification}
                disabled={verifying || importing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-nga-xam text-xs font-medium text-huyen-lam hover:bg-nga-thien disabled:opacity-50 transition-colors min-h-[40px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {verifying ? 'Đang đọc Firestore...' : 'Đọc đối chiếu Firestore thật'}
                </span>
              </button>
            )}

            {(summary.missingRequiredCategories.length > 0 ||
              summary.inactiveRequiredCategories.length > 0) &&
              onNavigateToCategories && (
                <button
                  type="button"
                  onClick={onNavigateToCategories}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-huyen-lam text-white text-xs font-medium hover:bg-lam-tri-tue transition-colors min-h-[40px]"
                >
                  <FolderKanban className="w-3.5 h-3.5 shrink-0" />
                  <span>Mở Quản lý hạng mục</span>
                </button>
              )}

            {onExecuteImport && (
              <button
                type="button"
                onClick={handleRunImport}
                disabled={!canExecuteImport}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold min-h-[40px] transition-colors ${
                  canExecuteImport
                    ? 'bg-huyen-lam text-white hover:bg-lam-tri-tue'
                    : 'bg-surface-muted text-ink-muted border border-nga-xam cursor-not-allowed'
                }`}
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {importing
                    ? 'Đang nhập 20 công việc...'
                    : summary.duplicateIdCount === summary.totalTasks
                    ? 'Đã nhập đủ 20/20 (Không ghi đè)'
                    : `Nhập chính thức ${summary.readyToImportCount} công việc vào Firestore`}
                </span>
              </button>
            )}
          </div>
        </div>

        {!preflight.ok && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 space-y-1">
            <div className="font-semibold">
              Đã dừng nhập để bảo vệ dữ liệu:
            </div>
            {preflight.errors.map((errMsg, idx) => (
              <div key={idx}>• {errMsg}</div>
            ))}
          </div>
        )}

        {execError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
            <strong>Lỗi thực thi:</strong> {execError}
          </div>
        )}

        {(execResult || activeVerification) && (
          <div className="bg-white border border-nga-xam rounded-lg p-3.5 space-y-2.5 text-xs text-huyen-lam/90">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-huyen-lam flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Checkpoint B2.2 — Kết quả nhập & Đối chiếu trực tiếp từ Firestore thật
                </span>
              </div>
              <span className="text-[11px] font-mono-tabular text-ink-muted">
                Đọc từ server: {activeVerification?.verifiedAt}
              </span>
            </div>

            {execResult && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-md py-1.5 px-2">
                  <div className="text-[11px] text-emerald-800">Ghi mới thành công</div>
                  <div className="text-base font-bold font-mono-tabular text-emerald-900">
                    {execResult.importedCount}
                  </div>
                </div>
                <div className="bg-nga-thien border border-nga-xam rounded-md py-1.5 px-2">
                  <div className="text-[11px] text-ink-muted">Bỏ qua (đã tồn tại)</div>
                  <div className="text-base font-bold font-mono-tabular text-huyen-lam">
                    {execResult.skippedIds.length}
                  </div>
                </div>
                <div className="bg-nga-thien border border-nga-xam rounded-md py-1.5 px-2">
                  <div className="text-[11px] text-ink-muted">Lỗi</div>
                  <div className="text-base font-bold font-mono-tabular text-huyen-lam">
                    {execResult.errorCount}
                  </div>
                </div>
              </div>
            )}

            {activeVerification && (
              <div className="space-y-1.5 pt-1 border-t border-nga-xam/60">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Tổng chính thức (<span className="font-mono-tabular">isTestRecord: false</span>):{' '}
                    <strong>{activeVerification.officialCount}/20</strong> ({activeVerification.parentCount} cha · {activeVerification.childCount} con)
                  </span>
                  <span>
                    Tiến độ 3 nhóm:{' '}
                    <strong>
                      3 ({activeVerification.groupProgress.tbhgn_3.completed}/{activeVerification.groupProgress.tbhgn_3.total}) · 4 ({activeVerification.groupProgress.tbhgn_4.completed}/{activeVerification.groupProgress.tbhgn_4.total}) · 5 ({activeVerification.groupProgress.tbhgn_5.completed}/{activeVerification.groupProgress.tbhgn_5.total})
                    </strong>
                  </span>
                  <span>
                    URL thực trong <span className="font-mono-tabular">resultLinks</span>:{' '}
                    <strong>{activeVerification.resultUrlCount}/13</strong>
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Trạng thái:{' '}
                    <strong>
                      {activeVerification.statusCounts.inProgress} Đang làm · {activeVerification.statusCounts.pendingApproval} Chờ duyệt · {activeVerification.statusCounts.paused} Tạm dừng · {activeVerification.statusCounts.unsetNull} null
                    </strong>
                  </span>
                  <span>
                    Tự gán UID: <strong>{activeVerification.nonEmptyAssigneeUidCount}</strong> (giữ <span className="font-mono-tabular">assigneeUids: []</span>)
                  </span>
                  <span>
                    Bản ghi kiểm thử B1 giữ nguyên: <strong>{activeVerification.b1TestTaskCount}</strong>
                  </span>
                </div>
                {activeVerification.mismatches.length > 0 ? (
                  <div className="text-red-800 bg-red-50 border border-red-200 rounded p-2">
                    Cảnh báo đối chiếu server: {activeVerification.mismatches.join(' ')}
                  </div>
                ) : (
                  <div className="text-emerald-800 font-medium">
                    ✓ Khớp 100% dữ liệu nguồn trên Firestore thật. Đã dừng tại Checkpoint B2.2 — chưa ánh xạ thành viên (chờ bước B2.3).
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4 Summary Cards */}
      <section
        aria-label="Thống kê chuẩn bị nhập dữ liệu"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="bg-white border border-nga-xam rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-semibold text-ink-muted">
            Tổng công việc nguồn
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.totalTasks}
            </span>
            <span className="text-xs font-medium text-huyen-lam/85">
              {summary.parentCount} cha · {summary.childCount} con
            </span>
          </div>
          <div className="text-[11px] text-ink-muted pt-1 border-t border-nga-xam/60">
            Tiến độ 3 nhóm: 3 ({summary.groupProgress.tbhgn_3.completed}/
            {summary.groupProgress.tbhgn_3.total}) · 4 (
            {summary.groupProgress.tbhgn_4.completed}/
            {summary.groupProgress.tbhgn_4.total}) · 5 (
            {summary.groupProgress.tbhgn_5.completed}/
            {summary.groupProgress.tbhgn_5.total})
          </div>
        </div>

        <div className="bg-white border border-nga-xam rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-huyen-lam shrink-0" />
            <span>Liên kết & Trạng thái gốc</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.preservedResultUrlCount} URL
            </span>
            <span className="text-xs text-ink-muted">
              trong resultLinks
            </span>
          </div>
          <div className="text-[11px] text-ink-muted pt-1 border-t border-nga-xam/60">
            {summary.statusCounts.inProgress} Đang làm ·{' '}
            {summary.statusCounts.pendingApproval} Chờ duyệt ·{' '}
            {summary.statusCounts.paused} Tạm dừng ·{' '}
            {summary.statusCounts.unsetNull} null
          </div>
        </div>

        <div className="bg-white border border-nga-xam rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
            <FileWarning className="w-3.5 h-3.5 text-minh-kim-ink shrink-0" />
            <span>Công việc cần rà soát</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono-tabular text-minh-kim-ink">
              {summary.flaggedTasks.length}
            </span>
            <span className="text-xs text-ink-muted">
              0 thiếu hyperlink URL
            </span>
          </div>
          <div className="text-[11px] text-ink-muted pt-1 border-t border-nga-xam/60">
            {summary.missingAssigneeTasks.length} thiếu người phụ trách ·{' '}
            {summary.missingStatusTasks.length} thiếu trạng thái (4.5)
          </div>
        </div>

        <div className="bg-white border border-nga-xam rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-semibold text-ink-muted">
            Phát hiện trùng & Dữ liệu B1
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono-tabular text-huyen-lam">
              {summary.readyToImportCount}/20
            </span>
            <span className="text-xs text-ink-muted">
              sẵn sàng ghi mới
            </span>
          </div>
          <div className="text-[11px] text-ink-muted pt-1 border-t border-nga-xam/60">
            Trùng ID: {summary.duplicateIdCount} · Xung đột mã:{' '}
            {summary.codeConflictCount} · Giữ {summary.existingTestRecordCount}{' '}
            bản ghi B1
          </div>
        </div>
      </section>

      {/* Review Queue + Category Mapping Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <section className="bg-white border border-nga-xam rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-nga-xam flex items-center justify-between gap-2 bg-nga-thien/70">
            <div>
              <h2 className="text-sm font-semibold text-huyen-lam">
                Cảnh báo dữ liệu thiếu ({summary.flaggedTasks.length} đầu việc)
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Giữ nguyên dữ liệu gốc, không tự suy đoán người thực hiện hoặc trạng thái.
              </p>
            </div>
          </div>
          <div className="divide-y divide-nga-xam/60">
            {summary.flaggedTasks.map((item) => (
              <div
                key={`warn_${item.source.id}`}
                className="px-4 py-2.5 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-mono-tabular font-semibold text-huyen-lam shrink-0">
                      {item.source.displayCode}
                    </span>
                    <span className="font-medium text-huyen-lam break-words">
                      {item.source.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-minh-kim-ink">
                    {item.source.reviewFlags.map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex items-center gap-1"
                      >
                        <FileWarning className="w-3 h-3 shrink-0" />
                        <span>{REVIEW_FLAG_LABELS[flag]}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <StatusBadge status={item.source.status} compact />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-nga-xam rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-nga-xam bg-nga-thien/70">
            <h2 className="text-sm font-semibold text-huyen-lam">
              Ánh xạ 3 hạng mục chuẩn & Bảo toàn trường gốc
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Đối chiếu trực tiếp collection <span className="font-mono-tabular">categories</span> hiện có trên Firestore.
            </p>
          </div>
          <div className="divide-y divide-nga-xam/60">
            {summary.categoryStatuses.map((cat) => (
              <div
                key={cat.defaultId}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-huyen-lam">
                    {cat.requiredName}
                  </div>
                  <div className="text-[11px] text-ink-muted font-mono-tabular">
                    ID ánh xạ: {cat.firestoreCategoryId ?? cat.defaultId}
                  </div>
                </div>
                {cat.existsInFirestore && cat.isActiveInFirestore ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Đã có trên Firestore</span>
                  </span>
                ) : cat.existsInFirestore ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-minh-kim-soft border border-minh-kim-border text-minh-kim-ink font-medium">
                    Đang tạm ẩn
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-minh-kim-soft border border-minh-kim-border text-minh-kim-ink font-medium">
                    Chưa khởi tạo trên Firestore
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-nga-thien border-t border-nga-xam text-[11px] text-ink-muted space-y-1">
            <div>
              • Bảo toàn nguyên văn <span className="font-mono-tabular">assignees</span> và <span className="font-mono-tabular">notes</span> (gồm ghi chú của việc 5: &ldquo;Trạng thái gốc: Đang chỉnh sửa&rdquo;).
            </div>
            <div>
              • Luôn giữ <span className="font-mono-tabular">assigneeUids: []</span> (không đoán email/UID) và đánh dấu <span className="font-mono-tabular">isTestRecord: false</span>.
            </div>
            <div>
              • Toàn bộ {summary.existingTestRecordCount} bản ghi kiểm thử B1 (T1, T1.1, T2, ...) được giữ nguyên, không bị xóa hay ghi đè.
            </div>
          </div>
        </section>
      </div>

      {/* Full 20-Task Preview List */}
      <section className="bg-white border border-nga-xam rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-nga-xam flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-nga-thien/70">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-huyen-lam flex items-center gap-2">
              <FileJson className="w-4 h-4 shrink-0" />
              <span>Danh sách xem trước 20 đầu việc sẽ nhập</span>
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Giữ nguyên cấu trúc 9 nhóm cha – 11 việc con, ID cố định <span className="font-mono-tabular">tbhgn_*</span> và 13 liên kết thực.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: 'all', label: `Tất cả (${items.length})` },
                {
                  id: 'flagged',
                  label: `Cần rà soát (${summary.flaggedTasks.length})`,
                },
                {
                  id: 'with_urls',
                  label: `Có URL (${summary.tasksWithResultLinksCount})`,
                },
                {
                  id: 'conflicts',
                  label: `Trùng / xung đột (${
                    summary.duplicateIdCount + summary.codeConflictCount
                  })`,
                },
              ] as Array<{ id: PreviewFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg border font-medium transition-colors min-h-[34px] ${
                  filter === opt.id
                    ? 'bg-huyen-lam text-white border-huyen-lam'
                    : 'bg-white text-huyen-lam/85 border-nga-xam hover:bg-nga-thien'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-nga-xam/60">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">
              Không có công việc nào khớp bộ lọc đang chọn.
            </div>
          ) : (
            filteredItems.map((item: OfficialImportPlanItem) => {
              const t = item.normalizedPayload;
              const isChild = t.parentId !== null;
              const groupProg =
                !isChild &&
                (t.id === 'tbhgn_3' || t.id === 'tbhgn_4' || t.id === 'tbhgn_5')
                  ? summary.groupProgress[
                      t.id as 'tbhgn_3' | 'tbhgn_4' | 'tbhgn_5'
                    ]
                  : null;

              return (
                <div
                  key={t.id}
                  className={`px-4 py-3 flex flex-col gap-2 ${
                    isChild ? 'pl-7 sm:pl-10 bg-nga-thien/75' : 'bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono-tabular text-xs font-bold text-huyen-lam">
                          {t.displayCode}
                        </span>
                        <span className="text-sm font-semibold text-huyen-lam break-words">
                          {t.title}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-ink-muted">
                          [{t.id}]
                        </span>
                        {groupProg && (
                          <span className="text-[11px] font-mono-tabular font-medium text-huyen-lam/85 bg-surface-muted px-1.5 py-0.5 rounded">
                            Tiến độ con: {groupProg.completed}/{groupProg.total}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span>
                          Hạng mục:{' '}
                          <strong className="font-medium text-huyen-lam">
                            {item.categoryInherited
                              ? `Kế thừa từ cha (${item.effectiveCategoryName})`
                              : item.effectiveCategoryName || 'Chưa phân loại'}
                          </strong>
                          {item.effectiveCategoryId && (
                            <span className="font-mono-tabular text-[11px] text-ink-muted">
                              {' '}
                              ({item.effectiveCategoryId})
                            </span>
                          )}
                        </span>

                        <span>
                          Thực hiện:{' '}
                          <strong className="font-medium text-huyen-lam">
                            {t.assignees.length > 0
                              ? t.assignees.join(', ')
                              : 'Chưa có trong Sheet'}
                          </strong>
                        </span>

                        <span className="font-mono-tabular text-[11px] text-ink-muted">
                          assigneeUids: [] · isTestRecord: false
                        </span>
                      </div>

                      {t.nextStep && (
                        <div className="text-xs text-minh-kim-ink">
                          Bước tiếp theo: {t.nextStep}
                        </div>
                      )}

                      {t.notes && (
                        <div className="text-xs text-huyen-lam/85 bg-surface-muted border border-nga-xam rounded px-2.5 py-1 inline-block">
                          Ghi chú nguồn: {t.notes}
                        </div>
                      )}

                      {t.resultLinks.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {t.resultLinks.map((lnk) =>
                            lnk.url ? (
                              <a
                                key={lnk.id}
                                href={lnk.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-huyen-lam hover:text-minh-kim-ink underline underline-offset-2"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span>{lnk.label}</span>
                              </a>
                            ) : (
                              <span
                                key={lnk.id}
                                className="text-xs text-minh-kim-ink"
                              >
                                {lnk.label} (chưa có URL)
                              </span>
                            )
                          )}
                        </div>
                      )}

                      {t.reviewFlags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-minh-kim-ink">
                          {t.reviewFlags.map((flag) => (
                            <span
                              key={flag}
                              className="inline-flex items-center gap-1"
                            >
                              <FileWarning className="w-3 h-3 shrink-0" />
                              <span>{REVIEW_FLAG_LABELS[flag]}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {item.conflictDetail && (
                        <div className="text-[11px] text-minh-kim-ink bg-minh-kim-soft border border-minh-kim-border rounded px-2 py-1 inline-block">
                          {item.conflictDetail}
                        </div>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-start sm:items-end gap-1.5 shrink-0">
                      <StatusBadge status={t.status} compact />
                      {item.conflictStatus === 'ready' ? (
                        <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Sẵn sàng ghi (B2.2)
                        </span>
                      ) : item.conflictStatus === 'duplicate_id' ? (
                        <span className="text-[11px] font-medium text-ink-muted bg-surface-muted border border-nga-xam px-2 py-0.5 rounded">
                          Đã tồn tại · Bỏ qua
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                          Xung đột mã
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
