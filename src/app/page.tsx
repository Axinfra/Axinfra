import Link from "next/link"
import styles from "./landing.module.css"

/* ── Reusable Project Card ── */
function ProjectCard({
  title,
  status,
  statusType,
  progress,
  metaLeft,
  metaRight,
}: {
  title: string
  status: string
  statusType: "active" | "done" | "risk"
  progress: number
  metaLeft: string
  metaRight: string
}) {
  const statusClass =
    statusType === "active"
      ? styles.statusActive
      : statusType === "done"
        ? styles.statusDone
        : styles.statusRisk

  const progressClass =
    statusType === "active"
      ? styles.progressActive
      : statusType === "done"
        ? styles.progressDone
        : styles.progressRisk

  return (
    <div className={styles.projectCard}>
      <div className={styles.projectCardHeader}>
        <span className={styles.projectCardTitle}>{title}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>{status}</span>
      </div>
      <div className={styles.progressBar}>
        <div
          className={`${styles.progressFill} ${progressClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={styles.projectCardMeta}>
        <span>{metaLeft}</span>
        <span>{metaRight}</span>
      </div>
    </div>
  )
}

/* ── Checkmark SVG ── */
function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <div className={styles.navLeft}>
          <div className={styles.logoMark}>A</div>
          <span className={styles.wordmark}>Axinfra</span>
        </div>
        <div className={styles.navCenter}>
          <Link href="#platform" className={styles.navLink}>Platform</Link>
          <Link href="#viseron" className={styles.navLink}>Viseron AI</Link>
          <Link href="#pricing" className={styles.navLink}>Pricing</Link>
          <Link href="#clients" className={styles.navLink}>Clients</Link>
        </div>
        <div className={styles.navRight}>
          <Link href="/auth/login" className={styles.btnLogin}>Log in</Link>
          <Link href="/auth/login" className={styles.btnDemo}>Request Demo</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.pulseDot} />
          <span className={styles.heroBadgeText}>Viseron AI — Predictive Risk Intelligence</span>
        </div>
        <h1 className={styles.heroHeadline}>
          The Operating Layer for{" "}
          <span className={styles.goldText}>Construction</span> Command.
        </h1>
        <p className={styles.heroSub}>
          Milestone governance, evidence-based payment release, and AI-driven risk
          detection — built for PMC firms executing at scale across India and GCC.
        </p>
        <div className={styles.heroCtas}>
          <Link href="/auth/login" className={styles.btnDemo}>
            Request a Demo →
          </Link>
          <Link href="#platform" className={styles.btnGhost}>
            See Live Dashboard
          </Link>
        </div>
      </section>

      {/* ── Metrics Strip ── */}
      <div className={styles.metrics}>
        <div className={styles.metricCol}>
          <div className={styles.metricNumber}>
            47<span className={styles.metricSymbol}>%</span>
          </div>
          <div className={styles.metricLabel}>Reduction in update chasing</div>
        </div>
        <div className={styles.metricCol}>
          <div className={styles.metricNumber}>
            3.2<span className={styles.metricSymbol}>×</span>
          </div>
          <div className={styles.metricLabel}>Faster payment approvals</div>
        </div>
        <div className={styles.metricCol}>
          <div className={styles.metricNumber}>
            100<span className={styles.metricSymbol}>%</span>
          </div>
          <div className={styles.metricLabel}>Audit trail, zero WhatsApp</div>
        </div>
        <div className={styles.metricCol}>
          <div className={styles.metricNumber}>
            <span className={styles.metricSymbol}>₹</span>0
          </div>
          <div className={styles.metricLabel}>Setup or integration cost</div>
        </div>
      </div>

      {/* ── Two Panel Section ── */}
      <div id="platform" className={styles.twoPanel}>
        {/* Left Panel — Platform */}
        <div className={styles.panelLeft}>
          <div className={styles.sectionTag}>Platform</div>
          <h2 className={styles.panelTitle}>
            Every milestone. Every rupee. Governed.
          </h2>
          <p className={styles.panelBody}>
            Construction projects fail at the handoff layer — between site, PMC,
            and client. Axinfra replaces ad-hoc communication with structured
            evidence, approval workflows, and a living project record.
          </p>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}><CheckIcon /></span>
              Structured milestone tracking with evidence upload and sign-off chains
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}><CheckIcon /></span>
              Milestone-gated payment release — no approval, no disbursement
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}><CheckIcon /></span>
              Role-based access for clients, PMC directors, and site engineers
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}><CheckIcon /></span>
              Immutable audit trail — every action timestamped and attributed
            </li>
          </ul>
          <div id="viseron" className={styles.aiPill}>
            <span className={styles.aiPillDot} />
            Viseron AI layer included on Intelligence tier
          </div>
        </div>

        {/* Right Panel — Live Project View */}
        <div className={styles.panelRight}>
          <div className={styles.sectionTag}>Live project view</div>
          <div className={styles.projectCards}>
            <ProjectCard
              title="Marina Tower · Phase 2 — Structural"
              status="In Progress"
              statusType="active"
              progress={62}
              metaLeft="Milestone 4 of 7"
              metaRight="62% complete"
            />
            <ProjectCard
              title="Sector 18 Villa Block — MEP Rough-in"
              status="Payment Released"
              statusType="done"
              progress={100}
              metaLeft="Milestone 6 of 6"
              metaRight="₹18.4L disbursed"
            />
            <ProjectCard
              title="Greenfield Commercial Hub — Foundation"
              status="Viseron: Delay Risk"
              statusType="risk"
              progress={28}
              metaLeft="Milestone 2 of 8 · 11 days overdue"
              metaRight="28%"
            />
          </div>
        </div>
      </div>

      {/* ── Bottom Strip ── */}
      <div id="clients" className={styles.bottomStrip}>
        <span className={styles.bottomStripLeft}>
          Trusted by PMC firms across India · GCC expansion 2025
        </span>
        <span className={styles.bottomStripRight}>
          axinfra.in →
        </span>
      </div>
    </div>
  )
}
