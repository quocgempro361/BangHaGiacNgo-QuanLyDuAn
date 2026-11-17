import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { doc, getDoc, getFirestore, setDoc, terminate } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import {
  canBeParent,
  canUserApproveTask,
  canUserCreateSubtask,
  canUserCreateSubtaskInParent,
  canUserEditTask,
  computeParentProgress,
  getEffectiveCategory,
} from './src/utils/taskHelpers';
import { buildCreateTaskPayloads } from './src/services/firestoreService';
import { CategoryItem, ProjectMember, TaskItem } from './src/types/project';

const rootDir = process.cwd();
const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const appText = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
const serviceText = fs.readFileSync(
  path.join(rootDir, 'src/services/firestoreService.ts'),
  'utf8'
);

const adminUser: ProjectMember = {
  uid: 'uid_admin',
  displayName: 'Khánh (Admin)',
  email: 'ngaothuyet2023@gmail.com',
  role: 'admin',
  canApprove: true,
  isActive: true,
  sheetAlias: 'Khánh',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const memberUser: ProjectMember = {
  uid: 'uid_member',
  displayName: 'Quốc',
  email: 'quoc@example.com',
  role: 'member',
  canApprove: false,
  isActive: true,
  sheetAlias: 'Quốc',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const scopedApproverMember: ProjectMember = {
  uid: 'uid_approver',
  displayName: 'Biên tập',
  email: 'editor@example.com',
  role: 'member',
  canApprove: true,
  isActive: true,
  sheetAlias: 'Biên tập',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const viewerUser: ProjectMember = {
  uid: 'uid_viewer',
  displayName: 'Khách xem',
  email: 'viewer@example.com',
  role: 'viewer',
  canApprove: false,
  isActive: true,
  sheetAlias: '',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const lockedMember: ProjectMember = {
  ...memberUser,
  uid: 'uid_locked',
  isActive: false,
};

const sampleCategories: CategoryItem[] = [
  {
    id: 'cat_foundation',
    name: 'Nền tảng & quy chuẩn',
    color: '#1E5631',
    sortOrder: 2,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'uid_admin',
    updatedBy: 'uid_admin',
  },
];

const sampleTasks: TaskItem[] = [
  {
    id: 'b1_test_parent',
    displayCode: 'T1',
    parentId: null,
    sortOrder: 0,
    title: 'Nhóm việc cha kiểm thử',
    categoryId: 'cat_foundation',
    category: 'Nền tảng & quy chuẩn',
    assignees: ['Quốc'],
    assigneeUids: ['uid_member'],
    approverUids: ['uid_approver'],
    status: 'Đang làm',
    nextStep: null,
    dueDate: null,
    updatedAt: null,
    updatedBy: null,
    version: 1,
    referenceLinks: [],
    resultLinks: [],
    reviewFlags: [],
    notes: null,
    archivedAt: null,
    archivedBy: null,
    isTestRecord: true,
  },
  {
    id: 'b1_test_unassigned',
    displayCode: 'T2',
    parentId: null,
    sortOrder: 1,
    title: 'Nhóm chỉ có tên text Quốc nhưng chưa gắn UID',
    categoryId: null,
    category: null,
    assignees: ['Quốc', 'Nhóm'],
    assigneeUids: [],
    status: 'Chưa bắt đầu',
    nextStep: null,
    dueDate: null,
    updatedAt: null,
    updatedBy: null,
    version: 1,
    referenceLinks: [],
    resultLinks: [],
    reviewFlags: [],
    notes: null,
    archivedAt: null,
    archivedBy: null,
    isTestRecord: true,
  },
  {
    id: 'b1_test_child_1',
    displayCode: 'T1.1',
    parentId: 'b1_test_parent',
    sortOrder: 2,
    title: 'Việc con kế thừa hạng mục từ T1',
    categoryId: null,
    category: null,
    assignees: ['Khả Tuệ'],
    assigneeUids: ['uid_other'],
    status: 'Chờ duyệt',
    nextStep: null,
    dueDate: null,
    updatedAt: null,
    updatedBy: null,
    version: 1,
    referenceLinks: [],
    resultLinks: [],
    reviewFlags: [],
    notes: null,
    archivedAt: null,
    archivedBy: null,
    isTestRecord: true,
  },
];

function evaluateSimulatedSubtaskCreate(
  actor: ProjectMember,
  parentTask: TaskItem | null,
  taskPayload: ReturnType<typeof buildCreateTaskPayloads>['taskPayload'],
  logPayload: ReturnType<typeof buildCreateTaskPayloads>['logPayload']
): { allowed: boolean; reason?: string } {
  if (!actor.isActive) return { allowed: false, reason: 'inactive_user' };
  if (actor.role === 'viewer') return { allowed: false, reason: 'viewer_readonly' };
  if (taskPayload.updatedByUid !== actor.uid) {
    return { allowed: false, reason: 'updatedByUid_mismatch' };
  }
  if (logPayload.actorUid !== actor.uid || logPayload.taskId !== taskPayload.id) {
    return { allowed: false, reason: 'activityLog_actor_or_task_mismatch' };
  }
  if (taskPayload.version !== 1 || taskPayload.archivedAt !== null) {
    return { allowed: false, reason: 'invalid_initial_version_or_archive' };
  }
  if (taskPayload.parentId === null) {
    return actor.role === 'admin'
      ? { allowed: true }
      : { allowed: false, reason: 'member_cannot_create_parent_task' };
  }
  if (!parentTask || parentTask.parentId !== null || parentTask.archivedAt !== null) {
    return { allowed: false, reason: 'invalid_parent_task' };
  }
  if (actor.role === 'admin') return { allowed: true };
  if (actor.role !== 'member') return { allowed: false, reason: 'not_member' };
  if (!parentTask.assigneeUids.includes(actor.uid)) {
    return { allowed: false, reason: 'member_uid_not_assigned_on_parent' };
  }
  if (taskPayload.status === 'Hoàn thành') {
    return { allowed: false, reason: 'member_cannot_create_completed' };
  }
  if (
    taskPayload.assigneeUids.length !== 1 ||
    taskPayload.assigneeUids[0] !== actor.uid
  ) {
    return { allowed: false, reason: 'member_must_assign_only_self_uid' };
  }
  return { allowed: true };
}

test('Live Firebase SDK: unauthenticated reads/writes are rejected by deployed rules on named database', async () => {
  const probeApp = initializeApp(firebaseConfig, `probe_${Date.now()}`);
  const probeDb = getFirestore(probeApp, firebaseConfig.firestoreDatabaseId);
  try {
    await assert.rejects(
      () => getDoc(doc(probeDb, 'tasks', 'b1_test_parent')),
      (err: unknown) => {
        const code = (err as { code?: string })?.code ?? '';
        const msg = err instanceof Error ? err.message : String(err);
        return code === 'permission-denied' || msg.toLowerCase().includes('permission');
      }
    );

    await assert.rejects(
      () =>
        setDoc(doc(probeDb, 'categories', 'cat_illegal_unauth'), {
          name: 'Unauthorized',
          color: '#000000',
          sortOrder: 99,
          isActive: true,
        }),
      (err: unknown) => {
        const code = (err as { code?: string })?.code ?? '';
        const msg = err instanceof Error ? err.message : String(err);
        return code === 'permission-denied' || msg.toLowerCase().includes('permission');
      }
    );
  } finally {
    await terminate(probeDb);
    await deleteApp(probeApp);
  }
});

test('Firestore Rules use exists/get for existing parent and existsAfter/getAfter only for same-batch parent creation', () => {
  assert.match(rulesText, /exists\(taskDocPath\(parentId\)\)/);
  assert.match(rulesText, /!exists\(taskDocPath\(parentId\)\)\s*&&\s*existsAfter\(taskDocPath\(parentId\)\)/);
  assert.match(rulesText, /incoming\(\)\.assigneeUids == \[request\.auth\.uid\]/);
  assert.match(rulesText, /function isAssignedToTask\(taskData\) \{\s*return request\.auth\.uid in taskData\.assigneeUids;\s*\}/);
  assert.equal(rulesText.includes("'Nhóm' in taskData.assignees"), false);
});

test('Case 1: Assigned Member on T1 produces valid T1.2 + atomic activityLog payload matching Firestore Rules', () => {
  const parentT1 = sampleTasks[0];
  assert.equal(canUserCreateSubtaskInParent(memberUser, parentT1), true);

  const { taskId, logId, taskPayload, logPayload } = buildCreateTaskPayloads(
    {
      displayCode: 'T1.2',
      title: 'Việc con kiểm thử T1.2 của Member',
      parentId: parentT1.id,
      categoryId: parentT1.categoryId ?? null,
      category: parentT1.category ?? null,
      assignees: [memberUser.displayName],
      assigneeUids: [memberUser.uid],
      status: 'Chưa bắt đầu',
      nextStep: 'Cập nhật tiến độ',
      dueDate: null,
      sortOrder: 3,
    },
    memberUser
  );

  assert.match(taskId, /^[a-zA-Z0-9_\-]+$/);
  assert.match(logId, /^[a-zA-Z0-9_\-]+$/);
  assert.equal(taskPayload.id, taskId);
  assert.equal(taskPayload.parentId, 'b1_test_parent');
  assert.deepEqual(taskPayload.assigneeUids, ['uid_member']);
  assert.equal(taskPayload.updatedByUid, 'uid_member');
  assert.equal(taskPayload.version, 1);
  assert.equal(taskPayload.archivedAt, null);
  assert.equal(taskPayload.isTestRecord, true);
  assert.equal(logPayload.taskId, taskId);
  assert.equal(logPayload.actorUid, 'uid_member');
  assert.equal(logPayload.action, 'create');
  assert.equal(taskPayload.updatedAt, logPayload.createdAt);

  const check = evaluateSimulatedSubtaskCreate(
    memberUser,
    parentT1,
    taskPayload,
    logPayload
  );
  assert.deepEqual(check, { allowed: true });
});

test('Case 2: Member cannot create parent task, inject foreign assigneeUid, or edit/subtask unassigned T2', () => {
  const unassignedT2 = sampleTasks[1];
  const parentT1 = sampleTasks[0];

  assert.equal(canUserEditTask(memberUser, unassignedT2), false);
  assert.equal(canUserCreateSubtaskInParent(memberUser, unassignedT2), false);
  assert.equal(canUserApproveTask(memberUser, parentT1), false);

  const parentAttempt = buildCreateTaskPayloads(
    {
      displayCode: 'T3',
      title: 'Việc cha trái phép',
      parentId: null,
      categoryId: 'cat_foundation',
      category: 'Nền tảng & quy chuẩn',
      assignees: [memberUser.displayName],
      assigneeUids: [memberUser.uid],
      status: 'Chưa bắt đầu',
      nextStep: null,
      dueDate: null,
      sortOrder: 4,
    },
    memberUser
  );
  assert.equal(
    evaluateSimulatedSubtaskCreate(
      memberUser,
      null,
      parentAttempt.taskPayload,
      parentAttempt.logPayload
    ).allowed,
    false
  );

  const foreignUidAttempt = buildCreateTaskPayloads(
    {
      displayCode: 'T1.3',
      title: 'Gán UID người khác',
      parentId: parentT1.id,
      categoryId: parentT1.categoryId ?? null,
      category: parentT1.category ?? null,
      assignees: ['Admin'],
      assigneeUids: ['uid_admin'],
      status: 'Chưa bắt đầu',
      nextStep: null,
      dueDate: null,
      sortOrder: 5,
    },
    memberUser
  );
  assert.equal(
    evaluateSimulatedSubtaskCreate(
      memberUser,
      parentT1,
      foreignUidAttempt.taskPayload,
      foreignUidAttempt.logPayload
    ).allowed,
    false
  );
});

test('Case 3: Viewer cannot create or edit any task', () => {
  const parentT1 = sampleTasks[0];
  const unassignedT2 = sampleTasks[1];

  assert.equal(canUserCreateSubtask(viewerUser), false);
  assert.equal(canUserCreateSubtaskInParent(viewerUser, parentT1), false);
  assert.equal(canUserEditTask(viewerUser, parentT1), false);
  assert.equal(canUserEditTask(viewerUser, unassignedT2), false);
  assert.equal(canUserApproveTask(viewerUser, parentT1), false);
  assert.equal(canUserEditTask(lockedMember, parentT1), false);

  const viewerAttempt = buildCreateTaskPayloads(
    {
      displayCode: 'T1.4',
      title: 'Viewer tạo trái phép',
      parentId: parentT1.id,
      categoryId: parentT1.categoryId ?? null,
      category: parentT1.category ?? null,
      assignees: [viewerUser.displayName],
      assigneeUids: [viewerUser.uid],
      status: 'Chưa bắt đầu',
      nextStep: null,
      dueDate: null,
      sortOrder: 6,
    },
    viewerUser
  );
  assert.equal(
    evaluateSimulatedSubtaskCreate(
      viewerUser,
      parentT1,
      viewerAttempt.taskPayload,
      viewerAttempt.logPayload
    ).allowed,
    false
  );
});

test('Category inheritance by categoryId and 2-level hierarchy checks work accurately', () => {
  const child = sampleTasks[2];
  const eff = getEffectiveCategory(child, sampleTasks, sampleCategories);
  assert.equal(eff.categoryId, 'cat_foundation');
  assert.equal(eff.category, 'Nền tảng & quy chuẩn');
  assert.equal(eff.inherited, true);

  assert.equal(canBeParent('b1_test_parent', null, sampleTasks).ok, true);
  assert.equal(canBeParent('b1_test_child_1', null, sampleTasks).ok, false);
  assert.deepEqual(computeParentProgress('b1_test_parent', sampleTasks), {
    completed: 0,
    total: 1,
    percentage: 0,
  });
});

test('Stage B1 boundary: App.tsx never imports Stage A 20-task seed and uses categories + test records', () => {
  assert.equal(appText.includes('SEED_TASKS'), false);
  assert.equal(appText.includes('localStorage'), false);
  assert.equal(serviceText.includes('isTestRecord: true'), true);
});
