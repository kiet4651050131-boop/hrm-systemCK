import { Module } from '@nestjs/common';
import type { RequestHandler } from 'express';

export const LEGACY_API_ROUTES = Symbol('LEGACY_API_ROUTES');

export interface LegacyApiRoute {
  path: string;
  handler: RequestHandler;
}

const org = require('../routes/org');

const routes: LegacyApiRoute[] = [
  { path: '/api/auth', handler: require('../routes/auth') },
  { path: '/api/departments', handler: org.departments },
  { path: '/api/positions', handler: org.positions },
  { path: '/api/employees', handler: require('../routes/employees') },
  { path: '/api/attendance', handler: require('../routes/attendance') },
  { path: '/api/leave', handler: require('../routes/leave') },
  { path: '/api/overtime', handler: require('../routes/overtime') },
  { path: '/api/payroll', handler: require('../routes/payroll') },
  { path: '/api/reports', handler: require('../routes/reports') },
  { path: '/api/history', handler: require('../routes/history') },
  { path: '/api/notifications', handler: require('../routes/notifications') },
  { path: '/api/dashboard', handler: require('../routes/dashboard') },
  { path: '/api', handler: require('../routes/config') },
  { path: '/api', handler: require('../routes/admin') },
];

@Module({
  providers: [{ provide: LEGACY_API_ROUTES, useValue: routes }],
  exports: [LEGACY_API_ROUTES],
})
export class LegacyApiModule {}
