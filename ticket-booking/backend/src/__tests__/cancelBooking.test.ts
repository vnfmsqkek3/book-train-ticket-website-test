/**
 * 예약 취소 플로우 테스트 (in-memory 폴백 사용).
 * 좌석 잠금 → 확정(SOLD) → 취소(AVAILABLE 복귀, 예매 삭제) 검증.
 */
import * as seatLockService from '../services/seatLockService';
import { getStore } from '../db/store';
import { generateSeats } from '../data/seed';
import { SeatState } from '../../../shared/types';

const TRAIN = 'TEST-CANCEL';
const USER = 'user-cancel-1';
const SEAT = '3A';

beforeAll(async () => {
  await getStore().seedSeats(generateSeats(TRAIN));
});

describe('예약 취소', () => {
  it('확정된 좌석을 취소하면 AVAILABLE로 돌아가고 예매가 삭제된다', async () => {
    // 잠금 → 확정
    await seatLockService.lockSeat(USER, TRAIN, SEAT);
    const { booking } = await seatLockService.confirmBooking(USER, TRAIN, SEAT);
    let seat = await getStore().getSeat(TRAIN, SEAT);
    expect(seat?.state).toBe(SeatState.SOLD);

    // 취소
    const { change, trainId } = await seatLockService.cancelBooking(USER, booking.id);
    expect(trainId).toBe(TRAIN);
    expect(change.state).toBe(SeatState.AVAILABLE);
    expect(change.ownerId).toBeNull();

    // 좌석이 다시 가용(빈자리) + 예매 삭제 확인
    seat = await getStore().getSeat(TRAIN, SEAT);
    expect(seat?.state).toBe(SeatState.AVAILABLE);
    expect(await getStore().getBooking(booking.id)).toBeNull();
  });

  it('타인의 예매는 취소할 수 없다', async () => {
    await seatLockService.lockSeat(USER, TRAIN, '4B');
    const { booking } = await seatLockService.confirmBooking(USER, TRAIN, '4B');
    await expect(seatLockService.cancelBooking('other-user', booking.id)).rejects.toThrow();
  });

  it('취소 후 그 좌석을 다른 사용자가 다시 예매할 수 있다', async () => {
    await seatLockService.lockSeat(USER, TRAIN, '5C');
    const { booking } = await seatLockService.confirmBooking(USER, TRAIN, '5C');
    await seatLockService.cancelBooking(USER, booking.id);

    // 다른 사용자가 동일 좌석 재예매
    await seatLockService.lockSeat('user-2', TRAIN, '5C');
    const second = await seatLockService.confirmBooking('user-2', TRAIN, '5C');
    expect(second.booking.userId).toBe('user-2');
    const seat = await getStore().getSeat(TRAIN, '5C');
    expect(seat?.state).toBe(SeatState.SOLD);
    expect(seat?.ownerId).toBe('user-2');
  });
});
