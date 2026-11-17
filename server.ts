import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

interface FirebaseConfigFile {
  projectId: string;
  firestoreDatabaseId?: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseConfigFile = JSON.parse(
  fs.readFileSync(configPath, 'utf8')
);

const BOOTSTRAP_ADMIN_EMAIL = (
  process.env.BOOTSTRAP_ADMIN_EMAIL || 'ngaothuyet2023@gmail.com'
)
  .trim()
  .toLowerCase();

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(FIREBASE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase public certs: ${resp.status}`);
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpiresAt = now + maxAgeSec * 1000;
  return cachedCerts;
}

interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64');
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Token không đúng định dạng JWT.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Thuật toán hoặc key ID của token không hợp lệ.');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Không tìm thấy chứng chỉ công khai khớp với token.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signature = decodeBase64Url(sigB64);
  if (!verifier.verify(certPem, signature)) {
    throw new Error('Chữ ký Firebase ID Token không hợp lệ.');
  }

  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;

  if (payload.aud !== firebaseConfig.projectId) {
    throw new Error('Token audience không khớp với dự án TBHGN.');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Token issuer không hợp lệ.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token thiếu UID.');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Phiên đăng nhập đã hết hạn.');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Thời gian phát hành token không hợp lệ.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('Tài khoản Google chưa xác minh email.');
  }

  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name || payload.email.split('@')[0],
  };
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId ?? '(default)',
    });
  });

  app.post('/api/auth/verify-session', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
      if (!token) {
        res.status(401).json({ error: 'Thiếu Firebase ID Token.' });
        return;
      }
      const verified = await verifyFirebaseIdToken(token);
      res.json({
        verified: true,
        uid: verified.uid,
        email: verified.email,
        emailVerified: verified.emailVerified,
        isBootstrapOwner: verified.email === BOOTSTRAP_ADMIN_EMAIL,
      });
    } catch (error) {
      res.status(401).json({
        verified: false,
        error: error instanceof Error ? error.message : 'Xác minh token thất bại.',
      });
    }
  });

  app.post('/api/auth/verify-bootstrap', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
      if (!token) {
        res.status(401).json({ error: 'Thiếu Firebase ID Token.' });
        return;
      }
      const verified = await verifyFirebaseIdToken(token);
      if (verified.email !== BOOTSTRAP_ADMIN_EMAIL) {
        res.status(403).json({
          allowed: false,
          error:
            'Tài khoản này không phải chủ dự án được chỉ định để khởi tạo Quản trị viên đầu tiên.',
        });
        return;
      }
      res.json({
        allowed: true,
        uid: verified.uid,
        email: verified.email,
        role: 'admin',
        canApprove: true,
      });
    } catch (error) {
      res.status(401).json({
        allowed: false,
        error: error instanceof Error ? error.message : 'Xác minh token thất bại.',
      });
    }
  });

  app.get('/api/admin/official-import-source', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
      if (!token) {
        res.status(401).json({ error: 'Yêu cầu đăng nhập Quản trị viên.' });
        return;
      }
      const verified = await verifyFirebaseIdToken(token);
      const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
      const userDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        firebaseConfig.projectId
      )}/databases/${encodeURIComponent(dbId)}/documents/users/${encodeURIComponent(
        verified.uid
      )}`;
      const userResp = await fetch(userDocUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userResp.ok) {
        res.status(403).json({
          error: 'Chỉ Quản trị viên đang hoạt động mới được truy cập dữ liệu nguồn.',
        });
        return;
      }
      const userDoc = (await userResp.json()) as {
        fields?: {
          role?: { stringValue?: string };
          isActive?: { booleanValue?: boolean };
        };
      };
      const isAdmin =
        userDoc.fields?.role?.stringValue === 'admin' &&
        userDoc.fields?.isActive?.booleanValue === true;
      if (!isAdmin) {
        res.status(403).json({
          error: 'Chỉ Quản trị viên đang hoạt động mới được truy cập dữ liệu nguồn.',
        });
        return;
      }

      const sourcePath = path.resolve(
        process.cwd(),
        'server_data',
        'TBHGN_du_lieu_20_cong_viec_da_khoi_phuc_URL_38662941.json'
      );
      if (!fs.existsSync(sourcePath)) {
        res.status(404).json({
          error:
            'Tệp JSON nguồn đã được gỡ bỏ khỏi máy chủ sau khi nhập hoàn tất lên Firestore.',
        });
        return;
      }
      const rawJson = fs.readFileSync(sourcePath, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rawJson);
    } catch (error) {
      res.status(401).json({
        error:
          error instanceof Error
            ? error.message
            : 'Không thể xác minh quyền Quản trị viên.',
      });
    }
  });

  // Ensure unmatched /api/* endpoints return JSON 404 instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint không tồn tại.' });
  });

  // Block direct HTTP access to server-only data, env, deploy templates, and rules/config files
  app.use((req, res, next) => {
    const reqPath = req.path.toLowerCase();
    if (reqPath === '/.env' || reqPath.startsWith('/.env.')) {
      res.status(403).json({ error: 'Truy cập bị từ chối.' });
      return;
    }
    next();
  });

  app.use(
    [
      '/server_data',
      '/dist-server',
      '/deploy',
      '/firestore.rules',
      '/firestore.rules.backup',
      '/firestore.rules.test.ts',
      '/firebase-blueprint.json',
      '/firebase-applet-config.json',
      '/security_spec.md',
      '/server.ts',
      '/package.json',
      '/tsconfig.json',
      '/tsconfig.server.json',
    ],
    (_req, res) => {
      res.status(403).json({ error: 'Truy cập bị từ chối.' });
    }
  );

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      throw new Error(
        'Không tìm thấy dist/index.html. Hãy chạy "npm run build" trước khi khởi động production.'
      );
    }

    app.use(
      express.static(distDir, {
        index: 'index.html',
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    // Express 4 & 5 compatible SPA fallback for client-side route refreshes
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(
      `TBHGN server running on http://${host}:${port} (env=${process.env.NODE_ENV || 'development'})`
    );
  });
}

createServer().catch((err) => {
  console.error('Failed to start TBHGN server:', err);
  process.exit(1);
});
