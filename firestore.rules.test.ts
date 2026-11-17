import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
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
    id: 'p1',
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
    id: 'p2_text_only',
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
    id: 'c1',
    displayCode: 'T1.1',
    parentId: 'p1',
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
    await deleteApp(probeApp);
  }
});

test('Firestore Rules use existsAfter/getAfter for batch parent validation and strictly bind task permissions to UID', () => {
  assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/tasks\/\$\(parentId\)\)/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/tasks\/\$\(parentId\)\)\.data\.parentId == null/);
  assert.match(rulesText, /function isAssignedToTask\(taskData\) \{\s*return request\.auth\.uid in taskData\.assigneeUids;\s*\}/);
  assert.equal(rulesText.includes("'Nhóm' in taskData.assignees"), false);
  assert.match(rulesText, /match \/categories\/\{categoryId\}/);
});

test('Client RBAC strictly enforces UID-based edit and parent-scoped subtask creation', () => {
  const assignedParent = sampleTasks[0];
  const textOnlyParent = sampleTasks[1];
  const unassignedChild = sampleTasks[2];

  // Admin: full access
  assert.equal(canUserEditTask(adminUser, textOnlyParent), true);
  assert.equal(canUserCreateSubtaskInParent(adminUser, assignedParent), true);
  assert.equal(canUserCreateSubtaskInParent(adminUser, textOnlyParent), true);
  assert.equal(canUserCreateSubtaskInParent(adminUser, unassignedChild), false); // 3rd level blocked

  // Member: strictly UID-bound; text display name "Quốc" / "Nhóm" grants ZERO permission
  assert.equal(canUserEditTask(memberUser, assignedParent), true);
  assert.equal(canUserEditTask(memberUser, textOnlyParent), false);
  assert.equal(canUserCreateSubtaskInParent(memberUser, assignedParent), true);
  assert.equal(canUserCreateSubtaskInParent(memberUser, textOnlyParent), false);
  assert.equal(canUserCreateSubtaskInParent(memberUser, unassignedChild), false);
  assert.equal(canUserApproveTask(memberUser, assignedParent), false);

  // Scoped approver
  assert.equal(canUserApproveTask(scopedApproverMember, assignedParent), true);
  assert.equal(canUserApproveTask(scopedApproverMember, textOnlyParent), false);

  // Viewer & Locked user
  assert.equal(canUserEditTask(viewerUser, assignedParent), false);
  assert.equal(canUserCreateSubtask(viewerUser), false);
  assert.equal(canUserCreateSubtaskInParent(viewerUser, assignedParent), false);
  assert.equal(canUserEditTask(lockedMember, assignedParent), false);
});

test('Category inheritance by categoryId and 2-level hierarchy checks work accurately', () => {
  const child = sampleTasks[2];
  const eff = getEffectiveCategory(child, sampleTasks, sampleCategories);
  assert.equal(eff.categoryId, 'cat_foundation');
  assert.equal(eff.category, 'Nền tảng & quy chuẩn');
  assert.equal(eff.inherited, true);

  assert.equal(canBeParent('p1', null, sampleTasks).ok, true);
  assert.equal(canBeParent('c1', null, sampleTasks).ok, false);
  assert.deepEqual(computeParentProgress('p1', sampleTasks), {
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
