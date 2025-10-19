// Minimal Express Request augmentation used by the application to attach
// per-request services and authenticated user info. This keeps the
// runtime JS unchanged while satisfying TypeScript checkJs/tsc.

import * as express from 'express';

declare global {
  namespace Express {
    interface User {
      userId?: string | number;
      [key: string]: any;
    }

    interface Request {
      services: {
        [key: string]: any;
      };
      user: User;
    }
  }
}

export {};
