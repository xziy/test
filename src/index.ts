import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const app = express();
app.use(express.json({ limit: '10mb' }));

// basic request logger
app.use((req, _res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
  );
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB default limit
  }
});

// simple in-memory store
let issuedToken = 'test-token';

app.post('/auth', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('Authentication failed: missing credentials');
    return res.status(400).json({ message: 'Missing credentials' });
  }
  issuedToken = Math.random().toString(36).substring(2);
  console.log(`Authenticated user ${username}, issued token ${issuedToken}`);
  res.json({ token: issuedToken });
});

function authMiddleware(req: Request, res: Response, next: Function) {
  const auth = req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = auth.slice('Bearer '.length);
  if (token !== issuedToken) {
    return res.status(401).json({ message: 'Invalid token' });
  }
  console.log('Authorized request with token', token);
  next();
}

app.post('/video/upload', authMiddleware, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'car_photo', maxCount: 1 },
  { name: 'full_photo', maxCount: 1 }
]), (req: Request, res: Response) => {
  const files = req.files as { [field: string]: Express.Multer.File[] };
  const video = files?.video?.[0];
  const carPhoto = files?.car_photo?.[0];
  const fullPhoto = files?.full_photo?.[0];

  if (!video || !carPhoto || !fullPhoto) {
    console.log('Upload failed: missing files');
    return res.status(400).json({ status: 'error', message: 'Missing files' });
  }

  console.log('Uploading video', {
    id: req.body.id,
    video: video.originalname,
    carPhoto: carPhoto.originalname,
    fullPhoto: fullPhoto.originalname
  });

  const url = `https://mock.example/${path.basename(video.path)}`;
  res.json({ status: 'success', url });
});

app.post('/billing-api/v1/device-event/create', authMiddleware, (req: Request, res: Response) => {
  const data = req.body;
  if (!data.pID) {
    console.log('Create event failed: missing event id');
    return res.status(400).json({ status: 'ERROR', message: 'Missing event id' });
  }
  console.log('Creating device event', data);
  res.json({ status: 'OK', message: 'Event saved successfully', event_id: data.pID });
});

app.post('/car-search/v1/device-event/input-all', authMiddleware, (req: Request, res: Response) => {
  const events = req.body;
  if (!Array.isArray(events)) {
    console.log('Input-all failed: body is not array');
    return res.status(400).json({ status: 'error', message: 'Expected array' });
  }
  console.log(`Inputting ${events.length} events`);
  res.json({ status: 'success', message: 'Data saved' });
});

export function startServer(port: number = Number(process.env.PORT) || 3000) {
  return app.listen(port, () => {
    console.log(`Mock server running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}
