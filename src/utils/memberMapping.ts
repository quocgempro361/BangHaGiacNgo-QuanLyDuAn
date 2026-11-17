import { MemberInvite, ProjectMember, TaskItem, UserRole } from '../types/project';

export interface ExpectedAccountSpec {
  email: string;
  displayName: string;
  sheetAlias: string;
  isTemporary: boolean;
  note: string;
}

export const EXPECTED_TBHGN_ACCOUNTS: ExpectedAccountSpec[] = [
  {
    email: 'tduyquoc@gmail.com',
    displayName: 'Quốc',
    sheetAlias: 'Quốc',
    isTemporary: false,
    note: 'Tài khoản chính thức (đã đăng nhập ứng dụng)',
  },
  {
    email: 'filmfata01@gmail.com',
    displayName: 'Sư Phụ',
    sheetAlias: 'Sư Phụ',
    isTemporary: true,
    note: 'Tài khoản tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata02@gmail.com',
    displayName: 'Khánh',
    sheetAlias: 'Khánh',
    isTemporary: true,
    note: 'Tài khoản tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata03@gmail.com',
    displayName: 'Tuấn',
    sheetAlias: 'Tuấn',
    isTemporary: true,
    note: 'Tài khoản tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'filmfata04@gmail.com',
    displayName: 'Mỵ',
    sheetAlias: 'Mỵ',
    isTemporary: true,
    note: 'Tài khoản tạm thời · chỉ Member, không cấp Admin/quyền duyệt',
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
    sheetAlias: account.sheetAlias,
    role: 'member',
    canApprove: false,
  };
}

export function doesPersonMatchAlias(
  person: { displayName?: string; sheetAlias?: string },
  alias: string
): boolean {
  const target = normalizeTextKey(alias);
  if (!target) return false;
  const dn = normalizeTextKey(person.displayName);
  const sa = normalizeTextKey(person.sheetAlias);
  return target === dn || target === sa;
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
  accountRows: ExpectedAccountPreviewRow[];
  aliasRows: TaskAliasPreviewRow[];
}

export function buildMemberMappingPreview(
  expectedAccounts: ExpectedAccountSpec[],
  members: ProjectMember[],
  invites: MemberInvite[],
  tasks: TaskItem[]
): MemberMappingPreview {
  const activeTasks = tasks.filter((t) => !t.archivedAt);
  const officialTasks = activeTasks.filter((t) => t.isTestRecord === false);
  const scopeTasks = officialTasks.length > 0 ? officialTasks : activeTasks;
  const scopeLabel =
    officialTasks.length > 0
      ? `${officialTasks.length} công việc chính thức`
      : `${activeTasks.length} công việc đang hoạt động`;

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
      const matchedMember = memberByEmail.get(emailKey) ?? null;
      const matchedInvite = inviteByEmail.get(emailKey) ?? null;

      const signInStatus: ExpectedAccountSignInStatus = matchedMember
        ? 'signed_in'
        : matchedInvite
        ? 'invited_pending'
        : 'not_invited';

      const matchingTasks = scopeTasks.filter((t) =>
        t.assignees.some((a) =>
          doesPersonMatchAlias(
            { displayName: account.displayName, sheetAlias: account.sheetAlias },
            a
          )
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

  // Build alias map preserving first appearance order
  const aliasMap = new Map<string, { displayAlias: string; tasks: TaskItem[] }>();
  for (const task of scopeTasks) {
    for (const rawAlias of task.assignees) {
      const trimmed = rawAlias.trim();
      if (!trimmed) continue;
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
      const matchedMembers = members.filter((m) =>
        doesPersonMatchAlias(m, displayAlias)
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
          doesPersonMatchAlias(inv, displayAlias)
      );

      const expectedAccount =
        expectedAccounts.find((acc) =>
          doesPersonMatchAlias(acc, displayAlias)
        ) ?? null;

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
        statusLabel = 'Đã liên kết UID';
      } else if (matchedMembers.some((m) => m.isActive)) {
        linkStatus = 'ready_to_link';
        statusLabel = 'Đã đăng nhập · chờ Admin xác nhận từng việc';
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
