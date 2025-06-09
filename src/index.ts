import express, { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // load .env

export const app = express();
app.use(express.json({ limit: '10mb' }));

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
    return cb(new Error('Video must be MP4'));
  }
  if (
    (file.fieldname === 'car_photo' || file.fieldname === 'full_photo') &&
    !['image/jpeg', 'image/jpg'].includes(file.mimetype)
  ) {
    return cb(new Error('Photos must be JPEG'));
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
    return res.status(401).json({ status: 'ERROR', message: 'KAAT: Invalid token', data: {token, KAAT_TOKEN} });
  }
  next();
}

// ------------------
// Routes
// ------------------

// 1. Login to get PLINK token
app.post('/auth', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Missing credentials' });
  }
  issuedToken = Math.random().toString(36).substring(2);
  console.log(`Authenticated user ${username}, issued token ${issuedToken}`);
  res.json({ token: issuedToken });
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
    if (!id || !car_number || !the_date || !rule_id) {
      return res.status(400).json({ status: 'error', message: 'Missing required form fields', data: { id, car_number, the_date, rule_id } });
    }

    const files = req.files as { [key: string]: Express.Multer.File[] };
    const video = files.video?.[0];
    const carPhoto = files.car_photo?.[0];
    const fullPhoto = files.full_photo?.[0];

    if (!video || !carPhoto || !fullPhoto) {
      return res.status(400).json({ status: 'error', message: 'Missing files' });
    }

    // Per-file size validation
    const checks: Array<{ file: Express.Multer.File; limit: number; name: string }> = [
      { file: video,   limit: MAX_SIZE.video,      name: 'video' },
      { file: carPhoto, limit: MAX_SIZE.car_photo,  name: 'car_photo' },
      { file: fullPhoto,limit: MAX_SIZE.full_photo, name: 'full_photo' }
    ];
    for (const { file, limit, name } of checks) {
      if (file.size > limit) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ status: 'error', message: `${name} exceeds size limit` });
      }
    }

    const url = `https://mock.example/${path.basename(video.path)}`;
    res.json({ status: 'success', url });
  }
);

// 3. KAAT event creation
app.post(
  '/billing-api/v1/device-event/create',
  kaatAuth,
  (req: Request, res: Response) => {
    const {
      pID,
      pDeviceNumber,
      pViolation,
      pActualSpeed,
      pLink,
      pPhoto,
      pPhotoPlate
      // ...other fields as needed
    } = req.body;

    if (!pID || !pDeviceNumber || pViolation == null || !pLink) {
      return res.status(400).json({ status: 'ERROR', message: 'Missing required fields' , data: {
      pID,
      pDeviceNumber,
      pViolation,
      pActualSpeed,
      pLink,
      pPhoto,
      pPhotoPlate
      // ...other fields as needed
    }});
    }

    const speed = Math.abs(Number(pActualSpeed));

    if (Number.isNaN(speed)) {
      console.log('Event rejected: invalid speed');
      return res.status(400).json({ status: 'REJECT', message: 'Invalid speed' });
    }

    let expectedViolation: number | null = null;

    if (speed <= 65) {
      console.log(`Event rejected: speed ${speed} below violation threshold`);
      return res.status(400).json({ status: 'REJECT', message: 'No violation detected' });
    } else if (speed <= 85) {
      expectedViolation = 36;
    } else if (speed <= 105) {
      expectedViolation = 37;
    } else if (speed <= 125) {
      expectedViolation = 201;
    } else {
      expectedViolation = 202;
    }

    if (expectedViolation !== Number(pViolation)) {
      console.log(
        `Event rejected: speed ${speed} requires violation ${expectedViolation}, received ${pViolation}`
      );
      return res.status(400).json({ status: 'REJECT', message: 'Violation code does not match speed' });
    }

    res.json({
      status: 'OK',
      message: 'Event saved successfully',
      event_id: pID
    });
  }
);

// 4. Car-search input-all (no auth)
app.post('/car-search/v1/device-event/input-all', kaatAuth, (req: Request, res: Response) => {
  const events = req.body;
  if (!Array.isArray(events)) {
    console.log('Input-all failed: body is not array');
    return res.status(400).json({ status: 'error', message: 'Expected array' });
  }
  console.log(`Inputting ${events.length} events`);
  res.json({ status: 'success', message: 'Data saved' });
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
