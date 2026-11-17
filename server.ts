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

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
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
  app.listen(port, '0.0.0.0', () => {
    console.log(`TBHGN server running on http://0.0.0.0:${port}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start TBHGN server:', err);
  process.exit(1);
});
