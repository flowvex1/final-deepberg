import { useEffect, useRef } from 'react'
import { Link } from 'wouter'

export default function LandingPage() {
  const bgRef  = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => {
      const y        = window.scrollY
      const progress = y / (document.documentElement.scrollHeight - window.innerHeight)
      if (bgRef.current)  bgRef.current.style.backgroundPositionY  = `${progress * 100}%`
      if (navRef.current) navRef.current.setAttribute('data-light', y > 80 ? '1' : '0')
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <style>{`
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        .land-body {
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          background: #020c14;
          color: #fff;
          -webkit-font-smoothing: antialiased;
        }

        /* ── FIXED BG ── */
        .land-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background-image: url('/hero.jpg');
          background-size: cover;
          background-position: center top;
          pointer-events: none;
        }

        /* ── NAV ── */
        .land-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 48px;
          transition: background 0.4s, backdrop-filter 0.4s;
        }
        .land-nav[data-light="1"] {
          background: rgba(8, 20, 37, 0.92);
          backdrop-filter: blur(20px);
        }

        .land-logo {
          font-size: 13px;
          font-weight: 300;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          letter-spacing: 0.12em;
        }
        .land-logo strong { font-weight: 600; color: #fff; }

        .land-nav-links {
          display: flex;
          align-items: center;
          gap: 28px;
          list-style: none;
        }
        .land-nav-links a {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: color 0.2s;
        }
        .land-nav-links a:hover { color: #fff; }
        .land-pill {
          background: #fff;
          color: #081425 !important;
          border-radius: 75px;
          padding: 7px 20px;
          font-size: 11px;
          font-weight: 500;
        }
        .land-pill:hover { opacity: 0.85; }

        /* sections sit above fixed bg */
        .land-nav, .land-hero, .land-waterline,
        .land-section, .land-statement, .land-footer {
          position: relative;
          z-index: 1;
        }

        /* ── HERO ── */
        .land-hero {
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          overflow: hidden;
        }
        .land-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.65) 100%);
          pointer-events: none;
        }
        .land-hero > * { position: relative; z-index: 1; }

        .land-eyebrow {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 36px;
        }
        .land-title {
          font-size: clamp(64px, 12vw, 180px);
          font-weight: 300;
          color: #fff;
          line-height: 0.82;
          letter-spacing: -0.02em;
        }
        .land-sub {
          font-size: 17px;
          color: rgba(255,255,255,0.55);
          line-height: 1.5;
          margin-top: 48px;
          max-width: 440px;
        }
        .land-cta {
          margin-top: 48px;
          display: flex;
          gap: 14px;
        }
        .land-btn-white {
          display: inline-block;
          background: #fff;
          color: #081425;
          border-radius: 75px;
          padding: 12px 32px;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: opacity 0.2s;
        }
        .land-btn-white:hover { opacity: 0.85; }
        .land-btn-ghost {
          display: inline-block;
          background: transparent;
          color: rgba(255,255,255,0.65);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 75px;
          padding: 12px 32px;
          font-size: 13px;
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .land-btn-ghost:hover { color: #fff; border-color: rgba(255,255,255,0.5); }

        .land-scroll-hint {
          position: absolute;
          bottom: 40px; left: 48px;
          font-size: 9px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          z-index: 1;
        }

        /* ── WATERLINE ── */
        .land-waterline {
          height: 4px;
          background: linear-gradient(90deg, transparent, rgba(100,180,220,0.6) 20%, rgba(160,210,240,0.9) 50%, rgba(100,180,220,0.6) 80%, transparent);
          position: relative;
        }
        .land-waterline::before {
          content: 'SURFACE';
          position: absolute;
          left: 48px; top: 50%;
          transform: translateY(-50%);
          font-size: 9px;
          color: rgba(100,180,220,0.7);
          letter-spacing: 0.2em;
        }
        .land-waterline::after {
          content: '↓  BELOW THE SURFACE';
          position: absolute;
          right: 48px; top: 50%;
          transform: translateY(-50%);
          font-size: 9px;
          color: rgba(100,180,220,0.7);
          letter-spacing: 0.2em;
        }

        /* ── SECTIONS ── */
        .land-section { position: relative; overflow: hidden; }

        .land-s0  { background: rgba(18,45,65,0.72); }
        .land-s1  { background: rgba(14,58,82,0.88); }
        .land-s2  { background: rgba(7,32,51,0.93); }
        .land-s3  { background: rgba(4,21,32,0.96); }
        .land-s4  { background: rgba(2,12,20,0.99); }

        .land-inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 120px 48px 120px 100px;
          position: relative;
          z-index: 1;
        }

        .land-depth-meter {
          position: absolute;
          left: 48px; top: 0; bottom: 0;
          display: flex; flex-direction: column; justify-content: center;
        }
        .land-depth-label {
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          color: rgba(255,255,255,0.18);
        }

        .land-zone-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(160,210,240,0.55);
          margin-bottom: 48px;
        }
        .land-zone-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(160,210,240,0.45);
          flex-shrink: 0;
        }

        .land-heading {
          font-size: clamp(42px, 5.5vw, 78px);
          font-weight: 300;
          line-height: 1.1;
          color: #fff;
          margin-bottom: 32px;
        }
        .land-body-text {
          font-size: 18px;
          line-height: 1.58;
          color: rgba(255,255,255,0.5);
          max-width: 520px;
        }

        /* ticker strip */
        .land-ticker-strip {
          border-top: 1px solid rgba(255,255,255,0.08);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: grid;
          grid-template-columns: repeat(4,1fr);
          margin-top: 80px;
        }
        .land-ticker-cell {
          padding: 36px 40px;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .land-ticker-cell:last-child { border-right: none; }
        .land-ticker-sym   { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; margin-bottom: 6px; }
        .land-ticker-price { font-size: 36px; font-weight: 300; color: #fff; line-height: 1; }
        .land-ticker-chg   { font-size: 12px; margin-top: 6px; }
        .land-up   { color: #4edea3; }
        .land-down { color: #ffb4ab; }

        /* flow feed */
        .land-feed { margin-top: 64px; display: flex; flex-direction: column; gap: 2px; }
        .land-row {
          display: grid;
          align-items: center;
          padding: 16px 24px;
          font-size: 13px;
          gap: 16px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.6);
        }
        .land-row-hd {
          font-size: 10px !important;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.2) !important;
          padding-bottom: 8px;
          background: transparent !important;
        }
        .land-sym  { font-weight: 600; color: #fff; letter-spacing: 0.06em; }
        .land-call { color: #4edea3; }
        .land-put  { color: #ffb4ab; }

        /* data cards */
        .land-cards { display: grid; gap: 2px; margin-top: 64px; }
        .land-cards-3 { grid-template-columns: repeat(3,1fr); }
        .land-cards-2 { grid-template-columns: 1fr 1fr; }
        .land-card {
          padding: 36px 32px;
          background: rgba(255,255,255,0.05);
        }
        .land-card-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 16px; }
        .land-card-value { font-size: 42px; font-weight: 300; color: #fff; line-height: 1; }
        .land-card-sub   { font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 10px; }
        .land-card-tag   {
          display: inline-block; font-size: 10px; letter-spacing: 0.1em;
          text-transform: uppercase; border-radius: 75px;
          padding: 3px 12px; margin-top: 14px;
          border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.4);
        }

        /* marquee */
        .land-marquee { overflow: hidden; border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 0; margin-top: 80px; }
        .land-marquee-track { display: flex; gap: 48px; animation: lmarquee 24s linear infinite; white-space: nowrap; }
        .land-marquee-track span { font-size: 10px; color: rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.14em; flex-shrink: 0; }
        @keyframes lmarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* statement */
        .land-statement {
          background: #020c14;
          padding: 160px 48px;
          text-align: center;
          position: relative; overflow: hidden;
        }
        .land-statement::before {
          content: '';
          position: absolute;
          width: 800px; height: 400px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(10,60,100,0.4), transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%,-50%);
          pointer-events: none;
        }
        .land-statement-text {
          font-size: clamp(42px, 5.5vw, 78px);
          font-weight: 300;
          color: #fff;
          line-height: 1.12;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
        }
        .land-statement-text em { color: rgba(255,255,255,0.25); font-style: normal; }

        /* footer */
        .land-footer { background: #181818; padding: 80px 48px 48px; position: relative; z-index: 1; }
        .land-footer-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 80px; }
        .land-footer-logo { font-size: 45px; font-weight: 300; color: #fff; line-height: 1.1; }
        .land-footer-logo small { display: block; font-size: 11px; font-weight: 400; color: #636363; letter-spacing: 0.1em; margin-top: 8px; text-transform: uppercase; }
        .land-footer-cols { display: flex; gap: 80px; }
        .land-footer-col-label { font-size: 10px; color: #636363; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 20px; }
        .land-footer-links { list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .land-footer-links a, .land-footer-links span { font-size: 14px; color: #9a9a9a; text-decoration: none; }
        .land-footer-links a:hover { color: #fff; }
        .land-footer-bottom { border-top: 1px solid #636363; padding-top: 32px; display: flex; justify-content: space-between; }
        .land-footer-copy { font-size: 11px; color: #636363; letter-spacing: 0.06em; }

        @media (max-width: 720px) {
          .land-nav { padding: 20px; }
          .land-nav-links { gap: 10px; }
          .land-nav-links li:not(:last-child) { display: none; }
          .land-hero { padding: 0 20px; }
          .land-title { font-size: clamp(54px, 18vw, 90px); }
          .land-sub { font-size: 15px; margin-top: 32px; }
          .land-cta { flex-direction: column; width: 100%; max-width: 280px; }
          .land-scroll-hint { left: 20px; bottom: 20px; }
          .land-inner { padding: 80px 20px; }
          .land-depth-meter { display: none; }
          .land-ticker-strip, .land-cards-3, .land-cards-2 { grid-template-columns: 1fr; }
          .land-ticker-cell { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
          .land-row { overflow-x: auto; }
          .land-footer { padding: 64px 20px 32px; }
          .land-footer-top, .land-footer-bottom { flex-direction: column; gap: 32px; }
          .land-footer-cols { flex-wrap: wrap; gap: 36px; }
        }
      `}</style>

      <div className="land-body">
        {/* fixed iceberg bg */}
        <div className="land-bg" ref={bgRef} />

        {/* nav */}
        <nav className="land-nav" ref={navRef}>
          <span className="land-logo">deep<strong>berg</strong></span>
          <ul className="land-nav-links">
            <li><a href="#surface">Surface</a></li>
            <li><a href="#flow">Flow</a></li>
            <li><a href="#darkpool">Dark Pool</a></li>
            <li><a href="#congress">Congress</a></li>
            <li><Link href="/dashboard" className="land-pill">Get Access</Link></li>
          </ul>
        </nav>

        {/* hero */}
        <section className="land-hero">
          <p className="land-eyebrow">Market Intelligence Platform</p>
          <h1 className="land-title">See what<br />lies beneath.</h1>
          <p className="land-sub">Most traders see the surface. We show you the entire iceberg — options flow, dark pool prints, and the moves institutions make before the market notices.</p>
          <div className="land-cta">
            <Link href="/dashboard" className="land-btn-white">Start for free</Link>
            <a href="#surface" className="land-btn-ghost">Explore the depths</a>
          </div>
          <div className="land-scroll-hint">Scroll to dive deeper</div>
        </section>

        {/* waterline */}
        <div className="land-waterline" />

        {/* level 0 — surface */}
        <section className="land-section land-s0" id="surface">
          <div className="land-inner" style={{ paddingLeft: 48 }}>
            <div className="land-zone-label"><span className="land-zone-dot" />Level 0 — Surface</div>
            <h2 className="land-heading">What everyone<br />already knows.</h2>
            <p className="land-body-text">Price, volume, basic technicals. The public layer — available to any trader with a brokerage account. Necessary, but not sufficient.</p>
          </div>
          <div className="land-ticker-strip">
            {[
              { sym: 'AAPL',  price: '$214.32', chg: '+1.84 (+0.87%)', up: true  },
              { sym: 'NVDA',  price: '$138.07', chg: '+4.12 (+3.07%)', up: true  },
              { sym: 'TSLA',  price: '$248.90', chg: '−3.22 (−1.28%)', up: false },
              { sym: 'SPY',   price: '$542.18', chg: '+2.06 (+0.38%)', up: true  },
            ].map(t => (
              <div key={t.sym} className="land-ticker-cell">
                <div className="land-ticker-sym">{t.sym}</div>
                <div className="land-ticker-price">{t.price}</div>
                <div className={`land-ticker-chg ${t.up ? 'land-up' : 'land-down'}`}>{t.chg}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="land-waterline" style={{ background: 'linear-gradient(90deg, transparent, rgba(14,58,82,0.8) 20%, rgba(14,58,82,1) 50%, rgba(14,58,82,0.8) 80%, transparent)' }} />

        {/* level 1 — options flow */}
        <section className="land-section land-s1" id="flow">
          <div className="land-depth-meter"><span className="land-depth-label">Depth 1 — Options Flow</span></div>
          <div className="land-inner">
            <div className="land-zone-label"><span className="land-zone-dot" />Level 1 — Options Flow</div>
            <h2 className="land-heading">Follow the<br />smart money.</h2>
            <p className="land-body-text">Large options sweeps, unusual call/put ratios, and block trades — the signals that consistently precede major moves.</p>
            <div className="land-feed">
              {[
                { cols: '80px 1fr 120px 120px 80px', header: true,  cells: ['Ticker','Strike / Exp','Premium','Type','Sentiment'] },
                { cols: '80px 1fr 120px 120px 80px', sym: 'NVDA',  strike: '$150C 07/19', prem: '$4.2M', type: 'CALL SWEEP', typeClass: 'land-call', sent: 'Bullish',  sentClass: 'land-up'   },
                { cols: '80px 1fr 120px 120px 80px', sym: 'SPY',   strike: '$540P 07/12', prem: '$2.8M', type: 'PUT SWEEP',  typeClass: 'land-put',  sent: 'Bearish', sentClass: 'land-down' },
                { cols: '80px 1fr 120px 120px 80px', sym: 'AAPL',  strike: '$220C 08/16', prem: '$1.9M', type: 'CALL BLOCK', typeClass: 'land-call', sent: 'Bullish',  sentClass: 'land-up'   },
                { cols: '80px 1fr 120px 120px 80px', sym: 'TSLA',  strike: '$240P 07/26', prem: '$3.1M', type: 'PUT SWEEP',  typeClass: 'land-put',  sent: 'Bearish', sentClass: 'land-down' },
                { cols: '80px 1fr 120px 120px 80px', sym: 'META',  strike: '$530C 09/20', prem: '$5.6M', type: 'CALL SWEEP', typeClass: 'land-call', sent: 'Bullish',  sentClass: 'land-up'   },
              ].map((r, i) => r.header ? (
                <div key={i} className="land-row land-row-hd" style={{ gridTemplateColumns: r.cols }}>
                  {r.cells!.map(c => <span key={c} className={c === 'Ticker' ? 'land-sym' : ''}>{c}</span>)}
                </div>
              ) : (
                <div key={i} className="land-row" style={{ gridTemplateColumns: r.cols }}>
                  <span className="land-sym">{r.sym}</span>
                  <span>{r.strike}</span>
                  <span>{r.prem}</span>
                  <span className={r.typeClass}>{r.type}</span>
                  <span className={r.sentClass}>{r.sent}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="land-marquee">
            <div className="land-marquee-track">
              {['Options Sweep','·','Call Block','·','Put Sweep','·','Unusual Volume','·','Open Interest','·','IV Spike','·',
                'Options Sweep','·','Call Block','·','Put Sweep','·','Unusual Volume','·','Open Interest','·','IV Spike','·'].map((t,i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* level 2 — dark pool */}
        <section className="land-section land-s2" id="darkpool">
          <div className="land-depth-meter"><span className="land-depth-label">Depth 2 — Dark Pool</span></div>
          <div className="land-inner">
            <div className="land-zone-label"><span className="land-zone-dot" />Level 2 — Dark Pool</div>
            <h2 className="land-heading">Off-exchange.<br />Off-radar.<br />On our feed.</h2>
            <p className="land-body-text">Dark pool prints are large block trades executed off public exchanges. Institutions use them to hide their hand. We surface every print.</p>
            <div className="land-cards land-cards-3">
              {[
                { label: 'Total Dark Pool Volume Today', value: '$38.4B', sub: 'Across 4,812 prints',           tag: 'Real-time'  },
                { label: 'Largest Single Print',         value: '$920M',  sub: 'MSFT — 2.4M shares @ $384',    tag: '09:47 EST'  },
                { label: 'Most Active Ticker',           value: 'NVDA',   sub: '$4.1B in dark pool today',      tag: 'Unusual'    },
              ].map(c => (
                <div key={c.label} className="land-card">
                  <div className="land-card-label">{c.label}</div>
                  <div className="land-card-value">{c.value}</div>
                  <div className="land-card-sub">{c.sub}</div>
                  <span className="land-card-tag">{c.tag}</span>
                </div>
              ))}
            </div>
            <div className="land-feed" style={{ marginTop: 48 }}>
              {[
                { cols: '80px 1fr 140px 120px 80px', header: true, cells: ['Ticker','Exchange / Time','Volume','Notional','Signal'] },
                { cols: '80px 1fr 140px 120px 80px', sym: 'MSFT', b: 'FINRA / 09:47', c: '2,400,000', d: '$921.6M', sig: '↑', sigC: 'land-up'   },
                { cols: '80px 1fr 140px 120px 80px', sym: 'NVDA', b: 'FINRA / 10:12', c: '8,200,000', d: '$1.13B',  sig: '↑', sigC: 'land-up'   },
                { cols: '80px 1fr 140px 120px 80px', sym: 'SPY',  b: 'MEMX / 11:03',  c: '14,500,000',d: '$7.86B', sig: '—', sigC: ''           },
                { cols: '80px 1fr 140px 120px 80px', sym: 'TSLA', b: 'FINRA / 11:44', c: '3,100,000', d: '$771.6M',sig: '↓', sigC: 'land-down'  },
              ].map((r, i) => r.header ? (
                <div key={i} className="land-row land-row-hd" style={{ gridTemplateColumns: r.cols }}>
                  {r.cells!.map(c => <span key={c} className={c === 'Ticker' ? 'land-sym' : ''}>{c}</span>)}
                </div>
              ) : (
                <div key={i} className="land-row" style={{ gridTemplateColumns: r.cols }}>
                  <span className="land-sym">{r.sym}</span><span>{r.b}</span><span>{r.c}</span><span>{r.d}</span>
                  <span className={r.sigC}>{r.sig}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* level 3 — institutional */}
        <section className="land-section land-s3">
          <div className="land-depth-meter"><span className="land-depth-label">Depth 3 — Institutional</span></div>
          <div className="land-inner">
            <div className="land-zone-label"><span className="land-zone-dot" />Level 3 — Institutional Holdings</div>
            <h2 className="land-heading">What the big<br />funds own.</h2>
            <p className="land-body-text">13F filings, fund allocation changes, and institutional ownership shifts — parsed and surfaced as soon as they hit EDGAR.</p>
            <div className="land-cards land-cards-2">
              <div className="land-card">
                <div className="land-card-label">Latest 13F — Berkshire Hathaway</div>
                <div className="land-card-value" style={{ fontSize: 30, lineHeight: 1.3 }}>+$4.2B AAPL<br />+$1.8B OXY<br />−$2.1B HPQ</div>
                <div className="land-card-sub">Filed 2024-Q1 · Parsed 14 minutes ago</div>
                <span className="land-card-tag">13F Filing</span>
              </div>
              <div className="land-card">
                <div className="land-card-label">Most Bought by Institutions (30d)</div>
                <div className="land-card-value" style={{ fontSize: 30, lineHeight: 1.3 }}>NVDA<br />META<br />AMZN</div>
                <div className="land-card-sub">Based on 1,240 13F filings this quarter</div>
                <span className="land-card-tag">Aggregated</span>
              </div>
            </div>
          </div>
        </section>

        {/* level 4 — congress */}
        <section className="land-section land-s4" id="congress">
          <div className="land-depth-meter"><span className="land-depth-label">Depth 4 — Abyss</span></div>
          <div className="land-inner">
            <div className="land-zone-label"><span className="land-zone-dot" />Level 4 — Congressional &amp; Insider Trades</div>
            <h2 className="land-heading">The trades<br />they hoped<br />you&apos;d miss.</h2>
            <p className="land-body-text">STOCK Act disclosures, Form 4 insider filings, and executive equity moves — all parsed, timestamped, and cross-referenced with upcoming legislation.</p>
            <div className="land-feed" style={{ marginTop: 64 }}>
              {[
                { cols: '160px 1fr 120px 120px 100px', header: true, cells: ['Name','Ticker / Type','Amount','Filed','Source'] },
                { cols: '160px 1fr 120px 120px 100px', sym: 'N. Pelosi', b: 'NVDA — Call Options', c: '$5M+',   d: '2 days ago',  e: 'STOCK Act', cC: 'land-up'   },
                { cols: '160px 1fr 120px 120px 100px', sym: 'D. Issa',   b: 'MSFT — Purchase',    c: '$250K',  d: '4 days ago',  e: 'STOCK Act', cC: 'land-up'   },
                { cols: '160px 1fr 120px 120px 100px', sym: 'E. Musk',   b: 'TSLA — Sale',        c: '$3.6B',  d: '1 week ago',  e: 'Form 4',    cC: 'land-down' },
                { cols: '160px 1fr 120px 120px 100px', sym: 'T. Cook',   b: 'AAPL — Sale',        c: '$41.5M', d: '2 weeks ago', e: 'Form 4',    cC: 'land-down' },
              ].map((r, i) => r.header ? (
                <div key={i} className="land-row land-row-hd" style={{ gridTemplateColumns: r.cols }}>
                  {r.cells!.map(c => <span key={c} className={c === 'Name' ? 'land-sym' : ''}>{c}</span>)}
                </div>
              ) : (
                <div key={i} className="land-row" style={{ gridTemplateColumns: r.cols }}>
                  <span className="land-sym" style={{ fontSize: 12 }}>{r.sym}</span>
                  <span>{r.b}</span><span className={r.cC}>{r.c}</span><span>{r.d}</span><span>{r.e}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* depth statement */}
        <div className="land-statement">
          <p className="land-statement-text">
            <em>Most traders see the tip.</em><br />
            You&apos;ll see the whole iceberg.
          </p>
        </div>

        {/* cta */}
        <div style={{ background: '#020c14', padding: '80px 48px 120px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>
            Ready to go deeper?
          </p>
          <h2 style={{ fontSize: 'clamp(48px, 7vw, 100px)', fontWeight: 300, color: '#fff', lineHeight: 0.9, marginBottom: 48 }}>
            See what lies<br /><em style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'normal' }}>beneath.</em>
          </h2>
          <Link href="/dashboard" className="land-btn-white" style={{ fontSize: 14, padding: '14px 40px' }}>
            Enter Deepberg
          </Link>
        </div>

        {/* footer */}
        <footer className="land-footer">
          <div className="land-footer-top">
            <div className="land-footer-logo">deep<strong style={{ fontWeight: 600 }}>berg</strong><small>Market Intelligence</small></div>
            <div className="land-footer-cols">
              {[
                { label: 'Product', links: ['Options Flow','Dark Pool','Congressional','Screener'] },
                { label: 'Company', links: ['About','Blog','Careers'] },
                { label: 'Legal',   links: ['Privacy','Terms','Disclaimer'] },
              ].map(col => (
                <div key={col.label}>
                  <div className="land-footer-col-label">{col.label}</div>
                  <ul className="land-footer-links">
                    {col.links.map(l => <li key={l}><span>{l}</span></li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="land-footer-bottom">
            <span className="land-footer-copy">© 2025 Deepberg. Not financial advice.</span>
            <span className="land-footer-copy">Made with Inter &amp; obsession.</span>
          </div>
        </footer>
      </div>
    </>
  )
}
