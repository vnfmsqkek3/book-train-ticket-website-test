/**
 * authService — 로그인/토큰 (make.md sequenceDiagram Step 1)
 * 데모용: 이메일만으로 사용자 생성/식별. 실제 환경에선 비밀번호 해시 검증 필요.
 */
import { createHash } from 'crypto';
import { signToken } from '../middleware/auth';
import { Errors } from '../errors';

export function login(email: string, password: string): { token: string; userId: string } {
  if (!email || !password) throw Errors.invalidCredentials();
  // 데모: 이메일 기반 결정적 userId 생성
  const userId = 'u_' + createHash('sha1').update(email).digest('hex').slice(0, 12);
  return { token: signToken(userId), userId };
}
