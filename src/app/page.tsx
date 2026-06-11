'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import './landing-page.css';
import {
  motion,
  useInView,
  AnimatePresence,
  useMotionValue,
  useSpring,
  type Variants,
} from 'framer-motion';


/* ─── Motion helpers ─────────────────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

function Section({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ─── Animated counter ───────────────────────────────────────────────────── */
function Counter({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;

    const FRAMES = 55; // ~0.9s at 60fps — fast & snappy
    let frame = 0;

    const tick = () => {
      frame++;
      // Ease-out cubic: starts fast, decelerates at end
      const t = frame / FRAMES;
      const eased = 1 - Math.pow(1 - t, 3);
      const value = to * eased;

      if (ref.current) {
        ref.current.textContent = decimals
          ? value.toFixed(decimals)
          : Math.round(value).toString();
      }

      if (frame < FRAMES) {
        requestAnimationFrame(tick);
      } else if (ref.current) {
        // Snap to exact final value
        ref.current.textContent = decimals ? to.toFixed(decimals) : String(to);
      }
    };

    requestAnimationFrame(tick);
  }, [inView, to, decimals]);

  return <span ref={ref} suppressHydrationWarning>0</span>;
}

/* ─── Flow SVG ───────────────────────────────────────────────────────────── */
function FlowDiagram() {
  const GOLD = '#c9a84c';
  const ARCH = '#7b9ef8';
  const GREEN = '#1d9e75';
  const RED = '#e24b4a';

  const Arr = ({ id, color }: { id: string; color: string }) => (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  );

  const Node = ({ x, y, w, h, stroke, roleColor, role, label, sub, pulse }: {
    x: number; y: number; w: number; h: number; stroke: string; roleColor: string;
    role: string; label: string; sub?: string; pulse?: boolean;
  }) => {
    const bg = stroke === GOLD ? '#1a1508' : stroke === ARCH ? '#080f1a' : '#0a1a12';
    return (
      <g>
        {pulse && (
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.max(w, h) / 2 + 10} fill="none" stroke={stroke} strokeOpacity=".25">
            <animate attributeName="r" values={`${Math.max(w, h) / 2 + 6};${Math.max(w, h) / 2 + 20};${Math.max(w, h) / 2 + 6}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values=".25;0;.25" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
        <rect x={x} y={y} width={w} height={h} rx="10" fill={bg} stroke={stroke} strokeWidth="1.3" />
        <text x={x + w / 2} y={y + h * 0.38} textAnchor="middle" fill={roleColor} fontSize="9" fontFamily="JetBrains Mono,monospace" fontWeight="600" letterSpacing="1.5">{role}</text>
        <text x={x + w / 2} y={y + h * 0.67} textAnchor="middle" fill="#f5e9c8" fontSize="11.5" fontFamily="Instrument Sans,sans-serif" fontWeight="500">{label}</text>
        {sub && <text x={x + w / 2} y={y + h * 0.88} textAnchor="middle" fill={roleColor} fontSize="9" fontFamily="JetBrains Mono,monospace" opacity=".6">{sub}</text>}
      </g>
    );
  };

  const Diamond = ({ cx, cy, size, stroke, roleColor, role, label, pulse }: {
    cx: number; cy: number; size: number; stroke: string; roleColor: string; role: string; label: string; pulse?: boolean;
  }) => (
    <g>
      {pulse && (
        <circle cx={cx} cy={cy} r={size + 8} fill="none" stroke={stroke} strokeOpacity=".22">
          <animate attributeName="r" values={`${size + 6};${size + 18};${size + 6}`} dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values=".22;0;.22" dur="3.2s" repeatCount="indefinite" />
        </circle>
      )}
      <polygon points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`} fill="#1a1508" stroke={stroke} strokeWidth="1.3" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={roleColor} fontSize="8.5" fontFamily="JetBrains Mono,monospace" fontWeight="600" letterSpacing="1">{role}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill="#f5e9c8" fontSize="10.5" fontFamily="Instrument Sans,sans-serif">{label}</text>
    </g>
  );

  const Connector = ({ d, stroke, dur }: { d: string; stroke: string; dur: number }) => (
    <>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1" opacity=".2" />
      <path className="dash" d={d} fill="none" stroke={stroke} strokeWidth="1.3" opacity=".72" style={{ animationDuration: `${dur}s` }} />
      <circle r="3" fill={stroke}>
        <animateMotion dur={`${dur + 0.1}s`} repeatCount="indefinite" path={d} />
      </circle>
    </>
  );

  /* ── coordinate reference ──────────────────────────────────────────────────
     ViewBox 920×560   Node w=160 h=48
     OWNER   cx=110   x=30    divider-right x=215
     CONSULTANT cx=310  x=230   divider-right x=430
     PMC     cx=530   x=450   divider-right x=648
     VENDOR  cx=750   x=660
  ─────────────────────────────────────────────────────────────────────────── */
  return (
    <svg width="100%" viewBox="0 0 920 560" role="img" xmlns="http://www.w3.org/2000/svg" style={{ background: '#080808', borderRadius: 12, display: 'block' }}>
      <title>Axinfra project governance flow</title>
      <defs>
        <Arr id="ag"  color={GOLD}  />
        <Arr id="agr" color={GREEN} />
        <Arr id="ar"  color={RED}   />
        <Arr id="ab"  color={ARCH}  />
      </defs>

      {/* ── swimlane headers ── */}
      {[
        { x: '30',  label: 'CLIENT',     color: GOLD,  x2: '200' },
        { x: '230', label: 'CONSULTANT', color: ARCH,  x2: '385' },
        { x: '450', label: 'PMC',       color: '#aaa',x2: '610' },
        { x: '660', label: 'VENDOR',    color: GREEN, x2: '845' },
      ].map(({ x, label, color, x2 }) => (
        <g key={label}>
          <text x={x} y="32" fill={color} fontSize="10" fontFamily="JetBrains Mono,monospace" fontWeight="600" letterSpacing="2" opacity=".65">{label}</text>
          <line x1={x} y1="38" x2={x2} y2="38" stroke={color} strokeWidth=".5" opacity=".22" />
        </g>
      ))}
      <line x1="215" y1="46" x2="215" y2="535" stroke="#fff" strokeWidth=".4" opacity=".05" />
      <line x1="430" y1="46" x2="430" y2="535" stroke="#fff" strokeWidth=".4" opacity=".05" />
      <line x1="648" y1="46" x2="648" y2="535" stroke="#fff" strokeWidth=".4" opacity=".05" />

      {/* ── row 1: Creates project → Designs plans → Creates BOQ ── */}
      <Node x={30}  y={76} w={160} h={48} stroke={GOLD} roleColor={GOLD} role="CLIENT"     label="Creates project" pulse />
      <Connector d="M190 100 L230 100" stroke={GOLD} dur={1.2} />
      <Node x={230} y={76} w={160} h={48} stroke={ARCH} roleColor={ARCH} role="CONSULTANT" label="Designs plans"  pulse />
      <Connector d="M390 100 L450 100" stroke={ARCH} dur={1.4} />
      <Node x={450} y={76} w={160} h={48} stroke={GOLD} roleColor={GOLD} role="PMC"       label="Creates BOQ" />

      {/* BOQ routes back to Owner for approval */}
      <Connector d="M530 124 L530 160 L110 160 L110 188" stroke={GOLD} dur={2.2} />

      {/* ── row 2: Owner approves BOQ ── */}
      <Diamond cx={110} cy={232} size={44} stroke={GOLD} roleColor={GOLD} role="CLIENT" label="Approve BOQ?" pulse />
      <text x={166} y={228} fill={GREEN} fontSize="10" fontFamily="Instrument Sans,sans-serif" fontWeight="600">✓ Approve</text>
      <text x={10}  y={302} fill={RED}   fontSize="10" fontFamily="Instrument Sans,sans-serif" fontWeight="600">✗ Reject</text>

      {/* Reject → BOQ revised loop */}
      <path d="M110 276 L110 308 L530 308 L530 124" fill="none" stroke={RED} strokeWidth="1" strokeDasharray="4 6" opacity=".6" markerEnd="url(#ar)" />
      <circle r="2.5" fill={RED}><animateMotion dur="3.4s" repeatCount="indefinite" path="M110,276 L110,308 L530,308 L530,124" /></circle>
      <rect x={230} y={297} width={162} height={20} rx="5" fill="#1a0606" />
      <text x={311} y={311} textAnchor="middle" fill={RED} fontSize="9" fontFamily="JetBrains Mono,monospace">BOQ Revised — re-submit</text>

      {/* Approve → PMC milestones → Vendor starts work */}
      <Connector d="M154 232 L450 232" stroke={GREEN} dur={1.6} />
      <Node x={450} y={208} w={160} h={48} stroke={GREEN} roleColor={GREEN} role="PMC"    label="Creates milestones" />
      <Connector d="M610 232 L660 232" stroke={GREEN} dur={1.7} />
      <Node x={660} y={208} w={160} h={48} stroke={GREEN} roleColor={GREEN} role="VENDOR" label="Starts work" pulse />

      {/* ── row 3: Vendor submits evidence → PMC verifies ── */}
      <Connector d="M740 256 L740 360" stroke={GREEN} dur={1.8} />
      <Node x={655} y={360} w={170} h={48} stroke={GREEN} roleColor={GREEN} role="VENDOR" label="Submits evidence" />
      <Connector d="M655 384 L574 384" stroke={GOLD} dur={1.6} />
      <Diamond cx={530} cy={384} size={44} stroke={GOLD} roleColor={GOLD} role="PMC" label="Verifies?" pulse />
      <text x={398} y={380} fill={GREEN} fontSize="10" fontFamily="Instrument Sans,sans-serif" fontWeight="600">✓ Verified</text>
      <text x={536} y={446} fill={RED}   fontSize="10" fontFamily="Instrument Sans,sans-serif" fontWeight="600">✗ Not satisfied</text>

      {/* Not satisfied → back to Vendor */}
      <path d="M530 428 L530 472 L740 472 L740 408" fill="none" stroke={RED} strokeWidth="1" strokeDasharray="4 6" opacity=".6" markerEnd="url(#ar)" />
      <circle r="2.5" fill={RED}><animateMotion dur="3.2s" repeatCount="indefinite" path="M530,428 L530,472 L740,472 L740,408" /></circle>
      <rect x={568} y={461} width={148} height={20} rx="5" fill="#1a0606" />
      <text x={642} y={475} textAnchor="middle" fill={RED} fontSize="9" fontFamily="JetBrains Mono,monospace">Back to In Progress</text>

      {/* ── row 4: Owner releases payment ── */}
      <Connector d="M486 384 L110 384 L110 460" stroke={GREEN} dur={2.5} />
      <Node x={30} y={460} w={160} h={52} stroke={GREEN} roleColor={GREEN} role="CLIENT" label="Releases payment" sub="Milestone closed" pulse />
    </svg>
  );
}

/* ─── Data ───────────────────────────────────────────────────────────────── */
const GANTT_TASKS = [
  { name: 'Project kickoff', role: 'CLIENT', color: 'gold', start: 0, len: 0.8 },
  { name: 'BOQ — Phase 0 Foundation', role: 'PMC', color: 'gold', start: 0.6, len: 1.4 },
  { name: 'BOQ Approval', role: 'CLIENT', color: 'gold', start: 2, len: 0.5 },
  { name: 'Foundation milestones', role: 'PMC', color: 'green', start: 2.4, len: 1.2 },
  { name: 'Foundation work', role: 'VENDOR', color: 'green', start: 2.8, len: 1.8 },
  { name: 'Evidence review — Phase 0', role: 'PMC', color: 'gold', start: 4.6, len: 0.5 },
  { name: 'Payment release — Phase 0', role: 'CLIENT', color: 'green', start: 5.1, len: 0.5 },
  { name: 'BOQ — Structural Works', role: 'PMC', color: 'gold', start: 2, len: 1.2 },
  { name: 'Structural milestones', role: 'PMC', color: 'green', start: 3, len: 0.6 },
  { name: 'Structural work', role: 'VENDOR', color: 'green', start: 3.4, len: 2.8 },
  { name: 'Evidence — Structural', role: 'VENDOR', color: 'gold', start: 6.2, len: 0.5 },
  { name: 'Phase 3 BOQ (Draft)', role: 'PMC', color: 'gray', start: 5, len: 2 },
  { name: 'Facade & MEP (at risk)', role: 'VENDOR', color: 'red', start: 5.8, len: 2.2 },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const FEATURES = [
  { icon: '🏗️', title: 'Milestone-gated workflows', desc: 'Every phase is broken into milestones. Work can only progress when evidence is submitted and verified — no shortcuts, no exceptions.' },
  { icon: '💸', title: 'Evidence-based payment release', desc: 'Owners release payment only after PMC verifies vendor evidence. No approval, no disbursement. Advance exposure becomes a thing of the past.' },
  { icon: '👥', title: 'Role-based access — Owner, PMC, Vendor', desc: 'Each stakeholder sees exactly what they need. Owners see financials. PMC sees execution. Vendors see their milestones. Zero information leakage.' },
  { icon: '📋', title: 'Immutable audit trail', desc: 'Every action is timestamped and attributed. Disputes are resolved in minutes with data, not weeks with screenshots. 100% traceable from day one.' },
  { icon: '⚡', title: 'Viseron AI risk detection', desc: 'Predictive intelligence flags delays, budget overruns, and compliance gaps before they escalate. Built into the intelligence tier — no extra setup.' },
  { icon: '📊', title: 'Execution intelligence & analytics', desc: 'S-curves, burn-down charts, vendor scorecards, delay cost estimates, and payment cycle analysis — all derived from live project data.' },
];

const PROJECTS = [
  { name: 'Marina Tower · Phase 2 — Structural Works', status: 'In Progress', statusClass: 'badge-gold', pct: 62, fill: 'var(--gold)', meta: ['Milestone 4 of 7', '62% complete'] },
  { name: 'Sector 18 Villa Block — MEP Rough-in', status: 'Payment Released', statusClass: 'badge-green', pct: 100, fill: 'var(--green)', meta: ['Milestone 6 of 6', '₹16.4L disbursed'] },
  { name: 'Greenfield Commercial Hub — Foundation', status: 'Viseron: Delay Risk', statusClass: 'badge-red', pct: 28, fill: 'var(--red)', meta: ['Milestone 2 of 8 · 11 days overdue', '28%'] },
];

const AUDIT_LOG = [
  { time: '2026-05-25 22:41', actor: 'Ravi Kumar (Owner)', action: 'released payment for Milestone 3 — Structural Works', badge: 'badge-green', label: 'Payment Released' },
  { time: '2026-05-25 19:12', actor: 'Priya Mehta (PMC)', action: 'verified evidence for Milestone 3 — Marina Tower Phase 2', badge: 'badge-green', label: 'Verified' },
  { time: '2026-05-25 14:03', actor: 'BuildCo Vendors', action: 'submitted 7 photos + site report for Milestone 3', badge: 'badge-gold', label: 'Evidence Submitted' },
  { time: '2026-05-24 11:30', actor: 'Priya Mehta (PMC)', action: 'rejected evidence for Phase 3 — insufficient rebar photo coverage', badge: 'badge-red', label: 'Not Satisfied' },
  { time: '2026-05-23 09:15', actor: 'Ravi Kumar (Owner)', action: 'approved BOQ for Phase 2 — Facade & MEP (₹28.4L)', badge: 'badge-green', label: 'BOQ Approved' },
  { time: '2026-05-22 16:44', actor: 'Priya Mehta (PMC)', action: 'created 4 milestones for Phase 2 — Marina Tower', badge: 'badge-gray', label: 'Milestones Created' },
  { time: '2026-05-21 10:00', actor: 'Ravi Kumar (Owner)', action: 'created project — Downtown Office Building', badge: 'badge-gold', label: 'Project Created' },
];

const NAV_LINKS = [
  { label: 'Platform',      href: '#platform' },
  { label: 'How it Works',  href: '#how-it-works' },
  { label: 'Dashboard',     href: '#dashboard' },
  { label: 'Support',       href: '#support' },
];

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function HomePage() {
  const [counters, setCounters] = useState({ a: 0, b: 0, c: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const statsRef = useRef(null);

  // Demo request modal
  const [demoOpen, setDemoOpen] = useState(false);
  const [demo, setDemo] = useState({ name: '', email: '', company: '', phone: '', message: '' });
  const [demoState, setDemoState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [demoError, setDemoError] = useState('');

  async function handleDemoSubmit(e: FormEvent) {
    e.preventDefault();
    setDemoState('sending');
    setDemoError('');
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo),
      });
      const data = await res.json();
      if (data.success) {
        setDemoState('sent');
        setDemo({ name: '', email: '', company: '', phone: '', message: '' });
      } else {
        setDemoState('error');
        setDemoError(data.error || 'Something went wrong');
      }
    } catch {
      setDemoState('error');
      setDemoError('Network error. Please email dev@axinfra.in directly.');
    }
  }

  // Support form state
  const [support, setSupport] = useState({ name: '', email: '', subject: '', message: '' });
  const [supportState, setSupportState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [supportError, setSupportError] = useState('');

  async function handleSupportSubmit(e: FormEvent) {
    e.preventDefault();
    setSupportState('sending');
    setSupportError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(support),
      });
      const data = await res.json();
      if (data.success) {
        setSupportState('sent');
        setSupport({ name: '', email: '', subject: '', message: '' });
      } else {
        setSupportState('error');
        setSupportError(data.error || 'Something went wrong');
      }
    } catch {
      setSupportState('error');
      setSupportError('Network error. Please email dev@axinfra.in directly.');
    }
  }

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        let frame = 0;
        const total = 70;
        const tick = () => {
          frame++;
          setCounters({ a: Math.round(47 * frame / total), b: parseFloat((3.2 * frame / total).toFixed(1)), c: Math.round(100 * frame / total) });
          if (frame < total) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.disconnect();
      }
    }, { threshold: 0.6 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* ── NAV ── */}
      <nav className="ax-nav">
        <div className="ax-logo">
          <div className="ax-logomark">A</div>
          Axinfra
        </div>

        <div className="ax-navlinks">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href}>{label}</a>
          ))}
        </div>

        <div className="ax-navcta">
          <Link href="/auth/login" className="btn-ghost">Log in</Link>
          <button onClick={() => { setDemoOpen(true); setDemoState('idle'); }} className="btn-primary">Request Demo</button>
        </div>

        <button className="ax-hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="ax-mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            <button
              onClick={() => { setMenuOpen(false); setDemoOpen(true); setDemoState('idle'); }}
              className="btn-primary"
              style={{ marginBottom: 4, justifyContent: 'center' }}
            >
              Request Demo
            </button>
            <Link href="/auth/login" className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => setMenuOpen(false)}>
              Log in
            </Link>
            {NAV_LINKS.map(({ label, href }) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO ── */}
      <section className="ax-hero">
        <div className="hero-gridbg" />
        <div className="hero-glow" />

        <motion.div
          className="hero-badge"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <span className="hero-dot" />
          Viseron AI — Predictive Risk Intelligence
        </motion.div>

        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          The Operating Layer for<br />
          <span className="gold"><em>Construction</em></span> Command.
        </motion.h1>

        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.36 }}
        >
          Milestone governance, evidence-based payment release, and AI-driven risk
          detection — built for PMC firms executing at scale across India and GCC.
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.48 }}
        >
          <button onClick={() => { setDemoOpen(true); setDemoState('idle'); }} className="btn-hero">Request a Demo →</button>
          <a href="#how-it-works" className="btn-outline">See Live Dashboard</a>
        </motion.div>

        {/* Stats */}
        <motion.div
          // className="stats-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.3 }}
        >
          <div className="stats-bar reveal" ref={statsRef}>
          <div className="stat-item"><div className="stat-num"><span className="acc">{counters.a}</span>%</div><div className="stat-label">Reduction in update chasing</div></div>
          <div className="stat-item"><div className="stat-num"><span className="acc">{counters.b}</span>×</div><div className="stat-label">Faster payment approvals</div></div>
          <div className="stat-item"><div className="stat-num"><span className="acc">{counters.c}</span>%</div><div className="stat-label">Audit trail, zero WhatsApp</div></div>
          <div className="stat-item"><div className="stat-num">₹<span className="acc">0</span></div><div className="stat-label">Setup or integration cost</div></div>
        </div>
        </motion.div>
      </section>

      <div className="ax-divider" />

      {/* ── QUOTE 1 ── */}
      <Section className="quote-section">
        <div className="quote-mark">"</div>
        <p className="quote-text">We stopped chasing vendors on WhatsApp the week we went live. Every milestone, every payment — it's all in one place, timestamped, and traceable.</p>
        <p className="quote-attr">PMC Director · Residential high-rise, Bangalore</p>
      </Section>

      <div className="ax-divider" />

      {/* ── HOW IT WORKS ── */}
      <section className="ax-section" id="how-it-works" style={{ background: 'var(--bg1)' }}>
        <Section className="sec-head-row">
          <div>
            <div className="sec-tag">How it works</div>
            <h2 className="sec-title">Four roles.<br /><em>One governed flow.</em></h2>
          </div>
          <p className="sec-sub">Owner creates the project. Consultant designs the plans. PMC writes the BOQ, governs milestones, and verifies evidence. Vendor executes and submits proof. Every approval on record — nothing moves without a paper trail.</p>
        </Section>
        <Section className="flow-wrap">
          <FlowDiagram />
        </Section>
      </section>

      <div className="ax-divider" />

      {/* ── PLATFORM ── */}
      <section className="ax-section" id="platform">
        <Section>
          <div className="sec-tag">Platform</div>
          <h2 className="sec-title">Built for the handoff<br /><em>layer that always breaks.</em></h2>
          <p className="sec-sub">Construction projects don't fail on site — they fail between site, PMC, and client. Axinfra replaces ad-hoc communication with a structured record every stakeholder trusts.</p>
        </Section>

        <div className="feat-grid" style={{ marginTop: 52 }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="feat-card"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="feat-icon">{f.icon}</div>
              <div className="feat-title">{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="ax-divider" />

      {/* ── LIVE PROJECTS ── */}
      <section className="ax-section" id="dashboard" style={{ background: 'var(--bg1)' }}>
        <Section className="sec-head-row">
          <div>
            <div className="sec-tag">Live project view</div>
            <h2 className="sec-title">Real status. Real time.<br /><em>Zero WhatsApp.</em></h2>
          </div>
          <p className="sec-sub">Every project your PMC manages, updated the moment evidence is submitted or a milestone changes state. No follow-up calls. No status meetings.</p>
        </Section>

        <div className="proj-list">
          {PROJECTS.map((p, i) => (
            <motion.div
              key={p.name}
              className="proj-row"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
            >
              <div className="proj-top">
                <div className="proj-name">{p.name}</div>
                <span className={`badge ${p.statusClass}`}>{p.status}</span>
              </div>
              <div className="proj-bar">
                <motion.div
                  className="proj-fill"
                  style={{ background: p.fill }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${p.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: i * 0.12 + 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="proj-meta"><span>{p.meta[0]}</span><span>{p.meta[1]}</span></div>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="ax-divider" />

      {/* ── OWNER DASHBOARD ── */}
      <section className="ax-section">
        <Section>
          <div className="sec-tag">Owner Dashboard</div>
          <h2 className="sec-title">Full financial visibility.<br /><em>One screen.</em></h2>
          <p className="sec-sub">Verified value, disbursed payments, unpaid milestones, advance exposure — all derived automatically from your project data. No spreadsheets. No manual reporting.</p>
        </Section>

        <Section className="dash-chrome">
          <div className="dash-bar">
            <div className="dash-dot" style={{ background: '#ff5f57' }} />
            <div className="dash-dot" style={{ background: '#febc2e' }} />
            <div className="dash-dot" style={{ background: '#28c840' }} />
            <span className="dash-url">axinfra.in · Downtown Office Building · Owner Dashboard</span>
          </div>
          <div className="dash-body">
            <div className="dash-metrics">
              {([['Verified Value', '₹3,06,60,000', ''], ['Paid Value', '₹96,60,000', 'green'], ['Unpaid Value', '₹2,10,00,000', 'gold'], ['Blocked Value', '₹0', 'red'], ['Advance Exposure', '₹0', 'purple'], ['BOQ Overruns', '0', 'gold']] as const).map(([l, v, c]) => (
                <div className="m-card" key={l}><div className="m-label">{l}</div><div className={`m-val ${c}`}>{v}</div></div>
              ))}
            </div>
            <div className="dash-charts">
              <div className="c-card">
                <div className="c-title">Milestone completion rate</div>
                <div className="c-sub">Verified or closed, per project</div>
                <div className="bars">
                  {[['35%', 'Downtown'], ['60%', 'Prestige'], ['55%', 'Residential'], ['62%', 'Industrial'], ['58%', 'Warehouse']].map(([h, l]) => (
                    <div className="bar-col" key={l}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                        <div className="bar" style={{ height: h, background: 'var(--gold)', opacity: 0.85 }} />
                      </div>
                      <div className="bar-lbl">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="c-card">
                <div className="c-title">Budget vs actual spend</div>
                <div className="c-sub">BOQ planned vs amount paid</div>
                <div className="bars">
                  {[['38%', '18%', 'Downtown'], ['100%', '10%', 'Prestige'], ['22%', '8%', 'Residential'], ['18%', '6%', 'Industrial']].map(([b, a, l]) => (
                    <div className="bar-col" key={l}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%' }}>
                        <div style={{ flex: 1, height: b, background: '#378ADD', opacity: 0.7, borderRadius: '3px 3px 0 0' }} />
                        <div style={{ flex: 1, height: a, background: 'var(--gold)', opacity: 0.85, borderRadius: '3px 3px 0 0' }} />
                      </div>
                      <div className="bar-lbl">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="c-card">
                <div className="c-title">Payment status</div>
                <div className="c-sub">14 payments across projects</div>
                <div className="donut-wrap">
                  <svg width="90" height="90" viewBox="0 0 90 90">
                    <circle cx="45" cy="45" r="32" fill="none" stroke="#1d9e75" strokeWidth="13" strokeDasharray="100 201" strokeDashoffset="0" transform="rotate(-90 45 45)" />
                    <circle cx="45" cy="45" r="32" fill="none" stroke="#c9a84c" strokeWidth="13" strokeDasharray="76 201" strokeDashoffset="-100" transform="rotate(-90 45 45)" />
                    <circle cx="45" cy="45" r="32" fill="none" stroke="#e24b4a" strokeWidth="13" strokeDasharray="25 201" strokeDashoffset="-176" transform="rotate(-90 45 45)" />
                    <text x="45" y="41" textAnchor="middle" fill="var(--text)" fontSize="13" fontFamily="DM Serif Display,serif">14</text>
                    <text x="45" y="53" textAnchor="middle" fill="var(--text3)" fontSize="8" fontFamily="JetBrains Mono,monospace">PAYMENTS</text>
                  </svg>
                  <div className="d-legend">
                    {[['#1d9e75', 'Approved', '50%'], ['#c9a84c', 'Pending', '38%'], ['#e24b4a', 'Disputed', '12%']].map(([c, l, p]) => (
                      <div className="d-row" key={l}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div className="d-dot" style={{ background: c }} />
                          <span style={{ color: 'var(--text2)', fontSize: 11 }}>{l}</span>
                        </div>
                        <span style={{ color: 'var(--text)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </section>

      <div className="ax-divider" />

      {/* ── GANTT ── */}
      <section className="ax-section" style={{ background: 'var(--bg1)' }}>
        <Section className="sec-head-row">
          <div>
            <div className="sec-tag">Execution intelligence · Gantt</div>
            <h2 className="sec-title">Planned vs actual.<br /><em>Always honest.</em></h2>
          </div>
          <p className="sec-sub">Visual timeline with milestone status, vendor ownership, and delay flags — updated in real time as evidence is submitted and milestones change state.</p>
        </Section>

        <Section className="gantt-wrap">
          <div className="gantt-head">
            <div className="gantt-hcell">Task · Role</div>
            <div className="gantt-months">{MONTHS.map((m) => <div className="gantt-mo" key={m}>{m}</div>)}</div>
          </div>
          {GANTT_TASKS.map((t, i) => {
            const pct = (v: number) => `${((v / 8) * 100).toFixed(2)}%`;
            return (
              <motion.div
                key={i}
                className="gantt-row"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
              >
                <div className="gantt-task">
                  <div className="g-name">{t.name}</div>
                  <div className="g-role">{t.role}</div>
                </div>
                <div className="gantt-tl">
                  <div className={`g-bar ${t.color}`} style={{ left: pct(t.start), width: pct(t.len) }}>{t.name}</div>
                </div>
              </motion.div>
            );
          })}
        </Section>
      </section>

      <div className="ax-divider" />

      {/* ── AUDIT ── */}
      <section className="ax-section">
        <Section>
          <div className="sec-tag">Audit trail</div>
          <h2 className="sec-title">Every action. Every actor.<br /><em>Timestamped forever.</em></h2>
          <p className="sec-sub">No more "I thought you approved it." Every decision, every submission, every payment — recorded immutably. Disputes resolved in seconds, not weeks.</p>
        </Section>

        <div className="audit-feed" style={{ marginTop: 48 }}>
          {AUDIT_LOG.map((a, i) => (
            <motion.div
              key={i}
              className="audit-item"
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.07 }}
            >
              <span className="audit-time">{a.time}</span>
              <span className="audit-text"><strong>{a.actor}</strong> {a.action}</span>
              <span className={`badge ${a.badge}`}>{a.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="ax-divider" />

      {/* ── QUOTE 2 ── */}
      <Section className="quote-section">
        <div className="quote-mark">"</div>
        <p className="quote-text">Our payment cycles dropped from 18 days to under 4. The evidence-first model means vendors show up with proof, not excuses.</p>
        <p className="quote-attr">Owner · Commercial development, Dubai GCC</p>
      </Section>

      <div className="ax-divider" />

      {/* ── SUPPORT ── */}
      <section className="ax-section" id="support" style={{ background: 'var(--bg1)' }}>
        <Section className="sec-head-row">
          <div>
            <div className="sec-tag">Customer Support</div>
            <h2 className="sec-title">Got a question<br /><em>or an issue?</em></h2>
          </div>
          <p className="sec-sub">
            Send us a message and we&apos;ll get back to you within 1–2 business days.
            For urgent issues you can also email us directly at{' '}
            <a href="mailto:dev@axinfra.in" style={{ color: 'var(--gold)', textDecoration: 'none' }}>dev@axinfra.in</a>.
          </p>
        </Section>

        <Section style={{ marginTop: 48, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          {supportState === 'sent' ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(29,158,117,0.08)',
                border: '1px solid rgba(29,158,117,0.25)',
                borderRadius: 16,
                padding: '40px 32px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#e8e4dc', margin: '0 0 8px' }}>Message sent!</h3>
              <p style={{ fontSize: 14, color: 'rgba(232,228,220,0.55)', margin: '0 0 24px' }}>
                We&apos;ve also sent a confirmation to your email. Our team will be in touch shortly.
              </p>
              <button
                onClick={() => setSupportState('idle')}
                style={{
                  background: 'rgba(29,158,117,0.12)',
                  color: '#1d9e75',
                  border: '1px solid rgba(29,158,117,0.3)',
                  borderRadius: 10,
                  padding: '10px 24px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Send another message
              </button>
            </motion.div>
          ) : (
            <form
              onSubmit={handleSupportSubmit}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={support.name}
                    onChange={e => setSupport(s => ({ ...s, name: e.target.value }))}
                    placeholder="Rahul Sharma"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '11px 14px',
                      fontSize: 13.5, color: '#e8e4dc', outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={support.email}
                    onChange={e => setSupport(s => ({ ...s, email: e.target.value }))}
                    placeholder="you@company.com"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '11px 14px',
                      fontSize: 13.5, color: '#e8e4dc', outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  Subject *
                </label>
                <select
                  required
                  value={support.subject}
                  onChange={e => setSupport(s => ({ ...s, subject: e.target.value }))}
                  style={{
                    width: '100%',
                    background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '11px 14px',
                    fontSize: 13.5, color: support.subject ? '#e8e4dc' : 'rgba(232,228,220,0.3)', outline: 'none',
                    appearance: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="" disabled>Select a topic…</option>
                  <option value="Bug report">Bug report</option>
                  <option value="Feature request">Feature request</option>
                  <option value="Account or login issue">Account or login issue</option>
                  <option value="Billing or payment query">Billing or payment query</option>
                  <option value="General inquiry">General inquiry</option>
                  <option value="Demo request">Demo request</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  Message *
                </label>
                <textarea
                  required
                  rows={5}
                  value={support.message}
                  onChange={e => setSupport(s => ({ ...s, message: e.target.value }))}
                  placeholder="Describe your issue or question in detail…"
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '11px 14px',
                    fontSize: 13.5, color: '#e8e4dc', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.6,
                  }}
                />
              </div>

              {supportState === 'error' && (
                <div style={{
                  background: 'rgba(224,96,80,0.1)', border: '1px solid rgba(224,96,80,0.25)',
                  borderRadius: 10, padding: '10px 14px',
                  fontSize: 13, color: '#e06050',
                }}>
                  {supportError}
                </div>
              )}

              <button
                type="submit"
                disabled={supportState === 'sending'}
                style={{
                  background: supportState === 'sending' ? 'rgba(196,163,90,0.5)' : '#c4a35a',
                  color: '#0d0d11', border: 'none', borderRadius: 12,
                  padding: '14px 28px', fontSize: 14, fontWeight: 700,
                  cursor: supportState === 'sending' ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                  alignSelf: 'flex-start',
                }}
              >
                {supportState === 'sending' ? 'Sending…' : 'Send Message →'}
              </button>
            </form>
          )}
        </Section>
      </section>

      <div className="ax-divider" />

      {/* ── FOOTER ── */}
      <footer className="ax-footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="ax-logo"><div className="ax-logomark">A</div>Axinfra</div>
            <p>The operating layer for construction command. Milestone governance, evidence-based payment release, and AI-driven risk detection — built for PMCs at scale.</p>
          </div>
          <div className="footer-col">
            <h4>Platform</h4>
            <a href="#platform">Milestone Tracking</a>
            <a href="#platform">Payment Governance</a>
            <a href="#platform">Audit Trail</a>
            <a href="#dashboard">Execution Intelligence</a>
            <a href="#how-it-works">Viseron AI</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="#support">Support</a>
            <a href="mailto:dev@axinfra.in">Contact Us</a>
            <button onClick={() => { setDemoOpen(true); setDemoState('idle'); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}>Request Demo</button>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Security</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Axinfra. Trusted by PMC firms across India · GCC expansion 2025.</p>
          <p>axinfra.in →</p>
        </div>
      </footer>

      {/* ── DEMO REQUEST MODAL ── */}
      <AnimatePresence>
        {demoOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setDemoOpen(false); }}
          >
            <motion.div
              style={{
                background: '#13151a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20,
                width: '100%',
                maxWidth: 500,
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Header */}
              <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#c4a35a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Request a Demo</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e8e4dc', margin: 0 }}>See Axinfra in action</h2>
                  <p style={{ fontSize: 13, color: 'rgba(232,228,220,0.5)', marginTop: 6, lineHeight: 1.5 }}>
                    Fill in your details and we&apos;ll schedule a personalised walkthrough within 1 business day.
                  </p>
                </div>
                <button
                  onClick={() => setDemoOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'rgba(232,228,220,0.35)', cursor: 'pointer', padding: 4, marginLeft: 12, marginTop: -2 }}
                  aria-label="Close"
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div style={{ padding: '24px 28px 28px' }}>
                {demoState === 'sent' ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#e8e4dc', margin: '0 0 8px' }}>Request received!</h3>
                    <p style={{ fontSize: 14, color: 'rgba(232,228,220,0.55)', margin: '0 0 24px', lineHeight: 1.6 }}>
                      We&apos;ve also sent a confirmation to your email. Our team will reach out within 1 business day to schedule your demo.
                    </p>
                    <button
                      onClick={() => setDemoOpen(false)}
                      style={{
                        background: 'rgba(196,163,90,0.1)', color: '#c4a35a',
                        border: '1px solid rgba(196,163,90,0.25)', borderRadius: 10,
                        padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleDemoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Full Name *</label>
                        <input
                          type="text" required value={demo.name}
                          onChange={e => setDemo(d => ({ ...d, name: e.target.value }))}
                          placeholder="Rahul Sharma"
                          style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#e8e4dc', outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Work Email *</label>
                        <input
                          type="email" required value={demo.email}
                          onChange={e => setDemo(d => ({ ...d, email: e.target.value }))}
                          placeholder="you@company.com"
                          style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#e8e4dc', outline: 'none' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Company *</label>
                        <input
                          type="text" required value={demo.company}
                          onChange={e => setDemo(d => ({ ...d, company: e.target.value }))}
                          placeholder="PMC Firm / Developer"
                          style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#e8e4dc', outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Phone</label>
                        <input
                          type="tel" value={demo.phone}
                          onChange={e => setDemo(d => ({ ...d, phone: e.target.value }))}
                          placeholder="+91 98765 43210"
                          style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#e8e4dc', outline: 'none' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(232,228,220,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Anything specific you&apos;d like to see?</label>
                      <textarea
                        rows={3} value={demo.message}
                        onChange={e => setDemo(d => ({ ...d, message: e.target.value }))}
                        placeholder="e.g. payment governance, vendor milestone tracking, Viseron AI risk detection…"
                        style={{ width: '100%', boxSizing: 'border-box', background: '#0d0d11', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#e8e4dc', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                      />
                    </div>

                    {demoState === 'error' && (
                      <div style={{ background: 'rgba(224,96,80,0.1)', border: '1px solid rgba(224,96,80,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#e06050' }}>
                        {demoError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={demoState === 'sending'}
                      style={{
                        background: demoState === 'sending' ? 'rgba(196,163,90,0.5)' : '#c4a35a',
                        color: '#0d0d11', border: 'none', borderRadius: 12,
                        padding: '14px 28px', fontSize: 14, fontWeight: 700,
                        cursor: demoState === 'sending' ? 'not-allowed' : 'pointer',
                        transition: 'opacity 0.2s', marginTop: 4,
                      }}
                    >
                      {demoState === 'sending' ? 'Submitting…' : 'Request Demo →'}
                    </button>

                    <p style={{ fontSize: 11.5, color: 'rgba(232,228,220,0.25)', margin: 0, textAlign: 'center' }}>
                      No spam. We&apos;ll only contact you about your demo request.
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
