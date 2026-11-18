import { MemberInvite, ProjectMember, TaskItem, UserRole } from '../types/project';
import { isB1TestTask } from './taskHelpers';

export interface ExpectedAccountSpec {
  email: string;
  originalName: string;
  displayName: string;
  sheetAlias: string;
  legacyAliases?: string[];
  isTemporary: boolean;
  note: string;
}

export interface ReplacedTemporaryAccountSpec {
  oldEmail: string;
  newEmail: string;
  originalName: string;
  displayName: string;
}

export const COLLECTIVE_GROUP_LABEL = 'Nhóm';

/**
 * 4 legacy temporary Gmail accounts replaced by official Google accounts.
 * Kept strictly for cleanup/audit of existing Firestore invites/profiles (NOT in EXPECTED_TBHGN_ACCOUNTS).
 */
export const REPLACED_TEMPORARY_ACCOUNTS: ReplacedTemporaryAccountSpec[] = [
  {
    oldEmail: 'filmfata02@gmail.com',
    newEmail: 'khanhqn312@gmail.com',
    originalName: 'Khánh',
    displayName: 'Khánh',
  },
  {
    oldEmail: 'filmfata04@gmail.com',
    newEmail: 'thumyho42@gmail.com',
    originalName: 'Mỵ',
    displayName: 'Mỵ',
  },
  {
    oldEmail: 'filmfata05@gmail.com',
    newEmail: 'linhgiangtu1991@gmail.com',
    originalName: 'Sư Pháp Tín',
    displayName: 'Sư Tín',
  },
  {
    oldEmail: 'filmfata01@gmail.com',
    newEmail: 'ngaothuyet2023@gmail.com',
    originalName: 'Sư Phụ',
    displayName: 'Sư Phụ',
  },
];

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
    note: 'Tài khoản Google chính thức',
  },
  {
    email: 'khanhqn312@gmail.com',
    originalName: 'Khánh',
    displayName: 'Khánh',
    sheetAlias: 'Khánh',
    isTemporary: false,
    note: 'Tài khoản Google chính thức (thay filmfata02@gmail.com)',
  },
  {
    email: 'thumyho42@gmail.com',
    originalName: 'Mỵ',
    displayName: 'Mỵ',
    sheetAlias: 'Mỵ',
    isTemporary: false,
    note: 'Tài khoản Google chính thức (thay filmfata04@gmail.com)',
  },
  {
    email: 'filmfata03@gmail.com',
    originalName: 'Khả Tuệ',
    displayName: 'Tuấn',
    sheetAlias: 'Khả Tuệ',
    isTemporary: true,
    note: 'Khả Tuệ (tên gọi: Tuấn) · Gmail tạm giữ nguyên, chưa có Gmail chính thức; chỉ Member, không cấp Admin/quyền duyệt',
  },
  {
    email: 'ngaothuyet2023@gmail.com',
    originalName: 'Sư Phụ',
    displayName: 'Sư Phụ',
    sheetAlias: 'Sư Phụ',
    legacyAliases: ['Sư Minh Hạnh'],
    isTemporary: false,
    note: 'Tài khoản Admin chính thức của Sư Phụ (Sư Minh Hạnh · thay filmfata01@gmail.com)',
  },
  {
    email: 'linhgiangtu1991@gmail.com',
    originalName: 'Sư Pháp Tín',
    displayName: 'Sư Tín',
    sheetAlias: 'Sư Pháp Tín',
    isTemporary: false,
    note: 'Tài khoản Google chính thức · hiển thị ngắn là Sư Tín, đối chiếu tên gốc Sư Pháp Tín (thay filmfata05@gmail.com)',
  },
];

export function normalizeTextKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function getReplacedTemporaryAccount(
  email: string | null | undefined
): ReplacedTemporaryAccountSpec | null {
  const norm = normalizeTextKey(email);
  if (!norm) return null;
  return (
    REPLACED_TEMPORARY_ACCOUNTS.find(
      (acc) => normalizeTextKey(acc.oldEmail) === norm
    ) ?? null
  );
}

export function isReplacedTemporaryAccountEmail(
  email: string | null | undefined
): boolean {
  return Boolean(getReplacedTemporaryAccount(email));
}

export function isTemporaryAccountEmail(email: string | null | undefined): boolean {
  const norm = normalizeTextKey(email);
  if (!norm) return false;
  if (isReplacedTemporaryAccountEmail(norm)) return true;
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
  // Never auto-grant admin or canApprove
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

export function getExpectedAccountAliases(
  spec: Pick<ExpectedAccountSpec, 'originalName' | 'displayName' | 'legacyAliases'>
): string[] {
  return [
    spec.originalName,
    spec.displayName,
    ...(spec.legacyAliases ?? []),
  ].filter(Boolean);
}

export function doesTaskMatchExpectedAccount(
  task: Pick<TaskItem, 'assignees'>,
  spec: Pick<ExpectedAccountSpec, 'originalName' | 'displayName' | 'legacyAliases'>
): boolean {
  const aliases = getExpectedAccountAliases(spec).map(normalizeTextKey);
  return task.assignees.some((a) => aliases.includes(normalizeTextKey(a)));
}

/**
 * Matches a signed-in member profile to one of the 6 standardized project people.
 * - Never pairs replaced legacy temporary accounts (filmfata01/02/04/05) as current expected accounts
 * - Matches exact official email (even if Admin still has sheetAlias="Admin")
 * - Or matches confirmed sheetAlias against spec.originalName / displayName / legacyAliases
 */
export function doesMemberMatchProjectPerson(
  member: Pick<ProjectMember, 'email' | 'sheetAlias'>,
  spec: Pick<ExpectedAccountSpec, 'email' | 'originalName' | 'displayName' | 'legacyAliases'>
): boolean {
  if (isReplacedTemporaryAccountEmail(member.email)) {
    return false;
  }
  if (normalizeTextKey(member.email) === normalizeTextKey(spec.email)) {
    return true;
  }
  const saNorm = normalizeTextKey(member.sheetAlias);
  if (!saNorm) {
    return false;
  }
  return getExpectedAccountAliases(spec).some(
    (alias) => normalizeTextKey(alias) === saNorm
  );
}

export function doesPersonMatchAlias(
  person: { email?: string; displayName?: string; sheetAlias?: string },
  alias: string
): boolean {
  const target = normalizeTextKey(alias);
  if (!target) return false;
  const dn = normalizeTextKey(person.displayName);
  const sa = normalizeTextKey(person.sheetAlias);
  if (target === sa || target === dn) return true;

  if (!isReplacedTemporaryAccountEmail(person.email)) {
    const matchedExpected = EXPECTED_TBHGN_ACCOUNTS.find(
      (acc) =>
        (person.email && normalizeTextKey(person.email) === normalizeTextKey(acc.email)) ||
        (sa &&
          getExpectedAccountAliases(acc).some(
            (candidate) => normalizeTextKey(candidate) === sa
          ))
    );
    if (
      matchedExpected &&
      getExpectedAccountAliases(matchedExpected).some(
        (candidate) => normalizeTextKey(candidate) === target
      )
    ) {
      return true;
    }
  }

  return false;
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
      const matchedByEmail = memberByEmail.get(emailKey) ?? null;
      const pairedByAlias =
        members.find((m) => doesMemberMatchProjectPerson(m, account)) ?? null;
      const matchedMember = matchedByEmail ?? pairedByAlias;
      const matchedInvite = inviteByEmail.get(emailKey) ?? null;

      const signInStatus: ExpectedAccountSignInStatus = matchedMember
        ? 'signed_in'
        : matchedInvite
        ? 'invited_pending'
        : 'not_invited';

      // Match tasks by exact originalName, displayName, or legacyAliases stored on tasks
      const matchingTasks = scopeTasks.filter((t) =>
        doesTaskMatchExpectedAccount(t, account)
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
        expectedAccounts.find((acc) =>
          getExpectedAccountAliases(acc).some(
            (aliasCandidate) =>
              normalizeTextKey(aliasCandidate) === normalizeTextKey(displayAlias)
          )
        ) ?? null;

      const matchedMembers = expectedAccount
        ? members.filter((m) => doesMemberMatchProjectPerson(m, expectedAccount))
        : members.filter(
            (m) =>
              !isReplacedTemporaryAccountEmail(m.email) &&
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
          !isReplacedTemporaryAccountEmail(inv.email) &&
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

export interface ReplacedTemporaryAuditItem {
  spec: ReplacedTemporaryAccountSpec;
  oldInvite: MemberInvite | null;
  oldMember: ProjectMember | null;
  newMember: ProjectMember | null;
  newInvite: MemberInvite | null;
  tasksHoldingOldUid: TaskItem[];
  canTransferNow: boolean;
  recommendLockOldMember: boolean;
}

/**
 * Audits the 4 replaced temporary Gmail accounts against live Firestore invites, users, and tasks.
 * Never mutates anything; surfaces old invites to remove, old UIDs needing Admin-confirmed transfer,
 * and old signed-in profiles eligible to be locked after verification.
 */
export function buildReplacedAccountAudit(
  members: ProjectMember[],
  invites: MemberInvite[],
  tasks: TaskItem[]
): ReplacedTemporaryAuditItem[] {
  const activeNonTestTasks = tasks.filter(
    (t) => !t.archivedAt && !isB1TestTask(t)
  );
  const memberByEmail = new Map(
    members.map((m) => [normalizeTextKey(m.email), m])
  );
  const inviteByEmail = new Map(
    invites.map((inv) => [normalizeTextKey(inv.email), inv])
  );

  return REPLACED_TEMPORARY_ACCOUNTS.map((spec) => {
    const oldInvite = inviteByEmail.get(normalizeTextKey(spec.oldEmail)) ?? null;
    const oldMember = memberByEmail.get(normalizeTextKey(spec.oldEmail)) ?? null;
    const newMember = memberByEmail.get(normalizeTextKey(spec.newEmail)) ?? null;
    const newInvite = inviteByEmail.get(normalizeTextKey(spec.newEmail)) ?? null;

    const tasksHoldingOldUid = oldMember
      ? activeNonTestTasks.filter(
          (t) =>
            t.assigneeUids.includes(oldMember.uid) ||
            (t.approverUids ?? []).includes(oldMember.uid)
        )
      : [];

    const canTransferNow = Boolean(
      oldMember &&
        tasksHoldingOldUid.length > 0 &&
        newMember &&
        newMember.isActive
    );

    const recommendLockOldMember = Boolean(
      oldMember && oldMember.isActive && tasksHoldingOldUid.length === 0
    );

    return {
      spec,
      oldInvite,
      oldMember,
      newMember,
      newInvite,
      tasksHoldingOldUid,
      canTransferNow,
      recommendLockOldMember,
    };
  });
}

/**
 * Safely updates comma-separated display names when Admin checks/unchecks a UID
 * in TaskDetailDrawer without wiping unrelated text aliases (e.g. "Khả Tuệ", "Sư Minh Hạnh", "Sư Pháp Tín") or
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

export interface ConfirmedTaskAssignmentUpdate {
  taskId: string;
  displayCode: string;
  nextAssigneeUids: string[];
  nextReviewFlags: TaskItem['reviewFlags'];
}

/**
 * Prepares explicit Admin-confirmed UID assignments for selected tasks.
 * Never alters original `assignees` text, never removes existing UIDs, and never escalates user roles.
 */
export function buildConfirmedAssignmentUpdates(
  member: Pick<ProjectMember, 'uid' | 'isActive'>,
  selectedTaskIds: string[],
  tasks: TaskItem[]
): ConfirmedTaskAssignmentUpdate[] {
  if (!member.uid || !member.isActive) return [];
  const selectedSet = new Set(selectedTaskIds);
  const updates: ConfirmedTaskAssignmentUpdate[] = [];

  for (const t of tasks) {
    if (!selectedSet.has(t.id)) continue;
    if (t.archivedAt || isB1TestTask(t)) continue;
    if (t.assigneeUids.includes(member.uid)) continue;

    updates.push({
      taskId: t.id,
      displayCode: t.displayCode,
      nextAssigneeUids: [...t.assigneeUids, member.uid],
      nextReviewFlags: t.reviewFlags.filter((f) => f !== 'missing_assignee'),
    });
  }

  return updates;
}
