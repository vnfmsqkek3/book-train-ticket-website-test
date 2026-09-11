'use client';
/**
 * WebSocket 실시간 통신 훅 (baseline #7)
 * - 좌석 상태(diff)/대기열 업데이트/예매 결과 수신
 * - 네트워크 끊김 시 exponential backoff 재연결 (make.md 에러 복구 시퀀스)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerEvent, ClientEvent } from '../../shared/types';
import { ServerEventType } from '../../shared/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4001';

export interface WsState {
  connected: boolean;
  lastEvent: ServerEvent | null;
  send: (event: ClientEvent) => void;
}

export function useWebSocket(token: string | null): WsState {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0; // backoff 리셋
    };
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent;
        setLastEvent(event);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      setConnected(false);
      // exponential backoff 재연결
      const delay = Math.min(1000 * 2 ** retryRef.current, 16000);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((event: ClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { connected, lastEvent, send };
}

export { ServerEventType };
