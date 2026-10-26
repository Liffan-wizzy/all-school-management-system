PRAGMA foreign_keys = ON;

ALTER TABLE schools ADD COLUMN motto TEXT;
ALTER TABLE schools ADD COLUMN phone TEXT;
ALTER TABLE schools ADD COLUMN email TEXT;
ALTER TABLE schools ADD COLUMN website TEXT;
ALTER TABLE schools ADD COLUMN description TEXT;

CREATE TABLE IF NOT EXISTS school_photos (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (school_id)
    REFERENCES schools(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_school_photos_school
ON school_photos(school_id);