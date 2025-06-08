import request from 'supertest';
import type { Express } from 'express';

const KAAT_TOKEN = 'test-kaat-token';
let app: Express;

let token: string;

beforeAll(() => {
  process.env.KAAT_TOKEN = KAAT_TOKEN;
  app = require('../src/index').app;
});

describe('Mock KAAT server', () => {
  it('authenticates and returns a token', async () => {
    const res = await request(app)
      .post('/auth')
      .send({ username: 'user', password: 'pass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it('uploads video and photos', async () => {
    const res = await request(app)
      .post('/video/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('id', 'T-1')
      .field('car_number', '01D219YA')
      .field('the_date', '2023-01-01 12:00:00')
      .field('rule_id', '90')
      .attach('video', 'tests/fixtures/video.mp4')
      .attach('car_photo', 'tests/fixtures/car.jpg')
      .attach('full_photo', 'tests/fixtures/full.jpg');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.url).toContain('https://');
  });

  it('creates a violation event', async () => {
    const res = await request(app)
      .post('/billing-api/v1/device-event/create')
      .set('Authorization', `Bearer ${KAAT_TOKEN}`)
      .send({
        pID: '2000',
        pDeviceNumber: 'D-1',
        pViolation: 202,
        pActualSpeed: 130,
        pLink: 'https://mock.example/video.mp4'
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.event_id).toBe('2000');
  });

  it('rejects mismatched violation code', async () => {
    const res = await request(app)
      .post('/billing-api/v1/device-event/create')
      .set('Authorization', `Bearer ${KAAT_TOKEN}`)
      .send({
        pID: '3000',
        pDeviceNumber: 'D-1',
        pViolation: 36,
        pActualSpeed: 90,
        pLink: 'https://mock.example/video.mp4'
      });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('REJECT');
  });

  it('rejects when speed below threshold', async () => {
    const res = await request(app)
      .post('/billing-api/v1/device-event/create')
      .set('Authorization', `Bearer ${KAAT_TOKEN}`)
      .send({
        pID: '4000',
        pDeviceNumber: 'D-1',
        pViolation: 36,
        pActualSpeed: 60,
        pLink: 'https://mock.example/video.mp4'
      });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('REJECT');
  });

  it('inputs all cars', async () => {
    const res = await request(app)
      .post('/car-search/v1/device-event/input-all')
      .set('Authorization', `Bearer ${KAAT_TOKEN}`)
      .send([{ device_reg_number: '123' }]);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });
});
