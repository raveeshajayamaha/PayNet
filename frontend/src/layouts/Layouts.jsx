import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Bell,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  ChevronRight,
  CircleHelp,
} from "lucide-react";
import { Logo } from "../components/UI";
import { useApp } from "../context/useApp";
import { demoMode } from "../services/api";
const navigation = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/send-money", "Send money", ArrowUpRight],
  ["/receive-money", "Receive money", ArrowDownLeft],
  ["/transactions", "Transactions", ArrowLeftRight],
  ["/notifications", "Notifications", Bell],
  ["/profile", "Profile & settings", Settings],
];
export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-nav">
      <div className="container nav-inner">
        <Logo />
        <button
          className="icon-button mobile-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          className={open ? "public-links open" : "public-links"}
          onClick={() => setOpen(false)}
        >
          <a href="/#">Home</a>
          <a href="/#features">Features</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#about">About</a>
          <Link to="/login">Log in</Link>
          <Link className="button small" to="/register">
            Get started <ArrowUpRight size={16} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Logo />
            <p>
              A simpler way to move money.
              <br />A smarter way to stay connected.
            </p>
          </div>
          <div>
            <strong>Explore PayNet</strong>
            <Link to="/dashboard">{demoMode ? 'Demo dashboard' : 'Your dashboard'}</Link>
            <a href="/#features">Our features</a>
            <a href="/#how-it-works">How it works</a>
          </div>
          <div>
            <strong>Your account</strong>
            <Link to="/login">Log in</Link>
            <Link to="/register">Create an account</Link>
            <Link to="/admin">{demoMode ? 'Admin demo' : 'Admin workspace'}</Link>
          </div>
          <div>
            <strong>Built for learning</strong>
            <p>
              University Network Programming project.
              <br />
              Virtual money. Real possibilities.
            </p>
            <a
              href="https://unsplash.com/license"
              target="_blank"
              rel="noreferrer"
            >
              Photography: Unsplash
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 PayNet. A university demonstration.</span>
          <span>
            Designed for connection <span className="cyan">&#8599;</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
export function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <Footer />
    </>
  );
}
export function AuthLayout() {
  const register = useLocation().pathname === "/register";
  return (
    <main className={`auth-layout ${register ? "auth-register" : "auth-login"}`}>
      <section className="auth-photo">
        <img
          className="auth-background"
          src={register ? "/images/hero.jpg" : "/images/city-night.jpg"}
          alt={register ? "A professional using a smartphone" : "Illuminated city skyline at night"}
          fetchPriority="high"
        />
        <div className="auth-photo-overlay" aria-hidden="true" />
        <Logo />
        <div>
          <span className="eyebrow">A LITTLE MORE CONNECTED</span>
          <h2>
            Your next chapter.
            <br />
            In good company.
          </h2>
          <p>
            From everyday moments to bigger plans, make moving money feel
            effortless.
          </p>
          <span className="glass-tag">
            <ShieldCheck size={19} /> A virtual payments learning experience
          </span>
        </div>
        <small>PayNet · Network Programming Project</small>
      </section>
      <section className="auth-form">
        <Link to="/" className="back-link">
          Back to home
        </Link>
        <Outlet />
      </section>
    </main>
  );
}
export function Sidebar({ admin = false, open, close }) {
  const { logout } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  async function signOut() {
    try { await logout(); navigate('/login', { replace: true }); }
    catch (failure) { setError(failure.message); }
  }
  return (
    <>
      <button
        className={open ? "sidebar-shade visible" : "sidebar-shade"}
        aria-label="Close navigation"
        onClick={close}
      />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Logo />
        <div className="workspace-label">
          {admin ? "ADMIN WORKSPACE" : "PERSONAL WORKSPACE"}
        </div>
        <nav>
          {(admin
            ? [["/admin", "Admin overview", ShieldCheck], ...navigation]
            : navigation
          ).map(([path, label, Icon]) => (
            <NavLink key={path} to={path} onClick={close}>
              <Icon size={19} />
              {label}
              {label === "Overview" && <ChevronRight size={15} />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <CircleHelp size={22} />
            <strong>A little guidance?</strong>
            <p>Explore how PayNet works.</p>
            <Link to="/#how-it-works">
              Visit the guide <ArrowUpRight size={15} />
            </Link>
          </div>
          {demoMode ? <Link className="exit-link" to="/">
            <LogOut size={18} /> Exit preview
          </Link> : <button className="exit-link" onClick={signOut}><LogOut size={18} /> Log out</button>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </aside>
    </>
  );
}
export function Topbar({ onMenu, admin }) {
  const { user, notifications, unreadCount } = useApp();
  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button
          className="icon-button mobile-toggle"
          aria-label="Open sidebar"
          onClick={onMenu}
        >
          <Menu />
        </button>
        <span className="breadcrumb">
          {admin ? "Administration" : "My workspace"} <ChevronRight size={14} />{" "}
          PayNet
        </span>
      </div>
      <div className="topbar-right">
        <span className="demo-chip">
          {demoMode ? "Demo workspace" : "Virtual account"}
        </span>
        <Link
          className="icon-button notification-link"
          to="/notifications"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {(demoMode ? notifications.some((n) => !n.read) : unreadCount > 0) && <i />}
        </Link>
        <Link className="user-menu" to="/profile">
          <span className="avatar">
            {user.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>Personal account</small>
          </span>
        </Link>
      </div>
    </header>
  );
}
export function DashboardLayout({ admin = false }) {
  const { dataError, refresh, networkStatus, reconnectPayments } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="app-shell">
      <Sidebar admin={admin} open={open} close={() => setOpen(false)} />
      <div className="workspace">
        <Topbar admin={admin} onMenu={() => setOpen(true)} />
        <main className="workspace-content" data-page={location.pathname} key={location.pathname}>
          <div className="demo-banner">
            <span className="status-dot" /> {demoMode ? 'Demo preview · All balances, transactions and analytics are sample data. No real money moves.' : `Virtual account · Server-confirmed activity · Live updates ${networkStatus}. No bank funds are involved.`}
          </div>
          {!demoMode && dataError && <div className="notice" role="alert">{dataError} <button className="text-button" onClick={() => refresh()}>Retry</button></div>}
          {!demoMode && ['blocked', 'disconnected'].includes(networkStatus) && <p className="notice">
            Live updates are paused. Persisted data can still be refreshed through the authenticated API.
            <button className="text-button" onClick={reconnectPayments}>Reconnect live updates</button>
          </p>}
          <Outlet />
        </main>
        <div className="workspace-footer">
          <span>PayNet · Your money, connected.</span>
          <span>University project · Virtual payments only</span>
        </div>
      </div>
    </div>
  );
}
export function AdminLayout() {
  return <DashboardLayout admin />;
}

