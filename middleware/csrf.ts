import cookieParser from 'cookie-parser';
import Tokens from 'csrf';
import type { CookieOptions, ErrorRequestHandler, Request, RequestHandler } from 'express';

const tokens = new Tokens();
const CSRF_COOKIE = '_csrf';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
};

declare module 'express-serve-static-core' {
  interface Request {
    csrfToken(): string;
  }
}

function readSecret(req: Request): string | undefined {
  return req.cookies?.[CSRF_COOKIE];
}

function writeSecret(req: Request, res: Parameters<RequestHandler>[1], secret: string) {
  res.cookie(CSRF_COOKIE, secret, cookieOptions);
  req.cookies ??= {};
  req.cookies[CSRF_COOKIE] = secret;
}

function readSubmittedToken(req: Request): string | undefined {
  const fromHeader =
    req.headers['csrf-token'] ??
    req.headers['xsrf-token'] ??
    req.headers['x-xsrf-token'] ??
    req.headers['x-csrf-token'];

  if (typeof fromHeader === 'string') return fromHeader;
  if (Array.isArray(fromHeader)) return fromHeader[0];

  const fromBody = req.body?._csrf;
  if (typeof fromBody === 'string') return fromBody;

  const fromQuery = req.query?._csrf;
  if (typeof fromQuery === 'string') return fromQuery;

  return undefined;
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export const parseCookies = cookieParser();

export const csrfProtection: RequestHandler = (req, res, next) => {
  let secret = readSecret(req);

  if (!secret) {
    secret = tokens.secretSync();
    writeSecret(req, res, secret);
  }

  req.csrfToken = () => tokens.create(secret);

  if (isSafeMethod(req.method)) {
    next();
    return;
  }

  const token = readSubmittedToken(req);
  if (!token || !tokens.verify(secret, token)) {
    const err = new Error('invalid csrf token') as Error & { code: string };
    err.code = 'EBADCSRFTOKEN';
    next(err);
    return;
  }

  next();
};

export const csrfTokenHandler: RequestHandler = (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
};

export const csrfErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next(err);
};
