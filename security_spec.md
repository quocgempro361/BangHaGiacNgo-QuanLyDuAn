# TBHGN Stage B1 — Security Specification & Dirty Dozen Matrix

## 1. Data Invariants
1. Default-deny catch-all at `/databases/{database}/documents/{document=**}`.
2. Unauthenticated or unverified-email requests (`email_verified != true`) cannot read or write any document.
3. Authenticated Google users not present in `/users/{uid}` with `isActive == true` cannot read or write `tasks`, `categories`, `comments`, `activityLogs`, or list `users`/`invites`.
4. Non-admin users cannot create or modify `role`, `canApprove`, or `isActive` on `/users/{uid}` or `/invites/{emailId}`.
5. Bootstrapped owner (`ngaothuyet2023@gmail.com`) can only initialize their own `/users/{uid}` after verified Google sign-in; no arbitrary Gmail account can self-assign `admin`.
6. Viewers (`role == 'viewer'`) have strict read-only access on `tasks`, `categories`, `comments`, and `activityLogs`, and cannot read other users' PII emails.
7. Task permissions bind strictly to Firebase UID (`assigneeUids`), never to text display names (`assignees`, `sheetAlias`, or `"Nhóm"`).
8. Members (`role == 'member'`) can update only progress fields (`status`, `nextStep`, `notes`, `referenceLinks`, `resultLinks`, `version`, `updatedAt`, `updatedBy`, `updatedByUid`) on tasks where `request.auth.uid in assigneeUids`, cannot change `categoryId`/`parentId`/`assigneeUids`/`archivedAt`, and cannot set `status == 'Hoàn thành'` unless `canApprove == true` within scope.
9. Members can create ONLY 2nd-level child tasks (`parentId != null` referencing an active top-level parent `parent.parentId == null && parent.archivedAt == null` where `request.auth.uid in parent.assigneeUids`), verified via `existsAfter`/`getAfter` to support both sequential and batch creation.
10. `/categories/{categoryId}` is readable by active members (`isActiveMember()`) and writable (`create`, `update`, `delete`) strictly by `isAdmin()`, never granting admin privileges on creation.
11. `activityLogs` are immutable (`allow update, delete: if false`) and can only be created atomically alongside a task mutation (`getAfter(tasks/{taskId}).data.updatedAt == request.time`) with `actorUid == request.auth.uid`.
12. All task updates enforce `incoming().version == existing().version + 1` and `incoming().updatedAt == request.time`.

## 2. Dirty Dozen Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. Unauthenticated read/write on `/tasks/{taskId}` or `/categories/{categoryId}`.
2. Unapproved Google user read/write on `/tasks/{taskId}`, `/categories/{categoryId}`, or `/users/{otherUid}`.
3. Locked user (`isActive: false`) read/write on `/tasks/{taskId}` or `/categories/{categoryId}`.
4. Viewer attempting `setDoc`/`updateDoc` on `/tasks/{taskId}`, `/categories/{categoryId}`, or `addDoc` on `comments`.
5. Non-admin Member attempting self-promotion `{ role: 'admin', canApprove: true }` on `/users/{ownUid}`.
6. Arbitrary Gmail user (not invited, not bootstrap owner) attempting to create `/users/{ownUid}` with `role: 'admin'`.
7. Spoofed token with `email_verified: false` attempting bootstrap or invite activation.
8. Member attempting to edit a task where their `sheetAlias` is in `assignees` (or `"Nhóm"` is in `assignees`) but `uid` is NOT in `assigneeUids`.
9. Member attempting to create a parent task (`parentId: null`) or create a child task under a parent where their `uid` is NOT in `parent.assigneeUids`.
10. Member attempting to create/update/delete `/categories/{categoryId}` or assign `categoryId` during update.
11. Member attempting to create a 3rd-level subtask (`parentId` pointing to a child task whose `parentId != null`).
12. Member attempting to inject a standalone fake `activityLog` without updating the parent task atomically, or forging `actorUid`.
