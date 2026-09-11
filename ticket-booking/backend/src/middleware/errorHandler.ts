/**
 * 에러 표준화 미들웨어 (baseline #3)
 * 모든 에러 응답을 shared/types의 ApiError 형태로 통일한다.
 */
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppError } from '../errors';
import type { ApiError } from '../../../shared/types';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const traceId = randomUUID();

  if (err instanceof AppError) {
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        traceId,
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  // 예상치 못한 에러
  // eslint-disable-next-line no-console
  console.error(`[${traceId}] Unhandled error:`, err);
  const body: ApiError = {
    error: {
      code: 'INTERNAL',
      message: '서버 오류가 발생했습니다.',
      traceId,
    },
  };
  res.status(500).json(body);
}

/** async 핸들러 래퍼: throw된 에러를 errorHandler로 전달 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
