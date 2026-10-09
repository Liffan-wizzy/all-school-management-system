-- Liffan All-School Platform: initial multi-school schema.
-- Apply to a new/test D1 database first. Back up existing databases before migrations.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  school_type TEXT NOT NULL DEFAULT 'School',
  location TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Pending')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('PLATFORM_ADMIN', 'SCHOOL_ADMIN', 'SECRETARY', 'TEACHER', 'PARENT')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  admission_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  class_name TEXT,
  stream TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, admission_no),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS parent_student_links (
  school_id TEXT NOT NULL,
  parent_user_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  relationship TEXT DEFAULT 'Parent/Guardian',
  PRIMARY KEY (school_id, parent_user_id, student_id),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (parent_user_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (school_id, name),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  term TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  score REAL NOT NULL CHECK (score >= 0),
  max_score REAL NOT NULL DEFAULT 100 CHECK (max_score > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE (school_id, student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS fee_accounts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  amount_due INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE (school_id, student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school_id, role);
CREATE INDEX IF NOT EXISTS idx_students_school_class ON students(school_id, class_name, stream);
CREATE INDEX IF NOT EXISTS idx_marks_school_student ON marks(school_id, student_id, academic_year, term);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_fee_accounts_school_student ON fee_accounts(school_id, student_id);
