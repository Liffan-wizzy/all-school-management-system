import { useMemo, useState } from "react";
import "./platform.css";
import "./platform-mobile.css";

const schools = [
  { id: "demo-mulala", name: "Mulala Girls School", type: "Secondary", location: "Makueni County", status: "Demo" },
  { id: "demo-st-elizabeth", name: "St Elizabeth School", type: "Junior & Senior", location: "Kenya", status: "Demo" },
  { id: "demo-greenfield", name: "Greenfield Academy", type: "Primary", location: "Nairobi County", status: "Demo" }
];

const students = [
  { id: "s-1", schoolId: "demo-mulala", admissionNo: "MGS-0241", name: "Amina M.", className: "Form 3", stream: "East", attendance: "Present", subject: "Biology", score: 84, feesDue: 48000, feesPaid: 36000 },
  { id: "s-2", schoolId: "demo-mulala", admissionNo: "MGS-0257", name: "Wanjiku N.", className: "Form 2", stream: "West", attendance: "Late", subject: "English", score: 76, feesDue: 48000, feesPaid: 42000 },
  { id: "s-3", schoolId: "demo-st-elizabeth", admissionNo: "SES-0108", name: "Brian K.", className: "Grade 8", stream: "A", attendance: "Present", subject: "Mathematics", score: 91, feesDue: 36000, feesPaid: 36000 },
  { id: "s-4", schoolId: "demo-st-elizabeth", admissionNo: "SES-0119", name: "Faith W.", className: "Grade 7", stream: "B", attendance: "Absent", subject: "Science", score: 68, feesDue: 36000, feesPaid: 24000 },
  { id: "s-5", schoolId: "demo-greenfield", admissionNo: "GFA-0312", name: "Daniel O.", className: "Grade 6", stream: "A", attendance: "Present", subject: "Kiswahili", score: 88, feesDue: 28000, feesPaid: 28000 },
  { id: "s-6", schoolId: "demo-greenfield", admissionNo: "GFA-0320", name: "Linet C.", className: "Grade 5", stream: "B", attendance: "Present", subject: "Mathematics", score: 79, feesDue: 28000, feesPaid: 18000 }
];

const navigation = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "schools", label: "Schools", icon: "⌂" },
  { id: "students", label: "Students", icon: "♙" },
  { id: "attendance", label: "Attendance", icon: "◷" },
  { id: "academics", label: "Academics", icon: "▤" },
  { id: "fees", label: "Fees", icon: "¤" }
];

const pageDetails = {
  overview: { title: "School overview", subtitle: "A live-at-a-glance view of your school network." },
  schools: { title: "Schools", subtitle: "School profiles across your network." },
  students: { title: "Students", subtitle: "Student roster for the selected school scope." },
  attendance: { title: "Attendance", subtitle: "Daily attendance overview for the selected school scope." },
  academics: { title: "Academics", subtitle: "Recent assessment results for the selected school scope." },
  fees: { title: "Fees & payments", subtitle: "Fee account summaries for the selected school scope." }
};

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}

function StatCard({ icon, label, value, detail, tone = "mint" }) {
  return (
    <article className="platform-stat">
      <span className={`platform-stat-icon ${tone}`}>{icon}</span>
      <span className="platform-stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SchoolCard({ school, count, onOpen }) {
  return (
    <button className="platform-school-card" type="button" onClick={onOpen}>
      <span className="platform-school-avatar">{initials(school.name)}</span>
      <span className="platform-school-details"><strong>{school.name}</strong><small>{school.type} · {school.location}</small></span>
      <span className="platform-school-count"><strong>{count}</strong><small>students</small></span>
      <span className="platform-arrow" aria-hidden="true">→</span>
    </button>
  );
}

function StudentTable({ rows, page }) {
  if (rows.length === 0) return <p className="platform-empty">No demo records match this school and search.</p>;

  if (page === "attendance") {
    return <div className="platform-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>School</th><th>Today</th></tr></thead><tbody>
      {rows.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td><td>{student.className} · {student.stream}</td><td>{schools.find((school) => school.id === student.schoolId)?.name}</td><td><span className={`platform-status status-${student.attendance.toLowerCase()}`}>{student.attendance}</span></td></tr>)}
    </tbody></table></div>;
  }

  if (page === "academics") {
    return <div className="platform-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>School</th><th>Subject</th><th>Latest score</th></tr></thead><tbody>
      {rows.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td><td>{student.className}</td><td>{schools.find((school) => school.id === student.schoolId)?.name}</td><td>{student.subject}</td><td><span className="platform-score">{student.score}%</span></td></tr>)}
    </tbody></table></div>;
  }

  if (page === "fees") {
    return <div className="platform-table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>School</th><th>Paid</th><th>Balance</th></tr></thead><tbody>
      {rows.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td><td>{student.className}</td><td>{schools.find((school) => school.id === student.schoolId)?.name}</td><td>{formatMoney(student.feesPaid)}</td><td><strong>{formatMoney(student.feesDue - student.feesPaid)}</strong></td></tr>)}
    </tbody></table></div>;
  }

  return <div className="platform-table-wrap"><table><thead><tr><th>Student</th><th>Class / stream</th><th>School</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
    {rows.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td><td>{student.className} · {student.stream}</td><td>{schools.find((school) => school.id === student.schoolId)?.name}</td><td><span className={`platform-status status-${student.attendance.toLowerCase()}`}>{student.attendance}</span></td><td><span className="platform-status status-active">Active</span></td></tr>)}
  </tbody></table></div>;
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [selectedSchoolId, setSelectedSchoolId] = useState("all");
  const [search, setSearch] = useState("");
  const scopedStudents = useMemo(() => students.filter((student) =>
    (selectedSchoolId === "all" || student.schoolId === selectedSchoolId) &&
    `${student.name} ${student.admissionNo} ${student.className}`.toLowerCase().includes(search.toLowerCase())
  ), [selectedSchoolId, search]);
  const scopedSchool = schools.find((school) => school.id === selectedSchoolId);
  const totalDue = scopedStudents.reduce((sum, student) => sum + student.feesDue, 0);
  const totalPaid = scopedStudents.reduce((sum, student) => sum + student.feesPaid, 0);
  const presentCount = scopedStudents.filter((student) => student.attendance === "Present").length;
  const attendanceRate = scopedStudents.length ? Math.round((presentCount / scopedStudents.length) * 100) : 0;
  const averageScore = scopedStudents.length ? Math.round(scopedStudents.reduce((sum, student) => sum + student.score, 0) / scopedStudents.length) : 0;
  const activePage = pageDetails[page];

  function openSchool(schoolId) {
    setSelectedSchoolId(schoolId);
    setPage("students");
    setSearch("");
  }

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <a className="platform-brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage("overview"); }}>
          <span className="platform-brand-mark">L</span><span className="platform-brand-name">LIFFAN<small>EDUCATION</small></span>
        </a>
        <p className="platform-nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => <button key={item.id} type="button" aria-current={page === item.id ? "page" : undefined} className={`platform-nav-item ${page === item.id ? "selected" : ""}`} onClick={() => setPage(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}
        </nav>
        <div className="platform-sidebar-bottom"><span className="platform-live-dot" /><div><strong>Preview workspace</strong><small>Sample data only</small></div></div>
      </aside>

      <main className="platform-main">
        <header className="platform-topbar">
          <div><span className="platform-breadcrumb">LIFFAN <span>/</span> ADMINISTRATION</span><h1>{activePage.title}</h1></div>
          <div className="platform-topbar-actions">
            <label className="platform-school-picker"><span>School scope</span><select value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value)}><option value="all">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
            <span className="platform-user"><span className="platform-user-avatar">LA</span><span>Platform admin<small>Preview account</small></span></span>
          </div>
        </header>

        <div className="platform-preview-banner"><span>PREVIEW MODE</span> Sample records only. Sign-in and school permissions are not configured; do not enter real student data.</div>
        <div className="platform-page-intro"><div><p>ONE PLATFORM · MANY SCHOOLS</p><h2>{scopedSchool ? scopedSchool.name : "Your school network"}</h2><span>{activePage.subtitle}</span></div><span className="platform-scope-pill">{scopedSchool ? scopedSchool.location : `${schools.length} schools in network`}</span></div>

        {page === "overview" && <>
          <section className="platform-stats-grid">
            <StatCard icon="⌂" label="Schools" value={schools.length} detail="Across your network" tone="indigo" />
            <StatCard icon="♙" label="Students" value={scopedStudents.length} detail={scopedSchool ? `At ${scopedSchool.name}` : "Across all schools"} tone="mint" />
            <StatCard icon="◷" label="Present today" value={`${attendanceRate}%`} detail={`${presentCount} of ${scopedStudents.length} sample students`} tone="amber" />
            <StatCard icon="▤" label="Average score" value={`${averageScore}%`} detail="Latest sample assessments" tone="blue" />
          </section>
          <section className="platform-overview-grid">
            <div className="platform-panel platform-schools-panel"><div className="platform-panel-heading"><div><h3>Schools in your network</h3><p>Choose a school to open its roster.</p></div><span className="platform-count">{schools.length}</span></div>
              <div className="platform-school-list">{schools.map((school) => <SchoolCard key={school.id} school={school} count={students.filter((student) => student.schoolId === school.id).length} onOpen={() => openSchool(school.id)} />)}</div>
            </div>
            <div className="platform-panel platform-summary-panel"><div className="platform-panel-heading"><div><h3>Fee collection</h3><p>Combined sample account totals</p></div><span className="platform-summary-icon">¤</span></div>
              <div className="platform-fee-total">{formatMoney(totalPaid)}<small>collected of {formatMoney(totalDue)}</small></div>
              <div className="platform-progress"><span style={{ width: `${totalDue ? Math.round((totalPaid / totalDue) * 100) : 0}%` }} /></div>
              <div className="platform-summary-foot"><span>Collection rate</span><strong>{totalDue ? Math.round((totalPaid / totalDue) * 100) : 0}%</strong></div>
              <button className="platform-text-link" type="button" onClick={() => setPage("fees")}>View fee accounts <span>→</span></button>
            </div>
          </section>
          <section className="platform-panel platform-activity"><div className="platform-panel-heading"><div><h3>School management</h3><p>Each workspace is scoped to its selected school.</p></div></div><div className="platform-quick-links">{navigation.slice(2).map((item) => <button key={item.id} type="button" onClick={() => setPage(item.id)}><span>{item.icon}</span><strong>{item.label}</strong><small>Open module →</small></button>)}</div></section>
        </>}

        {page === "schools" && <section className="platform-panel platform-module-panel"><div className="platform-panel-heading"><div><h3>School directory</h3><p>Sample school profiles for this preview.</p></div><span className="platform-count">{schools.length}</span></div><div className="platform-school-list">{schools.map((school) => <SchoolCard key={school.id} school={school} count={students.filter((student) => student.schoolId === school.id).length} onOpen={() => openSchool(school.id)} />)}</div><div className="platform-locked-notice"><span>⌑</span><div><strong>School registration is locked</strong><p>Platform administrator sign-in and server-side authorization must be implemented before schools can be added or changed.</p></div></div></section>}

        {["students", "attendance", "academics", "fees"].includes(page) && <>
          <section className="platform-stats-grid platform-module-stats">
            <StatCard icon="♙" label="Students in scope" value={scopedStudents.length} detail={scopedSchool ? scopedSchool.name : "All schools"} tone="mint" />
            {page === "attendance" && <StatCard icon="◷" label="Present today" value={`${attendanceRate}%`} detail={`${presentCount} present in sample`} tone="amber" />}
            {page === "academics" && <StatCard icon="▤" label="Average score" value={`${averageScore}%`} detail="Latest sample assessments" tone="indigo" />}
            {page === "fees" && <StatCard icon="¤" label="Outstanding balance" value={formatMoney(totalDue - totalPaid)} detail={`${formatMoney(totalPaid)} collected`} tone="blue" />}
            <StatCard icon="⌕" label="School scope" value={scopedSchool ? "1" : schools.length} detail={scopedSchool ? "Selected school" : "Network-wide view"} tone="indigo" />
          </section>
          <section className="platform-panel platform-module-panel"><div className="platform-panel-heading"><div><h3>{page === "students" ? "Student roster" : page === "attendance" ? "Attendance register" : page === "academics" ? "Recent assessments" : "Student fee accounts"}</h3><p>{scopedSchool ? `Records for ${scopedSchool.name}` : "Records shown with their school for network-wide review."}</p></div><label className="platform-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" aria-label="Search students" /></label></div><StudentTable rows={scopedStudents} page={page} /><p className="platform-table-note">Preview records are illustrative only and are not saved to the database.</p></section>
        </>}

        <footer className="platform-footer"><strong>LIFFAN ALL-SCHOOL PLATFORM</strong><span>Multi-school preview · secure sign-in required before real data</span></footer>
      </main>
    </div>
  );
}
