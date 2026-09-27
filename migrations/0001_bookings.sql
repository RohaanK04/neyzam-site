CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  topic TEXT NOT NULL,
  process TEXT,
  preferred_date TEXT,
  preferred_window TEXT,
  timezone TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at);
