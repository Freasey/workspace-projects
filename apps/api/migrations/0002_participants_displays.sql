-- Peserta booking: user di PT yang sama. Pemesan tidak perlu dicatat di sini.
CREATE TABLE booking_participants (
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (booking_id, user_id)
);
CREATE INDEX idx_participants_user ON booking_participants(user_id);

-- Layar ruangan: perangkat yang dipasang di depan satu ruangan dan menampilkan
-- jadwal, hitung mundur, dan peserta. Dipasang dengan kode sekali pakai; setelah
-- itu perangkat memegang token sendiri, bukan sesi milik seseorang.
CREATE TABLE room_displays (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  name TEXT NOT NULL,
  pair_code_hash TEXT,
  pair_expires_at INTEGER,
  token_hash TEXT UNIQUE,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  paired_at INTEGER,
  last_seen_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX idx_displays_room ON room_displays(room_id);
CREATE INDEX idx_displays_code ON room_displays(pair_code_hash);
