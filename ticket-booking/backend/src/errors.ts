/**
 * 표준 에러 클래스 및 코드 (baseline #3: 에러 응답 표준화)
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: (msg = '인증이 필요합니다.') => new AppError('UNAUTHORIZED', 401, msg),
  invalidCredentials: () =>
    new AppError('INVALID_CREDENTIALS', 401, '이메일 또는 비밀번호가 올바르지 않습니다.'),
  notFound: (msg = '리소스를 찾을 수 없습니다.') => new AppError('NOT_FOUND', 404, msg),
  badRequest: (msg = '잘못된 요청입니다.') => new AppError('BAD_REQUEST', 400, msg),
  seatLocked: () =>
    new AppError('SEAT_LOCKED', 409, '다른 사용자가 선택 중인 좌석입니다.'),
  seatSold: () => new AppError('SEAT_SOLD', 409, '이미 판매된 좌석입니다.'),
  seatVersionConflict: () =>
    new AppError('SEAT_VERSION_CONFLICT', 409, '좌석 상태가 변경되었습니다. 다시 시도해 주세요.'),
  queueNotReady: () =>
    new AppError('QUEUE_NOT_READY', 403, '아직 예매 가능 순번이 아닙니다.'),
  invalidTransition: (msg: string) =>
    new AppError('INVALID_TRANSITION', 409, msg),
  internal: (msg = '서버 오류가 발생했습니다.') => new AppError('INTERNAL', 500, msg),
};
