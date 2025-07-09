import express, { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // load .env

export const app = express();
app.use(express.json({ limit: '10mb' }));

// Log JSON payloads for easier debugging
app.use((req, _res, next) => {
  if (req.is('application/json') && Object.keys(req.body || {}).length > 0) {
    console.log(`Payload for ${req.method} ${req.path}:`, req.body);
  }
  next();
});

// In-memory token issued by /auth for PLINK
let issuedToken = 'test-token';

// KAAT token from env
const KAAT_TOKEN = process.env.KAAT_TOKEN;

// ------------------
// Multer configuration
// ------------------

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_SIZE = {
  video: 10 * 1024 * 1024,     // 10 MB
  car_photo: 1 * 1024 * 1024,  // 1 MB
  full_photo: 4 * 1024 * 1024, // 4 MB
};

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.fieldname === 'video' && file.mimetype !== 'video/mp4') {
    return cb(
      new Error(
        `Invalid file type for field "${file.fieldname}". Received: "${file.mimetype}". Expected: "video/mp4".`
      )
    );
  }
  if (
    (file.fieldname === 'car_photo' || file.fieldname === 'full_photo') &&
    !['image/jpeg', 'image/jpg'].includes(file.mimetype)
  ) {
    return cb(
      new Error(
        `Invalid file type for field "${file.fieldname}". Received: "${file.mimetype}". Expected: "image/jpeg" or "image/jpg".`
      )
    );
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE.video } // global cap; per-file checked later
});

// ------------------
// Auth middlewares
// ------------------

// PLINK: token issued via POST /auth
function plinkAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'PLINK: Unauthorized' });
  }
  const token = auth.slice('Bearer '.length);
  if (token !== issuedToken) {
    return res.status(401).json({ status: 'error', message: 'PLINK: Invalid token' });
  }
  next();
}

// KAAT: token provided in .env as KAAT_TOKEN
function kaatAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'ERROR', message: 'KAAT: Unauthorized' });
  }
  const token = auth.slice('Bearer '.length);
  if (token !== KAAT_TOKEN) {
    return res.status(401).json({ status: 'ERROR', message: 'KAAT: Invalid token', data: { token, KAAT_TOKEN } });
  }
  next();
}

// ------------------
// METRICS
// ------------------

const processStartTime = Date.now();
const dockerImageCreatedAt = process.env.DOCKER_IMAGE_CREATED_AT || null;

interface Metrics {
  kaatSuccess: number;
  searchSuccess: number;
  errors: Record<string, number>;
  lastErrorDate: string | null;
  plinkSuccess: number;
  plinkErrors: Record<string, number>;
  plinkLastErrorDate: string | null;
  uptimeSeconds: number;
  dockerImageCreatedAt: string | null;
}

const metrics: Omit<Metrics, 'uptimeSeconds' | 'dockerImageCreatedAt'> = {
  kaatSuccess: 0,
  searchSuccess: 0,
  errors: {},
  lastErrorDate: null,
  plinkSuccess: 0,
  plinkErrors: {},
  plinkLastErrorDate: null,
};

function incError(errorType: string) {
  metrics.errors[errorType] = (metrics.errors[errorType] || 0) + 1;
  metrics.lastErrorDate = new Date().toISOString();
}

function incPlinkError(errorType: string) {
  metrics.plinkErrors[errorType] = (metrics.plinkErrors[errorType] || 0) + 1;
  metrics.plinkLastErrorDate = new Date().toISOString();
}

// ------------------
// LAST VIOLATIONS
// ------------------

type ViolationMeta = {
  pID: any;
  pPlateNumber: any;
  pViolation: any;
  pActualSpeed: any;
  pViolationDate: any;
  pViolationTime: any;
  pRegion: any;
  pDistrict: any;
  pPlace: any;
  pLink: any;
  createdAt: string;
};

const lastViolations: ViolationMeta[] = [];

function addViolationMeta(body: any) {
  const meta: ViolationMeta = {
    pID: body.pID,
    pPlateNumber: body.pPlateNumber,
    pViolation: body.pViolation,
    pActualSpeed: body.pActualSpeed,
    pViolationDate: body.pViolationDate,
    pViolationTime: body.pViolationTime,
    pRegion: body.pRegion,
    pDistrict: body.pDistrict,
    pPlace: body.pPlace,
    pLink: body.pLink,
    createdAt: new Date().toISOString(),
  };
  lastViolations.unshift(meta);
  if (lastViolations.length > 10) lastViolations.length = 10;
}

// ------------------
// Routes
// ------------------

// Вспомогательная функция для логирования ответов
function logResponse(req: Request, res: Response, body: any) {
  const status = res.statusCode;
  const msg = body?.message || body?.status || '';
  console.log(`RESPONSE [${req.method} ${req.path}] status=${status} message="${msg}" body=`, body);
}

// 1. Login to get PLINK token
app.post('/auth', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    const resp = {
      status: 'error',
      message: 'Missing credentials',
      missing: [!username ? 'username' : undefined, !password ? 'password' : undefined].filter(Boolean),
      received: req.body
    };
    logResponse(req, res, resp);
    return res.status(400).json(resp);
  }
  issuedToken = Math.random().toString(36).substring(2);
  console.log(`Authenticated user ${username}, issued token ${issuedToken}`);
  const resp = {
    code: 200,
    message: 'Successfully logged in!',
    data: {
      token: issuedToken,
      expiresIn: 86400,
    },
  };
  logResponse(req, res, resp);
  res.json(resp);
});

// 2. PLINK upload (video + photos)
app.post(
  '/video/upload',
  plinkAuth,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'car_photo', maxCount: 1 },
    { name: 'full_photo', maxCount: 1 }
  ]),
  (req: Request, res: Response) => {
    const { id, car_number, the_date, rule_id } = req.body;
    const missingFields = [
      !id ? 'id' : undefined,
      !car_number ? 'car_number' : undefined,
      !the_date ? 'the_date' : undefined,
      !rule_id ? 'rule_id' : undefined
    ].filter(Boolean);
    if (missingFields.length > 0) {
      const resp = {
        status: 'error',
        message: 'Missing required form fields',
        missing: missingFields,
        received: req.body
      };
      incPlinkError('Missing required form fields');
      logResponse(req, res, resp);
      return res.status(400).json(resp);
    }

    const files = req.files as { [key: string]: Express.Multer.File[] };
    const video = files.video?.[0];
    const carPhoto = files.car_photo?.[0];
    const fullPhoto = files.full_photo?.[0];

    const missingFiles = [
      !video ? 'video' : undefined,
      !carPhoto ? 'car_photo' : undefined,
      !fullPhoto ? 'full_photo' : undefined
    ].filter(Boolean);
    if (missingFiles.length > 0) {
      const resp = {
        status: 'error',
        message: 'Missing files',
        missing: missingFiles
      };
      incPlinkError('Missing files');
      logResponse(req, res, resp);
      return res.status(400).json(resp);
    }

    // Per-file size validation
    const checks: Array<{ file: Express.Multer.File; limit: number; name: string }> = [
      { file: video, limit: MAX_SIZE.video, name: 'video' },
      { file: carPhoto, limit: MAX_SIZE.car_photo, name: 'car_photo' },
      { file: fullPhoto, limit: MAX_SIZE.full_photo, name: 'full_photo' }
    ];
    for (const { file, limit, name } of checks) {
      if (file.size > limit) {
        fs.unlinkSync(file.path);
        const resp = {
          status: 'error',
          message: `${name} exceeds size limit`,
          fileSize: file.size,
          limit,
          field: name
        };
        incPlinkError(`${name} exceeds size limit`);
        logResponse(req, res, resp);
        return res.status(400).json(resp);
      }
    }

    const guid = Math.random().toString(36).substring(2, 10);
    const url = `https://mock.example/${guid}`;
    const resp = { code: 200, data: { guid, url } };
    metrics.plinkSuccess++;
    logResponse(req, res, resp);
    res.json(resp);
  }
);

// 3. KAAT event creation
app.post(
  '/billing-api/v1/device-event/create',
  kaatAuth,
  (req: Request, res: Response) => {
    // Список обязательных полей
    const requiredFields = [
      "pID",
      "pDeviceNumber",
      "pViolation",
      "pPlateNumber",
      "pValidSpeed",
      "pActualSpeed",
      "pViolationDate",
      "pViolationTime",
      "pRegion",
      "pDistrict",
      "pPlace",
      "pPlaceLatitude",
      "pPlaceLongitude",
      "pPhoto",
      "pPhotoPlate",
      "pPhotoAdditional",
      "pLink"
    ];

    // Определить, каких полей нет
    const missing = requiredFields.filter((field) => !(field in req.body));
    if (missing.length > 0) {
      const resp = {
        status: 'ERROR',
        message: 'Missing required fields',
        missing,
        received: req.body
      };
      incError('Missing required fields');
      logResponse(req, res, resp);
      return res.status(400).json(resp);
    }

    // Доп. валидация на null/undefined/пустую строку для важных полей
    const emptyFields = requiredFields.filter(
      (field) =>
        req.body[field] === null ||
        req.body[field] === undefined ||
        (typeof req.body[field] === 'string' && req.body[field].trim() === '')
    );
    if (emptyFields.length > 0) {
      const resp = {
        status: 'ERROR',
        message: 'Some required fields are empty',
        emptyFields,
        received: req.body
      };
      incError('Some required fields are empty');
      logResponse(req, res, resp);
      return res.status(400).json(resp);
    }

    // Далее твоя логика проверки скорости и кода нарушения...

    const speed = Math.abs(Number(req.body.pActualSpeed));
    if (Number.isNaN(speed)) {
      const resp = {
        status: 'REJECT',
        message: 'Invalid speed',
        received: req.body.pActualSpeed
      };
      incError('Invalid speed');
      logResponse(req, res, resp);
      return res.status(400).json(resp);
    }

    let expectedViolation: number | null = null;
    if ([36, 37, 201, 202].includes(Number(req.body.pViolation)) || Number(req.body.pViolation) >= 65) {
      if (speed <= 65) {
        const resp = {
          status: 'REJECT',
          message: 'No violation detected speed <= 65',
          actualSpeed: req.body.pActualSpeed
        };
        incError('No violation detected');
        logResponse(req, res, resp);
        return res.status(400).json(resp);
      } else if (speed <= 85) {
        expectedViolation = 36;
      } else if (speed <= 105) {
        expectedViolation = 37;
      } else if (speed <= 125) {
        expectedViolation = 201;
      } else {
        expectedViolation = 202;
      }
      
      if (expectedViolation !== Number(req.body.pViolation)) {
        const resp = {
          status: 'REJECT',
          message: 'Violation code does not match speed',
          actualSpeed: req.body.pActualSpeed,
          expectedViolation,
          receivedViolation: req.body.pViolation
        };
        incError('Violation code does not match speed');
        logResponse(req, res, resp);
        return res.status(400).json(resp);
      }
    }


    // Всё прошло!
    metrics.kaatSuccess++;
    addViolationMeta(req.body);
    const resp = {
      status: 'OK',
      message: 'Event saved successfully',
      event_id: req.body.pID
    };
    logResponse(req, res, resp);
    res.json(resp);
  }
);

// 4. Car-search input-all (no auth)
app.post('/car-search/v1/device-event/input-all', kaatAuth, (req: Request, res: Response) => {
  const events = req.body;
  if (!Array.isArray(events)) {
    console.log('Input-all failed: body is not array');
    const resp = {
      status: 'error',
      message: 'Expected array',
      receivedType: typeof events,
      received: events
    };
    incError('Input-all: not array');
    logResponse(req, res, resp);
    return res.status(400).json(resp);
  }
  metrics.searchSuccess++;
  console.log(`Inputting ${events.length} events`);
  const resp = { status: 'success', message: 'Data saved' };
  logResponse(req, res, resp);
  res.json(resp);
});

// ------------------
// METRICS endpoint
// ------------------

app.get('/metrics', (req: Request, res: Response) => {
  res.json({
    ...metrics,
    uptimeSeconds: Math.floor((Date.now() - processStartTime) / 1000),
    dockerImageCreatedAt,
  });
});

// ------------------
// METRICS RESET endpoint
// ------------------

app.get('/metrics/reset', (req: Request, res: Response) => {
  metrics.kaatSuccess = 0;
  metrics.searchSuccess = 0;
  metrics.errors = {};
  metrics.lastErrorDate = null;
  metrics.plinkSuccess = 0;
  metrics.plinkErrors = {};
  metrics.plinkLastErrorDate = null;
  res.json(metrics);
});

// ------------------
// LAST endpoint
// ------------------

app.get('/last', (req: Request, res: Response) => {
  res.json({ violations: lastViolations });
});

// ------------------
// Start server
// ------------------

export function startServer(port: number = Number(process.env.PORT) || 3000) {
  return app.listen(port, () => {
    console.log(`Mock server running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}
