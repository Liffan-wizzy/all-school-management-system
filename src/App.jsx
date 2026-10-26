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

            <span className="liffan-brand-mark">
              L
            </span>

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
            Liffan connects school administration,
            students, teachers, academics, finance,
            parents and communication in one secure
            digital platform.
          </p>


          <div className="liffan-hero-actions">

            <button
              className="liffan-primary-button"
              type="button"
              onClick={() =>
                go("/register-school.html")
              }
            >
              Register Your School
            </button>


            <button
              className="liffan-secondary-button"
              type="button"
              onClick={() =>
                go("/school-login.html")
              }
            >
              Registered Sign In
            </button>

          </div>


          <div className="liffan-trust">

            <span>
              ✓ Secure school workspaces
            </span>

            <span>
              ✓ Independent school administration
            </span>

            <span>
              ✓ Your school. Your data.
            </span>

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
            One connected workspace from
            admission to graduation.
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


      {/* SIMPLE ACCESS */}
      <section className="liffan-benefits">

        <article>

          <span className="liffan-number">
            01
          </span>

          <h3>
            Register Your School
          </h3>

          <p>
            Apply for your own Liffan school
            workspace. Once approved, your
            school operates independently
            inside the platform.
          </p>

          <button
            className="liffan-primary-button"
            type="button"
            onClick={() =>
              go("/register-school.html")
            }
          >
            Register School
          </button>

        </article>


        <article>

          <span className="liffan-number">
            02
          </span>

          <h3>
            Registered Sign In
          </h3>

          <p>
            One secure sign-in for approved
            Liffan accounts. Your role
            automatically determines the
            dashboard you are allowed to use.
          </p>

          <button
            className="liffan-primary-button"
            type="button"
            onClick={() =>
              go("/school-login.html")
            }
          >
            Sign In
          </button>

        </article>


        <article>

          <span className="liffan-number">
            03
          </span>

          <h3>
            Forgot Password?
          </h3>

          <p>
            Recover access to your registered
            Liffan account if you cannot sign in.
          </p>

          <button
            className="liffan-secondary-button"
            type="button"
            onClick={() =>
              go("/forgot-password.html")
            }
          >
            Recover Account
          </button>

        </article>

      </section>


      {/* HOW ACCESS WORKS */}
      <section className="liffan-digital-section">

        <div>

          <span className="liffan-eyebrow">
            ONE ACCOUNT · CORRECT WORKSPACE
          </span>

          <h2>
            Liffan knows where you belong.
          </h2>

          <p>
            After sign-in, Liffan checks your
            approved role and school automatically.
            You are then taken directly to the
            workspace you are permitted to use.
          </p>

        </div>


        <div className="liffan-digital-points">

          <div>
            <strong>
              Platform Admin
            </strong>

            <span>
              Manages schools, access and billing
            </span>
          </div>


          <div>
            <strong>
              School Admin
            </strong>

            <span>
              Controls their individual school
            </span>
          </div>


          <div>
            <strong>
              School Staff
            </strong>

            <span>
              Work according to assigned duties
            </span>
          </div>


          <div>
            <strong>
              Parents
            </strong>

            <span>
              Access only linked children
            </span>
          </div>

        </div>

      </section>


      {/* SCHOOL CONTROL */}
      <section className="liffan-cta">

        <span>
          YOUR SCHOOL · YOUR WORKSPACE
        </span>

        <h2>
          Run your school digitally.
        </h2>

        <p>
          Manage students, admissions,
          staff, academics, attendance,
          finance, reports, school branding
          and parent access from one system.
        </p>


        <div className="liffan-hero-actions">

          <button
            className="liffan-primary-button"
            type="button"
            onClick={() =>
              go("/register-school.html")
            }
          >
            Register Your School →
          </button>


          <button
            className="liffan-secondary-button"
            type="button"
            onClick={() =>
              go("/school-login.html")
            }
          >
            Registered Sign In
          </button>

        </div>

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