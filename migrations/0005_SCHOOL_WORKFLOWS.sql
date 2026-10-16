-- Operational school modules for Liffan All-School Management System.
-- Requires existing schools(id), students(id, school_id), auth_users,
-- school_access, auth_parent_students and auth_teacher_assignments support.

CREATE TABLE IF NOT EXISTS auth_subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, name, class_name)
);
CREATE INDEX IF NOT EXISTS idx_auth_subjects_school ON auth_subjects(school_id, class_name);

CREATE TABLE IF NOT EXISTS auth_teacher_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  teacher_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES auth_subjects(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  can_mark INTEGER NOT NULL DEFAULT 1 CHECK (can_mark IN (0,1)),
  can_attend INTEGER NOT NULL DEFAULT 1 CHECK (can_attend IN (0,1)),
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_user_id, subject_id, class_name)
);
CREATE INDEX IF NOT EXISTS idx_auth_assignments_teacher ON auth_teacher_assignments(teacher_user_id, school_id);

CREATE TRIGGER IF NOT EXISTS trg_auth_teacher_assignments_guard
BEFORE INSERT ON auth_teacher_assignments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u JOIN auth_subjects s ON s.id = NEW.subject_id
    WHERE u.id = NEW.teacher_user_id AND u.role = 'TEACHER' AND u.active = 1
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Teacher assignment must match active teacher, subject and school') END;
END;

CREATE TABLE IF NOT EXISTS auth_marks (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES auth_subjects(id),
  assessment_name TEXT NOT NULL,
  term TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL CHECK (score >= 0),
  max_score REAL NOT NULL CHECK (max_score > 0 AND score <= max_score),
  remarks TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_marks_school_student ON auth_marks(school_id, student_id, term);

CREATE TRIGGER IF NOT EXISTS trg_auth_marks_guard_insert
BEFORE INSERT ON auth_marks
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM students s WHERE CAST(s.id AS TEXT) = CAST(NEW.student_id AS TEXT)
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Mark student must belong to the same school') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_subjects s WHERE s.id = NEW.subject_id
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Mark subject must belong to the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_marks_guard_update
BEFORE UPDATE OF school_id, student_id, subject_id ON auth_marks
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM students s WHERE CAST(s.id AS TEXT) = CAST(NEW.student_id AS TEXT)
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Mark student must belong to the same school') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_subjects s WHERE s.id = NEW.subject_id
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Mark subject must belong to the same school') END;
END;

CREATE TABLE IF NOT EXISTS auth_attendance (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_auth_attendance_scope ON auth_attendance(school_id, attendance_date, student_id);

CREATE TRIGGER IF NOT EXISTS trg_auth_attendance_guard_insert
BEFORE INSERT ON auth_attendance
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM students s WHERE CAST(s.id AS TEXT) = CAST(NEW.student_id AS TEXT)
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Attendance student must belong to the same school') END;
END;

CREATE TABLE IF NOT EXISTS auth_fee_transactions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('CHARGE','PAYMENT','ADJUSTMENT')),
  amount REAL NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  transaction_date TEXT NOT NULL DEFAULT (date('now')),
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_fees_student ON auth_fee_transactions(school_id, student_id, transaction_date);

CREATE TRIGGER IF NOT EXISTS trg_auth_fees_guard_insert
BEFORE INSERT ON auth_fee_transactions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM students s WHERE CAST(s.id AS TEXT) = CAST(NEW.student_id AS TEXT)
      AND CAST(s.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Fee student must belong to the same school') END;
END;

CREATE TABLE IF NOT EXISTS auth_announcements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL' CHECK (audience IN ('ALL','PARENTS','TEACHERS','STAFF')),
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_announcements_school ON auth_announcements(school_id, created_at);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  actor_user_id TEXT REFERENCES auth_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_school_time ON auth_audit_events(school_id, created_at);

CREATE TABLE IF NOT EXISTS auth_invitations (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('SECRETARY','TEACHER','PARENT')),
  student_ref TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES auth_users(id),
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_invitations_school ON auth_invitations(school_id, created_at);


CREATE TRIGGER IF NOT EXISTS trg_auth_subjects_actor_guard
BEFORE INSERT ON auth_subjects
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role IN ('SCHOOL_ADMIN','SECRETARY')
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Subject creator must be an active school admin or secretary in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_marks_actor_guard
BEFORE INSERT ON auth_marks
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role IN ('SCHOOL_ADMIN','TEACHER')
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Mark creator must be an active authorized user in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_attendance_actor_guard
BEFORE INSERT ON auth_attendance
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role IN ('SCHOOL_ADMIN','SECRETARY','TEACHER')
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Attendance creator must be an active authorized user in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_fees_actor_guard
BEFORE INSERT ON auth_fee_transactions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role IN ('SCHOOL_ADMIN','SECRETARY')
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Fee creator must be an active school admin or secretary in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_announcements_actor_guard
BEFORE INSERT ON auth_announcements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role IN ('SCHOOL_ADMIN','SECRETARY')
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Announcement creator must be an active school admin or secretary in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_invitations_actor_guard
BEFORE INSERT ON auth_invitations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.created_by AND u.active = 1
      AND u.role = 'SCHOOL_ADMIN'
      AND CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT)
  ) THEN RAISE(ABORT, 'Invitation creator must be an active admin in the same school') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_audit_events_actor_guard
BEFORE INSERT ON auth_audit_events
WHEN NEW.school_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM auth_users u WHERE u.id = NEW.actor_user_id AND u.active = 1
      AND (u.role = 'PLATFORM_ADMIN' OR CAST(u.school_id AS TEXT) = CAST(NEW.school_id AS TEXT))
  ) THEN RAISE(ABORT, 'Audit event actor must belong to the school or be a platform admin') END;
END;
