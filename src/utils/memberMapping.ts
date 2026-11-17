import { MemberInvite, ProjectMember, TaskItem, UserRole } from '../types/project';
import { isB1TestTask } from './taskHelpers';

export interface ExpectedAccountSpec {
  email: string;
  originalName: string;
  displayName: string;
  sheetAlias: string;
  isTemporary: boolean;
  note: string;
}

export const COLLECTIVE_GROUP_LABEL = 'Nhóm';

/**
 * 6 standardized project members sourced strictly from the 20 official TBHGN tasks.
 * "Nhóm" is a collective label, not a personal Google account.
 */
export const EXPECTED_TBHGN_ACCOUNTS: ExpectedAccountSpec[] = [
  {
    email: 'tduyquoc@gmail.com',
    originalName: 'Quốc',
    displayName: 'Quốc',
    sheetAlias: 'Quốc',
    isTemporary: false,
    note: 'Tài khoản chính thức (đã đăng nhập)',
  },
  {
    email: 'filmfata02@gmail.com',
    originalName: 'Khánh',
    displayName: 'Khánh',
    sheetAlias: 'Khánh',
    isTemporary: true,
    note: 'Gmail dự kiến tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata04@gmail.com',
    originalName: 'Mỵ',
    displayName: 'Mỵ',
    sheetAlias: 'Mỵ',
    isTemporary: true,
    note: 'Gmail dự kiến tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata03@gmail.com',
    originalName: 'Khả Tuệ',
    displayName: 'Tuấn',
    sheetAlias: 'Khả Tuệ',
    isTemporary: true,
    note: 'Khả Tuệ (tên gọi: Tuấn) · Gmail dự kiến tạm thời, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata01@gmail.com',
    originalName: 'Sư Minh Hạnh',
    displayName: 'Sư Phụ',
    sheetAlias: 'Sư Minh Hạnh',
    isTemporary: true,
    note: 'Sư Minh Hạnh (tên gọi: Sư Phụ) · Gmail dự kiến tạm thời, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata05@gmail.com',
    originalName: 'Sư Pháp Tín',
    displayName: 'Sư Pháp Tín',
    sheetAlias: 'Sư Pháp Tín',
    isTemporary: true,
    note: 'Gmail dự kiến tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
];

export function normalizeTextKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isTemporaryAccountEmail(email: string | null | undefined): boolean {
  const norm = normalizeTextKey(email);
  if (!norm) return false;
  return EXPECTED_TBHGN_ACCOUNTS.some(
    (acc) => acc.isTemporary && normalizeTextKey(acc.email) === norm
  );
}

export function getSafeInviteDefaults(account: ExpectedAccountSpec): {
  displayName: string;
  email: string;
  sheetAlias: string;
  role: UserRole;
  canApprove: boolean;
} {
  // Never auto-grant admin or canApprove (especially for temporary accounts)
  return {
    displayName: account.displayName,
    email: account.email.toLowerCase(),
    sheetAlias: account.originalName,
    role: 'member',
    canApprove: false,
  };
}

export function formatStandardMemberLabel(spec: ExpectedAccountSpec): string {
  return spec.originalName !== spec.displayName
    ? `${spec.originalName} (${spec.displayName})`
    : spec.displayName;
}

/**
 * Matches a signed-in member profile to one of the 6 standardized project people.
 * - Requires exact sheetAlias == spec.originalName (Admin-confirmed pairing)
 * - Or expectedEmail when sheetAlias is unset (never matches Admin email by displayName similarity)
 */
export function doesMemberMatchProjectPerson(
  member: Pick<ProjectMember, 'email' | 'sheetAlias'>,
  spec: Pick<ExpectedAccountSpec, 'email' | 'originalName'>
): boolean {
  const sa = normalizeTextKey(member.sheetAlias);
  const orig = normalizeTextKey(spec.originalName);
  if (sa) {
    return sa === orig;
  }
  return normalizeTextKey(member.email) === normalizeTextKey(spec.email);
}

export function doesPersonMatchAlias(
  person: { displayName?: string; sheetAlias?: string },
  alias: string
): boolean {
  const target = normalizeTextKey(alias);
  if (!target) return false;
  const dn = normalizeTextKey(person.displayName);
  const sa = normalizeTextKey(person.sheetAlias);
  return target === sa || target === dn;
}

export type ExpectedAccountSignInStatus =
  | 'signed_in'
  | 'invited_pending'
  | 'not_invited';

export interface ExpectedAccountPreviewRow {
  account: ExpectedAccountSpec;
  signInStatus: ExpectedAccountSignInStatus;
  matchedMember: ProjectMember | null;
  matchedInvite: MemberInvite | null;
  matchingTaskCodes: string[];
  linkedTaskCodes: string[];
  readyToConfirmCount: number;
  hasPrivilegeWarning: boolean;
}

export type AliasLinkStatus = 'linked' | 'ready_to_link' | 'unlinked';

export interface TaskAliasPreviewRow {
  alias: string;
  taskCount: number;
  taskCodes: string[];
  linkedTaskCount: number;
  unlinkedUidTaskCount: number;
  matchedMembers: ProjectMember[];
  matchedPendingInvites: MemberInvite[];
  expectedAccount: ExpectedAccountSpec | null;
  linkStatus: AliasLinkStatus;
  statusLabel: string;
}

export interface MemberMappingPreview {
  scopeLabel: string;
  scopeTaskCount: number;
  signedInExpectedCount: number;
  invitedPendingExpectedCount: number;
  temporaryExpectedCount: number;
  tasksUnlinkedUidCount: number;
  tasksWithTextButNoUidCount: number;
  tasksNoAssigneeAtAllCount: number;
  collectiveGroupTaskCodes: string[];
  accountRows: ExpectedAccountPreviewRow[];
  aliasRows: TaskAliasPreviewRow[];
}

export function buildMemberMappingPreview(
  expectedAccounts: ExpectedAccountSpec[],
  members: ProjectMember[],
  invites: MemberInvite[],
  tasks: TaskItem[]
): MemberMappingPreview {
  // Always exclude B1 test records from official project member statistics
  const activeNonTestTasks = tasks.filter(
    (t) => !t.archivedAt && !isB1TestTask(t)
  );
  const officialTasks = activeNonTestTasks.filter(
    (t) => t.isTestRecord === false
  );
  const scopeTasks =
    officialTasks.length > 0 ? officialTasks : activeNonTestTasks;
  const scopeLabel = `${scopeTasks.length} công việc chính thức`;

  const memberByEmail = new Map<string, ProjectMember>();
  for (const m of members) {
    memberByEmail.set(normalizeTextKey(m.email), m);
  }

  const inviteByEmail = new Map<string, MemberInvite>();
  for (const inv of invites) {
    inviteByEmail.set(normalizeTextKey(inv.email), inv);
  }

  const accountRows: ExpectedAccountPreviewRow[] = expectedAccounts.map(
    (account) => {
      const emailKey = normalizeTextKey(account.email);
      const pairedMember =
        members.find((m) => doesMemberMatchProjectPerson(m, account)) ?? null;
      const matchedByEmail = memberByEmail.get(emailKey) ?? null;
      const matchedMember = pairedMember ?? matchedByEmail;
      const matchedInvite = inviteByEmail.get(emailKey) ?? null;

      const signInStatus: ExpectedAccountSignInStatus = matchedMember
        ? 'signed_in'
        : matchedInvite
        ? 'invited_pending'
        : 'not_invited';

      // Match tasks by exact originalName stored on the 20 tasks (e.g. "Khả Tuệ", "Sư Minh Hạnh")
      const matchingTasks = scopeTasks.filter((t) =>
        t.assignees.some(
          (a) => normalizeTextKey(a) === normalizeTextKey(account.originalName)
        )
      );

      const linkedTasks = matchedMember
        ? matchingTasks.filter((t) =>
            t.assigneeUids.includes(matchedMember.uid)
          )
        : [];

      const readyToConfirmCount =
        matchedMember && matchedMember.isActive
          ? matchingTasks.filter(
              (t) => !t.assigneeUids.includes(matchedMember.uid)
            ).length
          : 0;

      const hasPrivilegeWarning =
        account.isTemporary &&
        Boolean(
          (matchedMember &&
            (matchedMember.role === 'admin' || matchedMember.canApprove)) ||
            (matchedInvite &&
              (matchedInvite.role === 'admin' || matchedInvite.canApprove))
        );

      return {
        account,
        signInStatus,
        matchedMember,
        matchedInvite,
        matchingTaskCodes: matchingTasks.map((t) => t.displayCode),
        linkedTaskCodes: linkedTasks.map((t) => t.displayCode),
        readyToConfirmCount,
        hasPrivilegeWarning,
      };
    }
  );

  // Separate collective group label ("Nhóm") from the 6 personal assignees
  const collectiveGroupTaskCodes = scopeTasks
    .filter((t) =>
      t.assignees.some(
        (a) => normalizeTextKey(a) === normalizeTextKey(COLLECTIVE_GROUP_LABEL)
      )
    )
    .map((t) => t.displayCode);

  const aliasMap = new Map<string, { displayAlias: string; tasks: TaskItem[] }>();
  for (const task of scopeTasks) {
    for (const rawAlias of task.assignees) {
      const trimmed = rawAlias.trim();
      if (!trimmed) continue;
      if (normalizeTextKey(trimmed) === normalizeTextKey(COLLECTIVE_GROUP_LABEL)) {
        continue;
      }
      const key = normalizeTextKey(trimmed);
      const existing = aliasMap.get(key);
      if (existing) {
        if (!existing.tasks.some((t) => t.id === task.id)) {
          existing.tasks.push(task);
        }
      } else {
        aliasMap.set(key, { displayAlias: trimmed, tasks: [task] });
      }
    }
  }

  const aliasRows: TaskAliasPreviewRow[] = Array.from(aliasMap.values()).map(
    ({ displayAlias, tasks: aliasTasks }) => {
      const expectedAccount =
        expectedAccounts.find(
          (acc) =>
            normalizeTextKey(acc.originalName) === normalizeTextKey(displayAlias)
        ) ?? null;

      // Match signed-in members strictly via doesMemberMatchProjectPerson when this is one of the 6 people,
      // avoiding false match by displayName (e.g. "Sư phụ" vs "Sư Minh Hạnh")
      const matchedMembers = expectedAccount
        ? members.filter((m) => doesMemberMatchProjectPerson(m, expectedAccount))
        : members.filter((m) =>
            normalizeTextKey(m.sheetAlias) === normalizeTextKey(displayAlias)
          );

      const activeMatchedUids = new Set(
        matchedMembers.filter((m) => m.isActive).map((m) => m.uid)
      );
      const matchedEmails = new Set(
        matchedMembers.map((m) => normalizeTextKey(m.email))
      );

      const matchedPendingInvites = invites.filter(
        (inv) =>
          !matchedEmails.has(normalizeTextKey(inv.email)) &&
          (normalizeTextKey(inv.sheetAlias) === normalizeTextKey(displayAlias) ||
            (expectedAccount
              ? normalizeTextKey(inv.email) ===
                normalizeTextKey(expectedAccount.email)
              : false))
      );

      const linkedTaskCount = aliasTasks.filter((t) =>
        t.assigneeUids.some((uid) => activeMatchedUids.has(uid))
      ).length;
      const unlinkedUidTaskCount = aliasTasks.filter(
        (t) => t.assigneeUids.length === 0
      ).length;

      let linkStatus: AliasLinkStatus = 'unlinked';
      let statusLabel = 'Chưa liên kết tài khoản';

      if (
        aliasTasks.length > 0 &&
        linkedTaskCount === aliasTasks.length &&
        matchedMembers.some((m) => m.isActive)
      ) {
        linkStatus = 'linked';
        statusLabel = 'Đã liên kết tài khoản';
      } else if (matchedMembers.some((m) => m.isActive)) {
        linkStatus = 'ready_to_link';
        statusLabel = 'Đã đăng nhập · chờ xác nhận trên công việc';
      }

      return {
        alias: displayAlias,
        taskCount: aliasTasks.length,
        taskCodes: aliasTasks.map((t) => t.displayCode),
        linkedTaskCount,
        unlinkedUidTaskCount,
        matchedMembers,
        matchedPendingInvites,
        expectedAccount,
        linkStatus,
        statusLabel,
      };
    }
  );

  const tasksUnlinkedUidCount = scopeTasks.filter(
    (t) => t.assigneeUids.length === 0
  ).length;
  const tasksWithTextButNoUidCount = scopeTasks.filter(
    (t) => t.assignees.length > 0 && t.assigneeUids.length === 0
  ).length;
  const tasksNoAssigneeAtAllCount = scopeTasks.filter(
    (t) => t.assignees.length === 0 && t.assigneeUids.length === 0
  ).length;

  return {
    scopeLabel,
    scopeTaskCount: scopeTasks.length,
    signedInExpectedCount: accountRows.filter(
      (r) => r.signInStatus === 'signed_in'
    ).length,
    invitedPendingExpectedCount: accountRows.filter(
      (r) => r.signInStatus === 'invited_pending'
    ).length,
    temporaryExpectedCount: expectedAccounts.filter((a) => a.isTemporary).length,
    tasksUnlinkedUidCount,
    tasksWithTextButNoUidCount,
    tasksNoAssigneeAtAllCount,
    collectiveGroupTaskCodes,
    accountRows,
    aliasRows,
  };
}

/**
 * Safely updates comma-separated display names when Admin checks/unchecks a UID
 * in TaskDetailDrawer without wiping unrelated text aliases (e.g. "Khả Tuệ") or
 * erasing the display name when revoking the last UID to keep "Chưa liên kết tài khoản".
 */
export function computeUpdatedAssigneeNamesOnUidToggle(
  currentAssigneesText: string,
  toggledMember: ProjectMember,
  nextUids: string[],
  allMembers: ProjectMember[]
): string {
  const currentLabels = currentAssigneesText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdded = nextUids.includes(toggledMember.uid);
  const preferredLabel = (
    toggledMember.sheetAlias ||
    toggledMember.displayName ||
    ''
  ).trim();

  if (isAdded) {
    if (!preferredLabel) return currentLabels.join(', ');
    const alreadyPresent = currentLabels.some((lbl) =>
      doesPersonMatchAlias(toggledMember, lbl)
    );
    if (alreadyPresent) return currentLabels.join(', ');
    return [...currentLabels, preferredLabel].join(', ');
  }

  // When revoking the last UID, preserve display names so task remains clearly
  // in "Chưa liên kết tài khoản" state unless Admin edits the text box directly.
  if (nextUids.length === 0) {
    return currentLabels.join(', ');
  }

  const remainingMembers = allMembers.filter((m) => nextUids.includes(m.uid));
  const filtered = currentLabels.filter((lbl) => {
    const matchesRemoved = doesPersonMatchAlias(toggledMember, lbl);
    if (!matchesRemoved) return true;
    // Keep the label if another still-assigned UID shares this alias/name
    return remainingMembers.some((rm) => doesPersonMatchAlias(rm, lbl));
  });
  return filtered.join(', ');
}
