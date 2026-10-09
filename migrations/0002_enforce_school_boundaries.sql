-- Keep related records inside the same school tenant, even if a future API
-- accidentally attempts to connect IDs belonging to different schools.

CREATE TRIGGER IF NOT EXISTS trg_parent_student_school_insert
BEFORE INSERT ON parent_student_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
) OR NOT EXISTS (
  SELECT 1 FROM users
  WHERE id = NEW.parent_user_id AND school_id = NEW.school_id AND role = 'PARENT'
)
BEGIN
  SELECT RAISE(ABORT, 'Parent and student must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_parent_student_school_update
BEFORE UPDATE OF school_id, parent_user_id, student_id ON parent_student_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
) OR NOT EXISTS (
  SELECT 1 FROM users
  WHERE id = NEW.parent_user_id AND school_id = NEW.school_id AND role = 'PARENT'
)
BEGIN
  SELECT RAISE(ABORT, 'Parent and student must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_marks_school_insert
BEFORE INSERT ON marks
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
) OR NOT EXISTS (
  SELECT 1 FROM subjects
  WHERE id = NEW.subject_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Mark student and subject must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_marks_school_update
BEFORE UPDATE OF school_id, student_id, subject_id ON marks
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
) OR NOT EXISTS (
  SELECT 1 FROM subjects
  WHERE id = NEW.subject_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Mark student and subject must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_attendance_school_insert
BEFORE INSERT ON attendance
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Attendance student must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_attendance_school_update
BEFORE UPDATE OF school_id, student_id ON attendance
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Attendance student must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_fee_accounts_school_insert
BEFORE INSERT ON fee_accounts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Fee account student must belong to the same school');
END;

CREATE TRIGGER IF NOT EXISTS trg_fee_accounts_school_update
BEFORE UPDATE OF school_id, student_id ON fee_accounts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM students
  WHERE id = NEW.student_id AND school_id = NEW.school_id
)
BEGIN
  SELECT RAISE(ABORT, 'Fee account student must belong to the same school');
END;