import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCsrfProtection } from './csrfProtection.js';

function app() {
  const instance = express();
  instance.use(createCsrfProtection(['https://app.example.com']));
  instance.all('/api/test', (_req, res) => res.json({ success: true }));
  return instance;
}

describe('CSRF origin protection', () => {
  it('allows safe requests and trusted mutation origins', async () => {
    await request(app()).get('/api/test').expect(200);
    await request(app())
      .post('/api/test')
      .set('Origin', 'https://app.example.com')
      .expect(200);
  });

  it('rejects an untrusted mutation origin', async () => {
    const response = await request(app())
      .post('/api/test')
      .set('Origin', 'https://attacker.example')
      .expect(403);

    expect(response.body.error).toBe('Request origin is not allowed');
  });

  it('rejects cross-site browser mutations without an Origin header', async () => {
    await request(app())
      .post('/api/test')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
  });

  it('allows non-browser clients without browser origin metadata', async () => {
    await request(app()).post('/api/test').expect(200);
  });
});
