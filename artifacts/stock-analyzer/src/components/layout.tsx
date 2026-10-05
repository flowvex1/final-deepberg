import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { SearchBar } from "./search-bar";
import { useMode } from "@/hooks/use-mode";
import { TickerTape } from "./ticker-tape";
import { useQuery } from "@tanstack/react-query";
import {
  Flame, BarChart2, LineChart, Newspaper, Zap,
  Bookmark, GitCompare, Sparkles, Grid3x3,
  Radio, CalendarDays, Bitcoin, TrendingUp, ClipboardList,
  LayoutDashboard, HelpCircle, DollarSign,
  Menu, X,
} from "lucide-react";
import owlMascot from "/owl-mascot.png";

function DeepbergLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const fontSize = size === "sm" ? 15 : 18;
  return (
    <span
      style={{
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize,
        fontWeight: 300,
        color: "rgba(255,255,255,0.55)",
        letterSpacing: "0.12em",
        lineHeight: 1,
      }}
    >
      deep<strong style={{ fontWeight: 600, color: "#fff" }}>berg</strong>
    </span>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Vex sidebar quips (keyed by regime mood) ─────────────────── */
const VEX_QUIPS: Record<string, string[]> = {
  bullish: [
    "Bulls are running. Don't be late.",
    "Green across the board. I like it.",
    "Momentum is real. Stay long.",
    "Risk-on. The smart money is moving.",
    "Breakouts incoming. I'm watching.",
  ],
  cautious: [
    "Careful out there. Bears are lurking.",
    "Volatility is elevated. Size down.",
    "Mixed signals. I'd wait for clarity.",
    "Defensive plays look better right now.",
    "This isn't the time to be a hero.",
  ],
  chop: [
    "Hoot. Choppy day. Premium sellers win.",
    "No trend. Iron condors are your friend.",
    "Rangebound action. Don't chase.",
    "The market can't make up its mind.",
    "Low conviction either way. Stay nimble.",
  ],
  neutral: [
    "Scanning the tape. Stay sharp.",
    "Data looks mixed. Ask me anything.",
    "Market's thinking. So am I.",
    "No strong edge yet. Watch and wait.",
    "Quiet before something moves.",
  ],
};

function getVexMood(regime: any): string {
  const label: string = (regime?.regime ?? "").toUpperCase();
  if (label.includes("BULL") || label.includes("RISK-ON")) return "bullish";
  if (label.includes("CAUTION") || label.includes("BEAR") || label.includes("RISK-OFF")) return "cautious";
  if (label.includes("CHOP") || label.includes("MIXED") || label.includes("SIDEWAYS")) return "chop";
  return "neutral";
}

const MOOD_DOT: Record<string, string> = {
  bullish: "#4edea3",
  cautious: "#fbbf24",
  chop:     "#adc6ff",
  neutral:  "#94a3b8",
};

/* ── Vex Sidebar Widget ────────────────────────────────────────── */
function VexWidget() {
  const { data: regime } = useQuery<any>({
    queryKey: ["regime-sidebar"],
    queryFn:  () => fetch(`${BASE}/api/market-regime`).then(r => r.json()).catch(() => null),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const mood = getVexMood(regime);
  const dotColor = MOOD_DOT[mood];

  const quip = useMemo(() => {
    const pool = VEX_QUIPS[mood] ?? VEX_QUIPS.neutral;
    return pool[Math.floor(Math.random() * pool.length)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  return (
    <Link href="/ask">
      <div
        className="mx-3 mb-3 rounded-xl p-3 cursor-pointer group transition-all duration-200 hover:scale-[1.02]"
        style={{
                background: "rgba(21,32,49,0.55)",
          border: "1px solid rgba(216,227,251,0.08)",
        }}
      >
        <div className="flex items-start gap-2.5">
          {/* Owl avatar */}
          <div className="relative shrink-0">
            <div
              className="w-10 h-10 rounded-full overflow-hidden"
                  style={{ border: `1.5px solid ${dotColor}40`, background: "rgba(4,21,32,0.9)" }}
            >
              <img src={owlMascot} alt="Vex" className="w-full h-full object-cover" />
            </div>
            {/* Live mood dot */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
              style={{
                background: dotColor,
                borderColor: "#081425",
                boxShadow: `0 0 6px ${dotColor}`,
              }}
            />
          </div>

          {/* Speech bubble */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-black font-sans uppercase tracking-widest"
                style={{ color: dotColor }}>VEX</span>
              <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">· AI Copilot</span>
            </div>
            <div
              className="relative rounded-xl rounded-tl-none px-2.5 py-2"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${dotColor}25`,
              }}
            >
              <p className="text-[10px] text-slate-300 leading-relaxed font-['Inter'] italic">
                "{quip}"
              </p>
            </div>
            <p className="text-[8px] text-slate-600 font-mono mt-1.5 text-right uppercase tracking-wider group-hover:text-cyan/70 transition-colors">
              Ask Vex →
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

const TOPBAR_H = 64;   // px — h-16
const TICKER_H = 32;   // px — ticker tape
const SIDEBAR_W = 256; // px — w-64

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { mode, setMode } = useMode();
  const [mobileOpen, setMobileOpen] = useState(false);

  const switchMode = (next: "options" | "invest") => {
    setMode(next);
    navigate(next === "invest" ? "/market" : "/dashboard");
  };

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const optionsItems = [
    { href: "/dashboard",       label: "Dashboard",    icon: LayoutDashboard },
    { href: "/options",         label: "Flow",         icon: Flame },
    { href: "/iv-radar",        label: "IV Radar",     icon: BarChart2 },
    { href: "/chain",           label: "Chain Map",    icon: Grid3x3 },
    { href: "/options-signals", label: "Signals",        icon: Radio },
    { href: "/budget-screener", label: "Budget Screener", icon: DollarSign },
  ];

  const investItems = [
    { href: "/market",    label: "Market",       icon: LineChart },
    { href: "/news",      label: "News",         icon: Newspaper },
    { href: "/watchlist", label: "Watchlist",    icon: Bookmark },
    { href: "/compare",   label: "Compare",      icon: GitCompare },
    { href: "/signals",   label: "Signals",      icon: Radio },
    { href: "/recap",     label: "Daily Recap",  icon: CalendarDays },
    { href: "/ask",       label: "AI Copilot",   icon: Sparkles },
    { href: "/larp",      label: "Larp",         icon: Zap },
  ];

  const navItems = mode === "options" ? optionsItems : investItems;

  const isActive = (href: string) => {
    if (href === "/dashboard") return location === "/dashboard";
    if (href === "/options") return location === "/options" || location.startsWith("/options/");
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col dark" style={{ background: "#081425", color: "#d8e3fb" }}>

      {/* ── Ambient glow orbs (fixed, behind everything) ─────────── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div style={{
          position: "absolute", top: "8%", left: "18%",
          width: 700, height: 700,
          background: "rgba(0,220,229,0.07)",
          borderRadius: "50%",
          filter: "blur(120px)",
          transform: "translateX(-50%)",
        }} />
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 520, height: 520,
          background: "rgba(14,58,82,0.45)",
          borderRadius: "50%",
          filter: "blur(100px)",
        }} />
      </div>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6"
        style={{
          height: TOPBAR_H,
          background: "rgba(8, 20, 37, 0.88)",
          backdropFilter: "blur(60px)",
          WebkitBackdropFilter: "blur(60px)",
          borderBottom: "1px solid rgba(216,227,251,0.06)",
        }}
      >
        {/* Left: logo + mode pills */}
        <div className="flex items-center gap-5 shrink-0">
          <button
            className="md:hidden p-2 -ml-2 rounded-lg text-slate-300"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/dashboard" className="flex items-center hover:opacity-90 transition-opacity">
            <DeepbergLogo />
          </Link>

          {/* Mode switcher pills */}
          <div className="hidden md:flex items-center gap-0.5 p-0.5 rounded-xl" style={{ background: "rgba(216,227,251,0.04)", border: "1px solid rgba(216,227,251,0.08)" }}>
            <button
              onClick={() => switchMode("options")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all duration-200 font-sans ${
                mode === "options"
                  ? "text-[#003739] shadow-lg"
                  : "text-slate-500 hover:text-ice"
              }`}
              style={mode === "options" ? { background: "#00dce5", boxShadow: "0 0 18px rgba(0,220,229,0.28)" } : undefined}
            >
              <Flame className="h-3 w-3" />OPTIONS
            </button>
            <button
              onClick={() => switchMode("invest")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all duration-200 font-sans ${
                mode === "invest" && !location.startsWith("/crypto") && !location.startsWith("/paper")
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <TrendingUp className="h-3 w-3" />STOCKS
            </button>
            <button
              onClick={() => { setMode("invest"); navigate("/crypto"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all duration-200 font-sans ${
                location.startsWith("/crypto")
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Bitcoin className="h-3 w-3" />CRYPTO
            </button>
            <button
              onClick={() => { setMode("invest"); navigate("/paper"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all duration-200 font-sans ${
                location.startsWith("/paper")
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <ClipboardList className="h-3 w-3" />PAPER
            </button>
          </div>
        </div>

        {/* Center: DEEPBERG wordmark — stretches between nav and right controls */}
        <div className="hidden lg:flex flex-1 items-center justify-center pointer-events-none select-none px-6">
          <span
            className="font-mono font-black uppercase tracking-[0.35em] text-transparent bg-clip-text w-full text-center"
            style={{
              backgroundImage: "linear-gradient(90deg, rgba(0,220,229,0.08) 0%, rgba(216,227,251,0.55) 40%, rgba(0,220,229,0.45) 60%, rgba(0,220,229,0.08) 100%)",
              fontSize: "clamp(11px, 1.5vw, 18px)",
              letterSpacing: "0.45em",
            }}
          >
            DEEPBERG
          </span>
        </div>

        {/* Right: market live pill + search + alerts */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Market Live pill — from QUANTUM_AI reference */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(78,222,163,0.08)", border: "1px solid rgba(78,222,163,0.2)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">Market Live</span>
          </div>

          <div className="hidden lg:block w-64">
            <SearchBar />
          </div>
        </div>
      </header>

      {/* ── Ticker tape ───────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 z-40" style={{ top: TOPBAR_H }}>
        <TickerTape />
      </div>

      {/* ── Body: sidebar + content ──────────────────────────────────── */}
      <div className="flex" style={{ paddingTop: TOPBAR_H, minHeight: "100vh" }}>
        {mobileOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside
          className={`fixed left-0 z-40 flex flex-col transition-transform duration-200 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{
            top: TOPBAR_H,
            bottom: 0,
            width: SIDEBAR_W,
            background: "rgba(17, 28, 45, 0.97)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            borderRight: "1px solid rgba(216,227,251,0.06)",
          }}
        >
          {/* Logo block */}
          <div className="px-5 pt-5 pb-5 border-b border-white/5">
            <Link href="/dashboard" className="block">
              <DeepbergLogo size="sm" />
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] mt-2 ml-0.5" style={{ color: "rgba(216,227,251,0.28)" }}>Computational Depth</p>
            </Link>
          </div>

          {/* NEURAL-1 system status pill — from QUANT-GLASS reference */}
          <div className="px-4 pt-4 pb-2">
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
              style={{ background: "rgba(0,220,229,0.06)", border: "1px solid rgba(0,220,229,0.14)" }}
            >
              <div
                className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                style={{ boxShadow: "0 0 8px #4edea3" }}
              />
              <div>
                <p className="text-[10px] font-black font-sans uppercase tracking-widest leading-none" style={{ color: "#00dce5" }}>NEURAL-1</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest font-sans mt-0.5">System Active</p>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 pt-2 overflow-y-auto">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="relative flex items-center gap-3 px-6 py-3 text-[10px] font-sans font-bold uppercase tracking-widest transition-all duration-200 group"
                  style={active
                    ? { background: "rgba(0,220,229,0.07)", color: "#d8e3fb" }
                    : { color: "rgba(216,227,251,0.38)" }}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-[15%] w-[3px] h-[70%] rounded-r"
                      style={{ background: "#00dce5" }}
                    />
                  )}
                  <Icon className="h-4 w-4 shrink-0 transition-colors" style={{ color: active ? "#00dce5" : "rgba(216,227,251,0.28)" }} />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Vex persistent widget */}
          <div className="pt-2 border-t border-white/5">
            <VexWidget />
          </div>

          {/* Bottom section */}
          <div className="border-t border-white/5">
            <Link href="/" className="flex items-center gap-3 px-6 py-2.5 text-[10px] font-sans font-bold uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />
              <span>About</span>
            </Link>
            <div className="px-4 pb-4 pt-1">
              <p className="text-[9px] text-slate-700 font-mono text-center tracking-widest uppercase">DEEPBERG · v2.0</p>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────── */}
        <main
          className="flex-1 overflow-y-auto canvas-grid relative z-10 md:ml-64"
          style={{ paddingTop: TICKER_H }}
        >
          <div className="px-6 py-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
