-- ─────────────────────────────────────────────────────────────
-- 스키마/마이그레이션 (make.md §4 데이터 설계)
-- AWS RDS(MySQL) 대상. store.ts의 in-memory 폴백과 동일한 구조.
-- ─────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS ticket_booking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ticket_booking;

-- 좌석 (make.md §4 좌석 데이터)
--   Optimistic Lock: version 컬럼으로 낙관적 잠금 구현
--   좌석 접근 제어: lock_expires_at (TTL 기반 임시 예약)
CREATE TABLE IF NOT EXISTS seats (
  train_id        VARCHAR(32)  NOT NULL,
  seat_id         VARCHAR(16)  NOT NULL,
  state           ENUM('AVAILABLE','LOCKED','SOLD') NOT NULL DEFAULT 'AVAILABLE',
  owner_id        VARCHAR(64)  NULL,
  version         INT          NOT NULL DEFAULT 0,   -- Optimistic Lock
  lock_expires_at DATETIME     NULL,
  pos_row         INT          NOT NULL,
  pos_col         VARCHAR(2)   NOT NULL,
  pos_type        ENUM('WINDOW','AISLE','MIDDLE') NOT NULL,
  PRIMARY KEY (train_id, seat_id),         -- 좌석 식별 정보 (복합 기본키)
  INDEX idx_seats_state (train_id, state)
) ENGINE=InnoDB;

-- 예매 기록 (make.md sequenceDiagram Step 5)
CREATE TABLE IF NOT EXISTS bookings (
  id             VARCHAR(64)  NOT NULL,
  booking_number VARCHAR(32)  NOT NULL,
  user_id        VARCHAR(64)  NOT NULL,
  train_id       VARCHAR(32)  NOT NULL,
  seat_id        VARCHAR(16)  NOT NULL,
  created_at     DATETIME     NOT NULL,
  ticket_url     VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_number (booking_number),
  UNIQUE KEY uq_seat_once (train_id, seat_id),   -- 중복 예매 방지 (baseline #6)
  INDEX idx_bookings_user (user_id)
) ENGINE=InnoDB;

-- 대기열 영속 기록 (make.md §4 MySQL 대기열 기록)
CREATE TABLE IF NOT EXISTS queue_history (
  id           VARCHAR(64) NOT NULL,
  user_id      VARCHAR(64) NOT NULL,
  train_id     VARCHAR(32) NOT NULL,
  queue_number INT         NOT NULL,
  joined_at    DATETIME    NOT NULL,
  exited_at    DATETIME    NULL,
  status       ENUM('WAITING','READY','PROCESSING','COMPLETED','TIMEOUT','CANCELLED') NOT NULL,
  reason       VARCHAR(64) NULL,
  PRIMARY KEY (id),
  INDEX idx_queue_user (user_id, train_id),
  INDEX idx_queue_status (train_id, status)
) ENGINE=InnoDB;
