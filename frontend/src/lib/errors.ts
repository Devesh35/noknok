// Error codes the API returns and the UI branches on. Never branch on message.
export const ERROR_CODES = [
  "NOT_LOGGED_IN",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID",
  "NOT_VISIBLE",
  "FULL",
  "PAST",
  "CANCELLED",
  "ALREADY_JOINED",
  "PAYMENT_REQUIRED",
  "PAYMENT_FAILED",
  "OTP_INVALID",
  "OTP_EXPIRED",
  "HANDLE_TAKEN",
  "RATE_LIMITED",
  "CONFLICT",
  "NOT_CONFIGURED",
  "NETWORK",
  "SERVER",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  NOT_LOGGED_IN: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  NOT_VISIBLE: 403,
  FULL: 409,
  PAST: 409,
  CANCELLED: 409,
  ALREADY_JOINED: 409,
  PAYMENT_REQUIRED: 402,
  PAYMENT_FAILED: 402,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  HANDLE_TAKEN: 409,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  NOT_CONFIGURED: 503,
  NETWORK: 0,
  SERVER: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };
