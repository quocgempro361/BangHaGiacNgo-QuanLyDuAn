import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
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
import { buildCreateTaskPayloads, DEFAULT_TBHGN_CATEGORIES } from './src/services/firestoreService';
import {
  buildOfficialImportPlan,
  buildOfficialTaskFirestoreWritePayloads,
  computeOfficialFirestoreVerification,
  parseOfficialJsonDataset,
  validateOfficialImportPreflight,
} from './src/utils/officialImport';
import {
  buildMemberMappingPreview,
  computeUpdatedAssigneeNamesOnUidToggle,
  EXPECTED_TBHGN_ACCOUNTS,
  getSafeInviteDefaults,
  isTemporaryAccountEmail,
} from './src/utils/memberMapping';
import { CategoryItem, MemberInvite, ProjectMember, TaskItem } from './src/types/project';

const rootDir = process.cwd();
const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const appText = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
const importPreviewText = fs.readFileSync(
  path.join(rootDir, 'src/components/ImportPreviewView.tsx'),
  'utf8'
);
const serviceText = fs.readFileSync(
  path.join(rootDir, 'src/services/firestoreService.ts'),
  'utf8'
);
const officialJsonRaw = JSON.parse(
  fs.readFileSync(
    path.join(
      rootDir,
      'public/assets/aistudio/TBHGN_du_lieu_20_cong_viec_da_khoi_phuc_URL_38662941.json'
    ),
    'utf8'
  )
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

test('Firestore Rules use single-fetch let bindings, exists/get first for existing parent, and UID-bound assignment', () => {
  assert.match(rulesText, /function canCreateTask\(taskId\)/);
  assert.match(rulesText, /function canUpdateTask\(taskId\)/);
  assert.match(rulesText, /function canCreateActivityLog\(taskId, logId\)/);
  assert.match(rulesText, /exists\(pPath\)\s*\?\s*isParentValidForSubtask\(get\(pPath\)\.data/);
  assert.match(rulesText, /existsAfter\(pPath\)\s*&&\s*isParentValidForSubtask\(getAfter\(pPath\)\.data/);
  assert.match(rulesText, /data\.assigneeUids == \[request\.auth\.uid\]/);
  assert.match(rulesText, /function isAssignedToTask\(taskData\) \{\s*return request\.auth\.uid in taskData\.assigneeUids;\s*\}/);
  assert.equal(rulesText.includes("'Nhóm' in taskData.assignees"), false);
});

test('Firestore Emulator: atomic task + activityLog create, update, comment, and RBAC boundaries', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('Run inside firebase emulators:exec to execute real Rules engine checks');
    return;
  }

  const [host, portStr] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: firebaseConfig.projectId,
    firestore: {
      rules: rulesText,
      host,
      port: Number(portStr),
    },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const edb = ctx.firestore();
      for (const u of [adminUser, memberUser, scopedApproverMember, viewerUser]) {
        await setDoc(doc(edb, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          sheetAlias: u.sheetAlias,
          role: u.role,
          canApprove: u.canApprove,
          isActive: u.isActive,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await setDoc(doc(edb, 'tasks', 'b1_test_parent'), {
        id: 'b1_test_parent',
        displayCode: 'T1',
        parentId: null,
        sortOrder: 0,
        title: '[Kiểm thử B1] T1',
        categoryId: 'cat_foundation',
        category: 'Nền tảng & quy chuẩn',
        assignees: [memberUser.displayName],
        assigneeUids: [memberUser.uid],
        approverUids: [scopedApproverMember.uid],
        status: 'Đang làm',
        nextStep: null,
        dueDate: null,
        notes: null,
        referenceLinks: [],
        resultLinks: [],
        reviewFlags: [],
        version: 1,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser.displayName,
        updatedByUid: adminUser.uid,
        archivedAt: null,
        archivedBy: null,
        isTestRecord: true,
      });
      await setDoc(doc(edb, 'tasks', 'b1_test_unassigned'), {
        id: 'b1_test_unassigned',
        displayCode: 'T2',
        parentId: null,
        sortOrder: 1,
        title: '[Kiểm thử B1] T2',
        categoryId: null,
        category: null,
        assignees: ['Quốc'],
        assigneeUids: [],
        status: 'Chưa bắt đầu',
        nextStep: null,
        dueDate: null,
        notes: null,
        referenceLinks: [],
        resultLinks: [],
        reviewFlags: ['missing_assignee'],
        version: 1,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser.displayName,
        updatedByUid: adminUser.uid,
        archivedAt: null,
        archivedBy: null,
        isTestRecord: true,
      });
    });

    const memberDb = testEnv
      .authenticatedContext(memberUser.uid, {
        email: memberUser.email,
        email_verified: true,
      })
      .firestore();
    const viewerDb = testEnv
      .authenticatedContext(viewerUser.uid, {
        email: viewerUser.email,
        email_verified: true,
      })
      .firestore();

    // Assigned Member creates T1.2 + activityLog atomically
    const sub = buildCreateTaskPayloads(
      {
        displayCode: 'T1.2',
        title: 'Việc con kiểm thử của Member',
        parentId: 'b1_test_parent',
        categoryId: 'cat_foundation',
        category: 'Nền tảng & quy chuẩn',
        assignees: [memberUser.displayName],
        assigneeUids: [memberUser.uid],
        status: 'Chưa bắt đầu',
        nextStep: null,
        dueDate: null,
        sortOrder: 2,
      },
      memberUser,
      { taskId: 'test_task_emu_t12', logId: 'log_emu_t12' }
    );
    const batch = writeBatch(memberDb);
    batch.set(doc(memberDb, 'tasks', sub.taskId), sub.taskPayload);
    batch.set(
      doc(memberDb, 'tasks', sub.taskId, 'activityLogs', sub.logId),
      sub.logPayload
    );
    await assertSucceeds(batch.commit());

    // Member updates own T1.2 + activityLog via transaction
    await assertSucceeds(
      runTransaction(memberDb, async (tx) => {
        tx.update(doc(memberDb, 'tasks', sub.taskId), {
          status: 'Đang làm',
          version: 2,
          updatedAt: serverTimestamp(),
          updatedBy: memberUser.displayName,
          updatedByUid: memberUser.uid,
        });
        tx.set(
          doc(memberDb, 'tasks', sub.taskId, 'activityLogs', 'log_emu_upd'),
          {
            id: 'log_emu_upd',
            taskId: sub.taskId,
            actorUid: memberUser.uid,
            actorName: memberUser.displayName,
            action: 'status_change',
            summary: 'Đổi trạng thái',
            createdAt: serverTimestamp(),
          }
        );
      })
    );

    // Member cannot create parent task, edit unassigned T2, or write orphan activityLog
    const parentAttempt = buildCreateTaskPayloads(
      {
        displayCode: 'T3',
        title: 'Illegal parent',
        parentId: null,
        categoryId: null,
        category: null,
        assignees: [memberUser.displayName],
        assigneeUids: [memberUser.uid],
        status: 'Chưa bắt đầu',
        nextStep: null,
        dueDate: null,
        sortOrder: 3,
      },
      memberUser,
      { taskId: 'test_task_bad_parent', logId: 'log_bad_parent' }
    );
    await assertFails(
      setDoc(doc(memberDb, 'tasks', parentAttempt.taskId), parentAttempt.taskPayload)
    );
    await assertFails(
      updateDoc(doc(memberDb, 'tasks', 'b1_test_unassigned'), {
        nextStep: 'hack',
        version: 2,
        updatedAt: serverTimestamp(),
        updatedByUid: memberUser.uid,
      })
    );
    await assertFails(
      setDoc(
        doc(memberDb, 'tasks', 'b1_test_parent', 'activityLogs', 'orphan_log'),
        {
          id: 'orphan_log',
          taskId: 'b1_test_parent',
          actorUid: memberUser.uid,
          actorName: memberUser.displayName,
          action: 'update',
          summary: 'Orphan log',
          createdAt: serverTimestamp(),
        }
      )
    );

    // Viewer cannot create, update, or delete
    await assertFails(
      setDoc(doc(viewerDb, 'tasks', 'viewer_illegal_create'), {
        id: 'viewer_illegal_create',
        displayCode: 'V1',
        parentId: null,
        sortOrder: 99,
        title: 'Viewer create',
        categoryId: null,
        category: null,
        assignees: [],
        assigneeUids: [],
        status: 'Chưa bắt đầu',
        nextStep: null,
        dueDate: null,
        notes: null,
        referenceLinks: [],
        resultLinks: [],
        reviewFlags: [],
        version: 1,
        updatedAt: serverTimestamp(),
        updatedBy: viewerUser.displayName,
        updatedByUid: viewerUser.uid,
        archivedAt: null,
        archivedBy: null,
        isTestRecord: true,
      })
    );
    await assertFails(
      updateDoc(doc(viewerDb, 'tasks', 'b1_test_parent'), {
        nextStep: 'viewer',
        version: 2,
        updatedAt: serverTimestamp(),
        updatedByUid: viewerUser.uid,
      })
    );

    // Stage B2.1 dry-run verification against unmodified firestore.rules in Emulator:
    // Admin can atomically write the 20 official tasks (isTestRecord: false, assigneeUids: []) + 20 logs
    // while keeping B1 test records (T1, T1.2, T2) untouched.
    const adminDb = testEnv
      .authenticatedContext(adminUser.uid, {
        email: adminUser.email,
        email_verified: true,
      })
      .firestore();

    const dataset = parseOfficialJsonDataset(officialJsonRaw);
    const fullCategories: CategoryItem[] = DEFAULT_TBHGN_CATEGORIES.map((c) => ({
      ...c,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: adminUser.uid,
      updatedBy: adminUser.uid,
    }));
    const plan = buildOfficialImportPlan(dataset, sampleTasks, fullCategories);
    assert.equal(plan.summary.readyToImportCount, 20);

    const officialBatch = writeBatch(adminDb);
    const batchTs = serverTimestamp();
    for (const item of plan.items) {
      const { taskId, logId, taskPayload, logPayload } =
        buildOfficialTaskFirestoreWritePayloads(
          item,
          adminUser,
          batchTs,
          'emu_b2'
        );
      officialBatch.set(doc(adminDb, 'tasks', taskId), taskPayload);
      officialBatch.set(
        doc(adminDb, 'tasks', taskId, 'activityLogs', logId),
        logPayload
      );
    }
    await assertSucceeds(officialBatch.commit());

    // Confirm B1 test tasks persisted untouched alongside official tasks
    const b1ParentSnap = await getDoc(doc(adminDb, 'tasks', 'b1_test_parent'));
    assert.equal(b1ParentSnap.exists(), true);
    assert.equal(b1ParentSnap.data()?.isTestRecord, true);

    const official5Snap = await getDoc(doc(adminDb, 'tasks', 'tbhgn_5'));
    assert.equal(official5Snap.exists(), true);
    assert.equal(official5Snap.data()?.isTestRecord, false);
    assert.equal(official5Snap.data()?.notes, 'Trạng thái gốc: Đang chỉnh sửa');
    assert.deepEqual(official5Snap.data()?.assigneeUids, []);

    const official45Snap = await getDoc(doc(adminDb, 'tasks', 'tbhgn_4_5'));
    assert.equal(official45Snap.exists(), true);
    assert.equal(official45Snap.data()?.status, null);

    // Stage B2.2 Readback verification against Firestore Emulator tasks collection
    const allDocsSnap = await getDocs(collection(adminDb, 'tasks'));
    const readbackTasks: TaskItem[] = allDocsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        displayCode: String(data.displayCode ?? ''),
        parentId: typeof data.parentId === 'string' ? data.parentId : null,
        sortOrder: Number(data.sortOrder ?? 0),
        title: String(data.title ?? ''),
        categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
        category: (data.category as string | null) ?? null,
        assignees: Array.isArray(data.assignees) ? (data.assignees as string[]) : [],
        assigneeUids: Array.isArray(data.assigneeUids) ? (data.assigneeUids as string[]) : [],
        status: (data.status as TaskItem['status']) ?? null,
        nextStep: typeof data.nextStep === 'string' ? data.nextStep : null,
        dueDate: typeof data.dueDate === 'string' ? data.dueDate : null,
        updatedAt: null,
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
        version: Number(data.version ?? 1),
        referenceLinks: Array.isArray(data.referenceLinks) ? (data.referenceLinks as TaskItem['referenceLinks']) : [],
        resultLinks: Array.isArray(data.resultLinks) ? (data.resultLinks as TaskItem['resultLinks']) : [],
        reviewFlags: Array.isArray(data.reviewFlags) ? (data.reviewFlags as TaskItem['reviewFlags']) : [],
        notes: typeof data.notes === 'string' ? data.notes : null,
        archivedAt: null,
        archivedBy: null,
        isTestRecord: Boolean(data.isTestRecord),
      };
    });

    const verification = computeOfficialFirestoreVerification(
      readbackTasks,
      plan.items.map((i) => i.normalizedPayload.id)
    );
    assert.equal(verification.allChecksPassed, true);
    assert.equal(verification.officialCount, 20);
    assert.equal(verification.parentCount, 9);
    assert.equal(verification.childCount, 11);
    assert.deepEqual(verification.groupProgress, {
      tbhgn_3: { completed: 0, total: 2 },
      tbhgn_4: { completed: 0, total: 5 },
      tbhgn_5: { completed: 0, total: 4 },
    });
    assert.equal(verification.resultUrlCount, 13);
    assert.equal(verification.statusCounts.inProgress, 7);
    assert.equal(verification.statusCounts.pendingApproval, 2);
    assert.equal(verification.statusCounts.paused, 10);
    assert.equal(verification.statusCounts.unsetNull, 1);
    assert.equal(verification.nonEmptyAssigneeUidCount, 0);
    assert.equal(verification.wrongTestFlagCount, 0);
    assert.ok(verification.b1TestTaskCount >= 2);

    // Stage B2.2 Idempotency check: re-evaluating plan against server readback skips all 20
    const rerunPlan = buildOfficialImportPlan(dataset, readbackTasks, fullCategories);
    assert.equal(rerunPlan.summary.duplicateIdCount, 20);
    assert.equal(rerunPlan.summary.readyToImportCount, 0);
    assert.equal(rerunPlan.summary.readiness, 'already_imported');

    // Stage B2.3 Emulator check: Admin assigns temp UID -> swaps to official UID & revokes old UID
    // without losing task data, resultLinks, or prior activityLogs
    const tempUid = 'uid_temp_khanh';
    const officialUid = 'uid_official_khanh';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const edb = ctx.firestore();
      for (const [uid, email, name] of [
        [tempUid, 'filmfata02@gmail.com', 'Khánh (Tạm)'],
        [officialUid, 'khanh.official@gmail.com', 'Khánh (Chính thức)'],
      ]) {
        await setDoc(doc(edb, 'users', uid), {
          uid,
          email,
          displayName: name,
          sheetAlias: 'Khánh',
          role: 'member',
          canApprove: false,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    const tempDb = testEnv
      .authenticatedContext(tempUid, {
        email: 'filmfata02@gmail.com',
        email_verified: true,
      })
      .firestore();
    const officialDb = testEnv
      .authenticatedContext(officialUid, {
        email: 'khanh.official@gmail.com',
        email_verified: true,
      })
      .firestore();

    // 1. Assign temp UID to official task tbhgn_5
    await assertSucceeds(
      runTransaction(adminDb, async (tx) => {
        tx.update(doc(adminDb, 'tasks', 'tbhgn_5'), {
          assigneeUids: [tempUid],
          version: 2,
          updatedAt: serverTimestamp(),
          updatedBy: adminUser.displayName,
          updatedByUid: adminUser.uid,
        });
        tx.set(doc(adminDb, 'tasks', 'tbhgn_5', 'activityLogs', 'log_b23_assign_temp'), {
          id: 'log_b23_assign_temp',
          taskId: 'tbhgn_5',
          actorUid: adminUser.uid,
          actorName: adminUser.displayName,
          action: 'update',
          summary: 'Xác nhận liên kết 1 UID thực hiện',
          createdAt: serverTimestamp(),
        });
      })
    );

    // 2. Temp account can update while assigned
    await assertSucceeds(
      runTransaction(tempDb, async (tx) => {
        tx.update(doc(tempDb, 'tasks', 'tbhgn_5'), {
          nextStep: 'Temp member cập nhật bước tiếp theo',
          version: 3,
          updatedAt: serverTimestamp(),
          updatedBy: 'Khánh (Tạm)',
          updatedByUid: tempUid,
        });
        tx.set(doc(tempDb, 'tasks', 'tbhgn_5', 'activityLogs', 'log_b23_temp_edit'), {
          id: 'log_b23_temp_edit',
          taskId: 'tbhgn_5',
          actorUid: tempUid,
          actorName: 'Khánh (Tạm)',
          action: 'update',
          summary: 'Cập nhật bước tiếp theo',
          createdAt: serverTimestamp(),
        });
      })
    );

    // 3. Admin swaps to official UID and revokes old temp UID
    await assertSucceeds(
      runTransaction(adminDb, async (tx) => {
        tx.update(doc(adminDb, 'tasks', 'tbhgn_5'), {
          assigneeUids: [officialUid],
          version: 4,
          updatedAt: serverTimestamp(),
          updatedBy: adminUser.displayName,
          updatedByUid: adminUser.uid,
        });
        tx.set(doc(adminDb, 'tasks', 'tbhgn_5', 'activityLogs', 'log_b23_swap_official'), {
          id: 'log_b23_swap_official',
          taskId: 'tbhgn_5',
          actorUid: adminUser.uid,
          actorName: adminUser.displayName,
          action: 'update',
          summary: 'Đổi liên kết tài khoản UID (thu hồi 1 UID cũ, gán 1 UID mới)',
          createdAt: serverTimestamp(),
        });
      })
    );

    // 4. Old temp UID is immediately blocked; official UID can edit; history & task data preserved
    await assertFails(
      updateDoc(doc(tempDb, 'tasks', 'tbhgn_5'), {
        nextStep: 'Old UID stale write',
        version: 5,
        updatedAt: serverTimestamp(),
        updatedByUid: tempUid,
      })
    );
    await assertSucceeds(
      runTransaction(officialDb, async (tx) => {
        tx.update(doc(officialDb, 'tasks', 'tbhgn_5'), {
          nextStep: 'Official member tiếp quản mượt mà',
          version: 5,
          updatedAt: serverTimestamp(),
          updatedBy: 'Khánh (Chính thức)',
          updatedByUid: officialUid,
        });
        tx.set(doc(officialDb, 'tasks', 'tbhgn_5', 'activityLogs', 'log_b23_official_edit'), {
          id: 'log_b23_official_edit',
          taskId: 'tbhgn_5',
          actorUid: officialUid,
          actorName: 'Khánh (Chính thức)',
          action: 'update',
          summary: 'Cập nhật bước tiếp theo',
          createdAt: serverTimestamp(),
        });
      })
    );

    const swappedSnap = await getDoc(doc(adminDb, 'tasks', 'tbhgn_5'));
    assert.equal(swappedSnap.data()?.notes, 'Trạng thái gốc: Đang chỉnh sửa');
    assert.deepEqual(swappedSnap.data()?.assigneeUids, [officialUid]);
    const logsSnap = await getDocs(collection(adminDb, 'tasks', 'tbhgn_5', 'activityLogs'));
    assert.ok(logsSnap.docs.length >= 4);
  } finally {
    await testEnv.cleanup();
  }
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

test('Stage B1 & B2.2 boundary: App.tsx never imports Stage A seed and ImportPreviewView never auto-imports on mount', () => {
  assert.equal(appText.includes('SEED_TASKS'), false);
  assert.equal(appText.includes('localStorage'), false);
  assert.equal(serviceText.includes('isTestRecord: true'), true);
  assert.equal(importPreviewText.includes('importOfficialTasksToFirestore'), false);
  assert.equal(appText.includes('onExecuteImport={handleExecuteOfficialImport}'), true);
});

test('Stage B2.1 official import plan preserves exact 20 tasks, 13 URLs, 7 flagged items, and conflict/duplicate detection', () => {
  const dataset = parseOfficialJsonDataset(officialJsonRaw);
  const fullCategories: CategoryItem[] = DEFAULT_TBHGN_CATEGORIES.map((c) => ({
    ...c,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: adminUser.uid,
    updatedBy: adminUser.uid,
  }));

  const { items, summary } = buildOfficialImportPlan(
    dataset,
    sampleTasks,
    fullCategories
  );

  assert.equal(summary.totalTasks, 20);
  assert.equal(summary.parentCount, 9);
  assert.equal(summary.childCount, 11);
  assert.deepEqual(summary.groupProgress, {
    tbhgn_3: { completed: 0, total: 2 },
    tbhgn_4: { completed: 0, total: 5 },
    tbhgn_5: { completed: 0, total: 4 },
  });
  assert.equal(summary.preservedResultUrlCount, 13);
  assert.equal(summary.statusCounts.inProgress, 7);
  assert.equal(summary.statusCounts.pendingApproval, 2);
  assert.equal(summary.statusCounts.paused, 10);
  assert.equal(summary.statusCounts.unsetNull, 1);
  assert.equal(summary.missingAssigneeTasks.length, 6);
  assert.equal(summary.missingStatusTasks.length, 1);
  assert.equal(summary.missingHyperlinkTasks.length, 0);
  assert.equal(summary.flaggedTasks.length, 7);
  assert.equal(summary.duplicateIdCount, 0);
  assert.equal(summary.codeConflictCount, 0);
  assert.equal(summary.readyToImportCount, 20);
  assert.equal(summary.existingTestRecordCount, 3);
  assert.equal(summary.missingRequiredCategories.length, 0);
  assert.equal(summary.readiness, 'ready');

  // Verify stripped non-rule fields & preserved fields
  const task5 = items.find((i) => i.normalizedPayload.id === 'tbhgn_5')!;
  assert.equal(task5.normalizedPayload.notes, 'Trạng thái gốc: Đang chỉnh sửa');
  assert.equal(task5.normalizedPayload.categoryId, 'cat_research');
  assert.equal(task5.normalizedPayload.isTestRecord, false);
  assert.deepEqual(task5.normalizedPayload.assigneeUids, []);

  const payloadCheck = buildOfficialTaskFirestoreWritePayloads(
    task5,
    adminUser,
    'TS',
    'test'
  );
  assert.equal('lastCheckedAt' in payloadCheck.taskPayload, false);
  assert.equal('migrationSourceRow' in payloadCheck.taskPayload, false);

  // Verify idempotent duplicate detection, code conflict detection, and preflight gate
  assert.equal(validateOfficialImportPreflight(items, summary).ok, true);

  const task1AsExisting: TaskItem = {
    ...sampleTasks[0],
    id: 'tbhgn_1',
    displayCode: '1',
    isTestRecord: false,
  };
  const codeConflictTask: TaskItem = {
    ...sampleTasks[0],
    id: 'custom_other_id',
    displayCode: '2',
    isTestRecord: true,
  };
  const conflictPlan = buildOfficialImportPlan(
    dataset,
    [task1AsExisting, codeConflictTask],
    fullCategories
  );
  assert.equal(conflictPlan.summary.duplicateIdCount, 1);
  assert.equal(conflictPlan.summary.codeConflictCount, 1);
  assert.equal(conflictPlan.summary.readyToImportCount, 18);
  assert.equal(conflictPlan.summary.readiness, 'has_conflicts');
  assert.equal(
    validateOfficialImportPreflight(conflictPlan.items, conflictPlan.summary).ok,
    false
  );

  // Verify missing category readiness gate
  const missingCatPlan = buildOfficialImportPlan(dataset, sampleTasks, []);
  assert.equal(missingCatPlan.summary.missingRequiredCategories.length, 3);
  assert.equal(missingCatPlan.summary.readiness, 'needs_categories');
  assert.equal(
    validateOfficialImportPreflight(missingCatPlan.items, missingCatPlan.summary).ok,
    false
  );
});

test('Stage B2.3 member mapping preview, temporary account guardrails, and safe UID toggle merger', () => {
  const dataset = parseOfficialJsonDataset(officialJsonRaw);
  const fullCategories: CategoryItem[] = DEFAULT_TBHGN_CATEGORIES.map((c) => ({
    ...c,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: adminUser.uid,
    updatedBy: adminUser.uid,
  }));
  const { items } = buildOfficialImportPlan(dataset, sampleTasks, fullCategories);
  const officialTasks: TaskItem[] = items.map((i) => ({
    ...i.normalizedPayload,
    updatedAt: null,
    updatedBy: null,
  }));

  const quocSignedIn: ProjectMember = {
    uid: 'uid_quoc_live',
    displayName: 'Quốc',
    email: 'tduyquoc@gmail.com',
    role: 'member',
    canApprove: false,
    isActive: true,
    sheetAlias: 'Quốc',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const khanhInvitedOnly: MemberInvite = {
    email: 'filmfata02@gmail.com',
    displayName: 'Khánh',
    sheetAlias: 'Khánh',
    role: 'member',
    canApprove: false,
    isActive: true,
    createdBy: adminUser.uid,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // Temporary account defaults never grant admin or canApprove
  for (const acc of EXPECTED_TBHGN_ACCOUNTS) {
    const safe = getSafeInviteDefaults(acc);
    assert.equal(safe.role, 'member');
    assert.equal(safe.canApprove, false);
    if (acc.email.startsWith('filmfata')) {
      assert.equal(isTemporaryAccountEmail(acc.email), true);
    } else {
      assert.equal(isTemporaryAccountEmail(acc.email), false);
    }
  }

  const preview = buildMemberMappingPreview(
    EXPECTED_TBHGN_ACCOUNTS,
    [adminUser, quocSignedIn],
    [khanhInvitedOnly],
    [...sampleTasks, ...officialTasks]
  );

  // Focuses on the 20 official tasks when present, never auto-assigns UIDs
  assert.equal(preview.scopeTaskCount, 20);
  assert.equal(preview.tasksUnlinkedUidCount, 20);
  assert.equal(preview.signedInExpectedCount, 1);
  assert.equal(preview.invitedPendingExpectedCount, 1);
  assert.equal(preview.temporaryExpectedCount, 4);

  const quocRow = preview.accountRows.find(
    (r) => r.account.email === 'tduyquoc@gmail.com'
  )!;
  assert.equal(quocRow.signInStatus, 'signed_in');
  assert.equal(quocRow.linkedTaskCodes.length, 0);
  assert.ok(quocRow.readyToConfirmCount > 0);

  const suPhuRow = preview.accountRows.find(
    (r) => r.account.email === 'filmfata01@gmail.com'
  )!;
  assert.equal(suPhuRow.signInStatus, 'not_invited');
  assert.equal(suPhuRow.hasPrivilegeWarning, false);

  // Alias rows keep uninvited/temporary aliases in "Chưa liên kết tài khoản"
  const quocAlias = preview.aliasRows.find((r) => r.alias === 'Quốc')!;
  assert.equal(quocAlias.linkStatus, 'ready_to_link');
  const myAlias = preview.aliasRows.find((r) => r.alias === 'Mỵ')!;
  assert.equal(myAlias.linkStatus, 'unlinked');
  assert.equal(myAlias.statusLabel, 'Chưa liên kết tài khoản');

  // Verify temporary privilege warning triggers if someone manually gave temp account admin/approve
  const escalatedPreview = buildMemberMappingPreview(
    EXPECTED_TBHGN_ACCOUNTS,
    [
      {
        uid: 'uid_bad_temp',
        displayName: 'Sư Phụ',
        email: 'filmfata01@gmail.com',
        role: 'admin',
        canApprove: true,
        isActive: true,
        sheetAlias: 'Sư Phụ',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    [],
    officialTasks
  );
  assert.equal(escalatedPreview.accountRows[1].hasPrivilegeWarning, true);

  // Verify TaskDetailDrawer UID toggle preserves unrelated Sheet aliases & "Chưa liên kết tài khoản"
  const merged1 = computeUpdatedAssigneeNamesOnUidToggle(
    'Quốc, Khả Tuệ',
    quocSignedIn,
    [quocSignedIn.uid],
    [quocSignedIn]
  );
  assert.equal(merged1, 'Quốc, Khả Tuệ');

  // Revoking the last UID keeps human name for "Chưa liên kết tài khoản"
  const tempKhanh: ProjectMember = {
    uid: 'uid_temp_khanh',
    displayName: 'Khánh (Tạm)',
    email: 'filmfata02@gmail.com',
    role: 'member',
    canApprove: false,
    isActive: true,
    sheetAlias: 'Khánh',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const officialKhanh: ProjectMember = {
    uid: 'uid_official_khanh',
    displayName: 'Khánh (Chính thức)',
    email: 'khanh@tbhgn.vn',
    role: 'member',
    canApprove: false,
    isActive: true,
    sheetAlias: 'Khánh',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(
    computeUpdatedAssigneeNamesOnUidToggle(
      'Khánh',
      tempKhanh,
      [],
      [tempKhanh, officialKhanh]
    ),
    'Khánh'
  );
  // Swapping temp UID -> official UID keeps shared alias "Khánh"
  assert.equal(
    computeUpdatedAssigneeNamesOnUidToggle(
      'Khánh',
      tempKhanh,
      [officialKhanh.uid],
      [tempKhanh, officialKhanh]
    ),
    'Khánh'
  );
});

