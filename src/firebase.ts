import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Pass firestoreDatabaseId from firebase-applet-config.json
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Auth persistence setup warning:', err);
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  errorCode?: string;
  operationType: OperationType;
  path: string | null;
  databaseId?: string;
  sanitizedPayload?: Record<string, unknown>;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
    }[];
  };
}

const SENSITIVE_KEY_PATTERN = /(token|secret|password|credential|authorization|apikey|api_key)/i;

export function sanitizePayloadForLog(
  payload?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (Array.isArray(val)) {
      clean[key] = `[Array(${val.length})]`;
    } else if (typeof val === 'string' && val.length > 120) {
      clean[key] = `${val.slice(0, 120)}...`;
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  payloadSummary?: Record<string, unknown>
): never {
  const errorCode =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;

  const sanitizedPayload = sanitizePayloadForLog(payloadSummary);

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    errorCode,
    operationType,
    path,
    databaseId: firebaseConfig.firestoreDatabaseId,
    sanitizedPayload,
    authInfo: {
      userId: auth.currentUser?.uid,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
        })) || [],
    },
  };

  if (import.meta.env?.DEV) {
    console.error('[TBHGN Firestore Diagnostic]', {
      errorCode: errInfo.errorCode ?? 'unknown',
      operation: errInfo.operationType,
      path: errInfo.path,
      databaseId: errInfo.databaseId,
      uid: errInfo.authInfo.userId ?? null,
      emailVerified: errInfo.authInfo.emailVerified ?? null,
      payload: sanitizedPayload,
      message: errInfo.error,
    });
  } else {
    console.error('Firestore Error:', errInfo.errorCode ?? errInfo.operationType, errInfo.path);
  }

  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Không thể kết nối tới Firestore (the client is offline). Vui lòng kiểm tra cấu hình Firebase.'
      );
    }
  }
}

testConnection();

export { firebaseConfig };
