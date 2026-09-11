/**
 * MySQL 저장소 추상화.
 *
 * 실제 환경(AWS RDS)에서는 mysql2 풀을 사용하고,
 * DB_HOST 미설정 시 in-memory 저장소로 폴백한다.
 * → 좌석/예매/대기열 기록을 외부 DB 없이 데모 가능.
 *
 * 좌석 확정 시 Optimistic Lock(version) 검증은 store 계층에서 원자적으로 처리한다.
 */
import mysql from 'mysql2/promise';
import { config } from '../config';
import { Seat, Booking } from '../../../shared/types';
import { SeatState } from '../../../shared/types';

export interface QueueHistoryRow {
  id: string;
  userId: string;
  trainId: string;
  queueNumber: number;
  joinedAt: string;
  exitedAt: string | null;
  status: string;
  reason: string | null;
}

export interface Store {
  getSeats(trainId: string): Promise<Seat[]>;
  getSeat(trainId: string, seatId: string): Promise<Seat | null>;
  /** Optimistic Lock: expectedVersion과 일치할 때만 갱신. 성공 시 true. */
  updateSeatWithVersion(
    trainId: string,
    seatId: string,
    expectedVersion: number,
    patch: Partial<Pick<Seat, 'state' | 'ownerId' | 'lockExpiresAt'>>,
  ): Promise<boolean>;
  insertBooking(b: Booking): Promise<void>;
  getBooking(bookingId: string): Promise<Booking | null>;
  insertQueueHistory(row: QueueHistoryRow): Promise<void>;
  seedSeats(seats: Seat[]): Promise<void>;
}

// ── in-memory 구현 ──
class InMemoryStore implements Store {
  private seats = new Map<string, Seat>(); // key: trainId:seatId
  private bookings = new Map<string, Booking>();
  private queueHistory: QueueHistoryRow[] = [];

  private key(trainId: string, seatId: string) {
    return `${trainId}:${seatId}`;
  }

  async seedSeats(seats: Seat[]): Promise<void> {
    for (const s of seats) this.seats.set(this.key(s.trainId, s.seatId), { ...s });
  }

  async getSeats(trainId: string): Promise<Seat[]> {
    return [...this.seats.values()]
      .filter((s) => s.trainId === trainId)
      .map((s) => ({ ...s }));
  }

  async getSeat(trainId: string, seatId: string): Promise<Seat | null> {
    const s = this.seats.get(this.key(trainId, seatId));
    return s ? { ...s } : null;
  }

  async updateSeatWithVersion(
    trainId: string,
    seatId: string,
    expectedVersion: number,
    patch: Partial<Pick<Seat, 'state' | 'ownerId' | 'lockExpiresAt'>>,
  ): Promise<boolean> {
    const k = this.key(trainId, seatId);
    const s = this.seats.get(k);
    if (!s) return false;
    // 원자적 CAS: 버전 불일치 시 실패
    if (s.version !== expectedVersion) return false;
    this.seats.set(k, {
      ...s,
      ...patch,
      version: s.version + 1,
    });
    return true;
  }

  async insertBooking(b: Booking): Promise<void> {
    this.bookings.set(b.id, { ...b });
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    return this.bookings.get(bookingId) ?? null;
  }

  async insertQueueHistory(row: QueueHistoryRow): Promise<void> {
    this.queueHistory.push({ ...row });
  }
}

// ── mysql2 어댑터 ──
class MySqlStore implements Store {
  constructor(private pool: mysql.Pool) {}

  async seedSeats(seats: Seat[]): Promise<void> {
    if (seats.length === 0) return;
    const values = seats.map((s) => [
      s.seatId,
      s.trainId,
      s.state,
      s.ownerId,
      s.version,
      s.lockExpiresAt,
      s.position.row,
      s.position.col,
      s.position.type,
    ]);
    await this.pool.query(
      `INSERT IGNORE INTO seats
       (seat_id, train_id, state, owner_id, version, lock_expires_at, pos_row, pos_col, pos_type)
       VALUES ?`,
      [values],
    );
  }

  async getSeats(trainId: string): Promise<Seat[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM seats WHERE train_id = ?',
      [trainId],
    );
    return rows.map(this.rowToSeat);
  }

  async getSeat(trainId: string, seatId: string): Promise<Seat | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM seats WHERE train_id = ? AND seat_id = ?',
      [trainId, seatId],
    );
    return rows[0] ? this.rowToSeat(rows[0]) : null;
  }

  async updateSeatWithVersion(
    trainId: string,
    seatId: string,
    expectedVersion: number,
    patch: Partial<Pick<Seat, 'state' | 'ownerId' | 'lockExpiresAt'>>,
  ): Promise<boolean> {
    // Optimistic Lock: WHERE version = ? 조건으로 원자적 갱신
    const sets: string[] = ['version = version + 1'];
    const params: unknown[] = [];
    if (patch.state !== undefined) {
      sets.push('state = ?');
      params.push(patch.state);
    }
    if (patch.ownerId !== undefined) {
      sets.push('owner_id = ?');
      params.push(patch.ownerId);
    }
    if (patch.lockExpiresAt !== undefined) {
      sets.push('lock_expires_at = ?');
      params.push(patch.lockExpiresAt);
    }
    params.push(trainId, seatId, expectedVersion);
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      `UPDATE seats SET ${sets.join(', ')}
       WHERE train_id = ? AND seat_id = ? AND version = ?`,
      params,
    );
    return result.affectedRows === 1;
  }

  async insertBooking(b: Booking): Promise<void> {
    await this.pool.query(
      `INSERT INTO bookings (id, booking_number, user_id, train_id, seat_id, created_at, ticket_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.id, b.bookingNumber, b.userId, b.trainId, b.seatId, b.createdAt, b.ticketDownloadUrl],
    );
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      bookingNumber: r.booking_number,
      userId: r.user_id,
      trainId: r.train_id,
      seatId: r.seat_id,
      createdAt: r.created_at,
      ticketDownloadUrl: r.ticket_url,
    };
  }

  async insertQueueHistory(row: QueueHistoryRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO queue_history (id, user_id, train_id, queue_number, joined_at, exited_at, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.userId, row.trainId, row.queueNumber, row.joinedAt, row.exitedAt, row.status, row.reason],
    );
  }

  private rowToSeat = (r: mysql.RowDataPacket): Seat => ({
    seatId: r.seat_id,
    trainId: r.train_id,
    state: r.state as SeatState,
    ownerId: r.owner_id,
    version: r.version,
    lockExpiresAt: r.lock_expires_at,
    position: { row: r.pos_row, col: r.pos_col, type: r.pos_type },
  });
}

let store: Store | null = null;
let usingFallback = false;

export function getStore(): Store {
  if (store) return store;
  if (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') {
    const pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      connectionLimit: 20,
      waitForConnections: true,
    });
    store = new MySqlStore(pool);
    return store;
  }
  usingFallback = true;
  // eslint-disable-next-line no-console
  console.warn('[db] in-memory 저장소 폴백 사용 (로컬/데모 모드)');
  store = new InMemoryStore();
  return store;
}

export function isDbFallback(): boolean {
  return usingFallback;
}
