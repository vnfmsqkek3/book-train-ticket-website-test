/**
 * WebSocket 서버 (make.md §2 실시간 통신, baseline #7)
 *
 * - ws 라이브러리 기반 양방향 통신
 * - 토큰 검증 후 연결 수립 (sequenceDiagram Step 1)
 * - 좌석/대기열 변경을 연결된 클라이언트에 브로드캐스트 (낮은 지연시간)
 * - diff 기반 좌석 상태 전송 (변경된 좌석만) — make.md §2 변화 감지
 */
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../middleware/auth';
import {
  ClientEvent,
  ClientEventType,
  ServerEvent,
  ServerEventType,
  QueueState,
} from '../../../shared/types';
import * as queueService from '../services/queueService';
import * as seatLockService from '../services/seatLockService';
import * as sessionService from '../services/sessionService';

interface Client {
  ws: WebSocket;
  userId: string;
  trainId: string | null;
}

const clients = new Map<WebSocket, Client>();

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

/** 특정 열차를 보고 있는 모든 클라이언트에 브로드캐스트 */
export function broadcastToTrain(trainId: string, event: ServerEvent): void {
  for (const c of clients.values()) {
    if (c.trainId === trainId) send(c.ws, event);
  }
}

/** 특정 사용자에게 전송 */
export function sendToUser(userId: string, event: ServerEvent): void {
  for (const c of clients.values()) {
    if (c.userId === userId) send(c.ws, event);
  }
}

/** 좌석 변경 브로드캐스트 (diff) */
export function broadcastSeatChanges(
  trainId: string,
  changes: seatLockService.SeatChange[],
): void {
  if (changes.length === 0) return;
  broadcastToTrain(trainId, {
    type: ServerEventType.SEAT_STATUS,
    trainId,
    changes,
  });
}

export function createWebSocketServer(server: import('http').Server): WebSocketServer {
  // HTTP 서버와 동일 포트를 공유하고 /api/ws 경로에서만 업그레이드 처리.
  // (ALB→ECS 단일 포트 4000, CloudFront가 /api/ws 를 ALB로 프록시)
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // 토큰 검증 (sequenceDiagram Step 1)
    const url = new URL(req.url ?? '', 'ws://localhost');
    const token = url.searchParams.get('token');
    let userId: string;
    try {
      if (!token) throw new Error('no token');
      userId = verifyToken(token);
    } catch {
      send(ws, {
        type: ServerEventType.ERROR,
        code: 'UNAUTHORIZED',
        message: '토큰이 유효하지 않습니다.',
      });
      ws.close();
      return;
    }

    clients.set(ws, { ws, userId, trainId: null });
    void sessionService.createSession(userId);

    ws.on('message', (data) => {
      void handleClientMessage(ws, data.toString());
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // eslint-disable-next-line no-console
  console.log(`[ws] WebSocket 서버 실행 중 (경로 /api/ws, HTTP 서버 공유)`);
  return wss;
}

async function handleClientMessage(ws: WebSocket, raw: string): Promise<void> {
  const client = clients.get(ws);
  if (!client) return;

  let event: ClientEvent;
  try {
    event = JSON.parse(raw) as ClientEvent;
  } catch {
    send(ws, { type: ServerEventType.ERROR, code: 'BAD_REQUEST', message: '잘못된 메시지 형식' });
    return;
  }

  try {
    switch (event.type) {
      case ClientEventType.JOIN_QUEUE: {
        client.trainId = event.trainId;
        const entry = await queueService.joinQueue(client.userId, event.trainId);
        await sessionService.updateSession(client.userId, {
          trainId: event.trainId,
          queueState: entry.state,
        });
        const info = await queueService
          .getStatus(client.userId, event.trainId)
          .then((e) => queueServiceComputeWait(e.userId, e.trainId));
        send(ws, {
          type: ServerEventType.QUEUE_UPDATE,
          queueNumber: entry.queueNumber,
          peopleAhead: info.peopleAhead,
          estimatedWaitTime: info.estimatedWaitTime,
          state: entry.state,
        });
        break;
      }
      case ClientEventType.SELECT_SEAT: {
        await queueService.assertCanSelectSeat(client.userId, event.trainId);
        await queueService.markProcessing(client.userId, event.trainId);
        const { change } = await seatLockService.lockSeat(
          client.userId,
          event.trainId,
          event.seatId,
        );
        await sessionService.updateSession(client.userId, {
          selectedSeatId: event.seatId,
          queueState: QueueState.PROCESSING,
        });
        broadcastSeatChanges(event.trainId, [change]);
        break;
      }
      case ClientEventType.CONFIRM_BOOKING: {
        const { booking, change } = await seatLockService.confirmBooking(
          client.userId,
          event.trainId,
          event.seatId,
        );
        await queueService.markCompleted(client.userId, event.trainId);
        await sessionService.updateSession(client.userId, {
          bookingId: booking.id,
          queueState: QueueState.COMPLETED,
        });
        broadcastSeatChanges(event.trainId, [change]);
        send(ws, {
          type: ServerEventType.BOOKING_RESULT,
          success: true,
          bookingNumber: booking.bookingNumber,
          seatId: event.seatId,
        });
        break;
      }
      case ClientEventType.HEARTBEAT:
        break;
    }
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'INTERNAL';
    const message = (err as Error).message ?? '서버 오류';
    send(ws, { type: ServerEventType.ERROR, code, message });
  }
}

// queueService.computeWaitInfo는 StoredEntry를 받으므로 래핑
async function queueServiceComputeWait(userId: string, trainId: string) {
  const entry = await queueService.getStatus(userId, trainId);
  // computeWaitInfo는 내부 StoredEntry 형태를 기대 → getStatus 결과를 재사용
  return queueService.computeWaitInfo({
    userId: entry.userId,
    trainId: entry.trainId,
    queueNumber: entry.queueNumber,
    state: entry.state,
    joinedAt: entry.joinedAt,
    lastActivityAt: entry.lastActivityAt,
  });
}

export function connectedCount(): number {
  return clients.size;
}
