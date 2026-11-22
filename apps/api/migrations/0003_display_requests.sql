-- Permintaan pemasangan layar. Alurnya: tablet/TV di depan ruangan meminta kode,
-- menampilkannya sebagai QR dan teks, lalu admin PT memindai atau mengetiknya dari
-- HP yang sudah login dan memilih ruangannya. Token perangkat dibuat saat meminta
-- kode dan baru berlaku setelah admin menghubungkannya ke ruangan.
CREATE TABLE display_requests (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_display_requests_ip ON display_requests(ip);
CREATE INDEX idx_display_requests_exp ON display_requests(expires_at);
