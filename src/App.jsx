import "./platform.css";
import "./platform-mobile.css";

export default function App() {
  return (
    <main className="liffan-home">

      <section className="liffan-hero">
        <div className="liffan-hero-content">
          <div className="liffan-brand">
            <span className="liffan-brand-mark">L</span>
            <div>
              <strong>LIFFAN</strong>
              <small>EDUCATION</small>
            </div>
          </div>

          <span className="liffan-eyebrow">
            ONE PLATFORM · EVERY SCHOOL
          </span>

          <h1>
            Let's Convert
            <br />
            Learning Digital.
          </h1>

          <p>
            Give your school a smarter way to work.
            Liffan brings administration, students,
            teachers, academics, fees and communication
            together in one secure digital platform.
          </p>

          <div className="liffan-hero-actions">
            <button
              className="liffan-primary-button"
              type="button"
              onClick={() => {
                window.location.href = "/register-school.html";
              }}
            >
              Register Your School
            </button>

            <button
              className="liffan-secondary-button"
              type="button"
              onClick={() => {
                window.location.href = "/login.html";
              }}
            >
              School Login
            </button>
          </div>

          <div className="liffan-trust">
            <span>✓ Secure school workspaces</span>
            <span>✓ Built for growing schools</span>
            <span>✓ Your school. Your data.</span>
          </div>
        </div>

        <div className="liffan-hero-card">
          <span className="liffan-card-label">
            DIGITAL SCHOOL MANAGEMENT
          </span>

          <h2>
            Everything your school needs.
          </h2>

          <p>
            One connected workspace from admission
            to graduation.
          </p>

          <div className="liffan-module-grid">
            <span>Admissions</span>
            <span>Students</span>
            <span>Teachers</span>
            <span>Attendance</span>
            <span>Academics</span>
            <span>Fees</span>
            <span>Parents</span>
            <span>Reports</span>
          </div>
        </div>
      </section>

      <section className="liffan-benefits">

        <article>
          <span className="liffan-number">01</span>
          <h3>Run Your School Smarter</h3>
          <p>
            Replace scattered records and repetitive
            paperwork with one organized digital
            workspace.
          </p>
        </article>

        <article>
          <span className="liffan-number">02</span>
          <h3>Your School. Your Identity.</h3>
          <p>
            Every approved school receives its own
            workspace with its school name, logo,
            motto, information and records.
          </p>
        </article>

        <article>
          <span className="liffan-number">03</span>
          <h3>From Admission to Results</h3>
          <p>
            Manage the complete student journey,
            including admissions, attendance,
            academics, fees and reports.
          </p>
        </article>

      </section>

      <section className="liffan-digital-section">
        <div>
          <span className="liffan-eyebrow">
            BUILT FOR MODERN EDUCATION
          </span>

          <h2>
            Your school deserves more than paperwork.
          </h2>

          <p>
            Liffan helps schools spend less time
            managing records and more time focusing
            on learners.
          </p>
        </div>

        <div className="liffan-digital-points">
          <div>
            <strong>One School</strong>
            <span>One secure digital workspace</span>
          </div>

          <div>
            <strong>Connected</strong>
            <span>Administration, teachers and parents</span>
          </div>

          <div>
            <strong>Simple</strong>
            <span>Designed for everyday school work</span>
          </div>
        </div>
      </section>

      <section className="liffan-cta">
        <span>READY TO GO DIGITAL?</span>

        <h2>
          Bring your school into the future.
        </h2>

        <p>
          Register your school with Liffan and build
          a smarter digital learning environment.
        </p>

        <button
          className="liffan-primary-button"
          type="button"
          onClick={() => {
            window.location.href = "/register-school.html";
          }}
        >
          Register Your School →
        </button>
      </section>

      <footer className="liffan-footer">
        <div>
          <strong>LIFFAN</strong>
          <span>EDUCATION</span>
        </div>

        <p>
          Let's Convert Learning Digital.
        </p>
      </footer>

    </main>
  );
}