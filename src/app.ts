import { NestFactory } from '@nestjs/core';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { AppModule } from './app.module';
import { LEGACY_API_ROUTES, LegacyApiRoute } from './legacy-api.module';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const server = app.getHttpAdapter().getInstance();

  server.disable('x-powered-by');
  server.use(express.json({ limit: '1mb' }));
  server.use((_req: Request, res: Response, next: NextFunction) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  const routes = app.get<LegacyApiRoute[]>(LEGACY_API_ROUTES, { strict: false });
  routes.forEach(({ path: routePath, handler }) => server.use(routePath, handler));
  server.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'Không tìm thấy API' }));
  server.use(express.static(path.join(__dirname, '..', 'public')));
  server.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
    }
    return res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
  });

  await app.init();
  return app;
}
