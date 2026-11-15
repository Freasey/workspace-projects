-- Fondasi platform
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  max_users INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  temp_password_expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_org ON users(org_id, active);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'superadmin', 'impersonation')),
  user_id TEXT REFERENCES users(id),
  fingerprint TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE master_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_user_id TEXT,
  revoked_at INTEGER
);

CREATE TABLE org_modules (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  paused_at INTEGER,
  paused_note TEXT,
  PRIMARY KEY (org_id, module_key)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('superadmin', 'user', 'superadmin_as_user')),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at);

-- Modul Booking Ruangan
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  location TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  facilities TEXT NOT NULL DEFAULT '[]',
  buffer_min INTEGER NOT NULL DEFAULT 0,
  max_duration_min INTEGER,
  max_days_ahead INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rooms_org ON rooms(org_id);

-- Tidak ada baris untuk suatu hari berarti ruangan tutup hari itu.
CREATE TABLE room_hours (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_min INTEGER NOT NULL,
  close_min INTEGER NOT NULL,
  break_start INTEGER,
  break_end INTEGER,
  PRIMARY KEY (room_id, weekday)
);

-- room_id NULL berarti berlaku untuk semua ruangan di PT itu.
CREATE TABLE room_closures (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  room_id TEXT REFERENCES rooms(id),
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_closures_org ON room_closures(org_id, date);

CREATE TABLE room_settings (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id),
  max_duration_min INTEGER NOT NULL,
  max_days_ahead INTEGER NOT NULL,
  min_notice_min INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled', 'rejected')),
  created_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  CHECK (end_at > start_at)
);
CREATE INDEX idx_bookings_room_time ON bookings(room_id, start_at);
CREATE INDEX idx_bookings_user ON bookings(user_id, start_at);

-- Anti-bentrok: dua booking yang masih memegang slot tidak boleh tumpang-tindih
-- di ruangan yang sama. Dijaga database supaya aman dari request bersamaan.
CREATE TRIGGER bookings_no_overlap_insert
BEFORE INSERT ON bookings
WHEN NEW.status IN ('confirmed', 'pending')
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
  WHERE EXISTS (
    SELECT 1 FROM bookings
    WHERE room_id = NEW.room_id
      AND status IN ('confirmed', 'pending')
      AND start_at < NEW.end_at
      AND end_at > NEW.start_at
  );
END;

CREATE TRIGGER bookings_no_overlap_update
BEFORE UPDATE OF start_at, end_at, status, room_id ON bookings
WHEN NEW.status IN ('confirmed', 'pending')
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
  WHERE EXISTS (
    SELECT 1 FROM bookings
    WHERE room_id = NEW.room_id
      AND id <> NEW.id
      AND status IN ('confirmed', 'pending')
      AND start_at < NEW.end_at
      AND end_at > NEW.start_at
  );
END;
