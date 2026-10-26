import "./platform.css";
import "./platform-mobile.css";

export default function App() {

  const go = (path) => {
    window.location.href = path;
  };

  return (
    <main className="liffan-home">

      {/* HERO */}
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


          {/* MAIN SCHOOL ENTRY */}
          <div className="liffan-hero-actions">

            <button
              className="liffan-primary-button"
              type="button"
              onClick={() => go("/register-school.html")}
            >
              Register Your School
            </button>

            <button
              className="liffan-secondary-button"
              type="button"
              onClick={() => go("/school-login.html")}
            >
              School Admin Sign In
            </button>

          </div>


          <div className="liffan-trust">
            <span>✓ Secure school workspaces</span>
            <span>✓ Independent school administration</span>
            <span>✓ Your school. Your data.</span>
          </div>

        </div>


        {/* MODULE CARD */}
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
            <span>Secretary</span>
            <span>Finance</span>
            <span>Teachers</span>
            <span>Attendance</span>
            <span>Academics</span>
            <span>Fees</span>
            <span>Parents</span>
            <span>Reports</span>
          </div>

        </div>

      </section>


      {/* SCHOOL ACCESS */}
      <section className="liffan-benefits">

        <article>

          <span className="liffan-number">01</span>

          <h3>Register Your School</h3>

          <p>
            Apply for a Liffan school workspace.
            Once approved, your school receives its
            own secure administration environment.
          </p>

          <button
            className="liffan-primary-button"
            type="button"
            onClick={() => go("/register-school.html")}
          >
            Register School
          </button>

        </article>


        <article>

          <span className="liffan-number">02</span>

          <h3>School Administrator</h3>

          <p>
            The School Admin controls the individual
            school and manages Secretary, Finance Office,
            Teachers and Parent access.
          </p>

          <button
            className="liffan-primary-button"
            type="button"
            onClick={() => go("/school-login.html")}
          >
            School Admin Sign In
          </button>

        </article>


        <article>

          <span className="liffan-number">03</span>

          <h3>School Users</h3>

          <p>
            Secretary, Finance Office, Teachers and
            Parents use their approved school accounts
            to access only their permitted work.
          </p>

          <button
            className="liffan-secondary-button"
            type="button"
            onClick={() => go("/school-login.html")}
          >
            School User Sign In
          </button>

        </article>

      </section>


      {/* DIGITAL SCHOOL */}
      <section className="liffan-digital-section">

        <div>

          <span className="liffan-eyebrow">
            BUILT FOR MODERN EDUCATION
          </span>

          <h2>
            One school. One digital workspace.
          </h2>

          <p>
            Every approved school operates independently
            inside Liffan while the platform securely
            separates its students, staff, finances and
            academic records from other schools.
          </p>

        </div>


        <div className="liffan-digital-points">

          <div>
            <strong>School Admin</strong>
            <span>Controls the individual school</span>
          </div>

          <div>
            <strong>School Staff</strong>
            <span>Access based on assigned duties</span>
          </div>

          <div>
            <strong>Parents</strong>
            <span>Access only their linked children</span>
          </div>

        </div>

      </section>


      {/* SCHOOL CTA */}
      <section className="liffan-cta">

        <span>READY TO GO DIGITAL?</span>

        <h2>
          Bring your school into the future.
        </h2>

        <p>
          Register your school with Liffan and receive
          your own secure digital school workspace.
        </p>

        <button
          className="liffan-primary-button"
          type="button"
          onClick={() => go("/register-school.html")}
        >
          Register Your School →
        </button>

      </section>


      {/* PLATFORM ADMIN */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "20px auto",
          padding: "20px",
          textAlign: "center"
        }}
      >

        <small>
          LIFFAN PLATFORM MANAGEMENT
        </small>

        <p>
          Platform administration is restricted to
          authorized Liffan management.
        </p>

        <button
          className="liffan-secondary-button"
          type="button"
          onClick={() => go("/school-login.html")}
        >
          Platform Admin Sign In
        </button>

      </section>


      {/* FOOTER */}
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