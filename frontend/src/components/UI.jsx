import { useEffect, useRef, useState, useId } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Eye,
  EyeOff,
  Wallet,
  LoaderCircle,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { demoMode, checkHealth } from "../services/api";
import { money } from "../data/demo";
import { useApp } from '../context/useApp';
import { moneyCents } from '../services/liveData';
export function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-icon">
        <Wallet size={23} />
      </span>
      PayNet<span className="logo-dot">.</span>
    </Link>
  );
}
export function LoadingSpinner() {
  return <LoaderCircle className="spin" aria-label="Loading" />;
}
export function EmptyState({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageHeader({
  eyebrow = "YOUR MONEY, CONNECTED",
  title,
  children,
  action,
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function StatCard({ title, value, icon: Icon, caption, tone = "blue" }) {
  return (
    <section className={`card stat stat-${tone}`}>
      <div className={`stat-icon ${tone}`}>
        <Icon size={21} />
      </div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{caption || "Sample data · November 2026"}</small>
    </section>
  );
}
export function BalanceCard({ user }) {
  return (
    <section className="balance-card">
      <div className="flex justify-between items-center">
        <span>
          Available balance <span className="mini-pill">{user.real ? 'VIRTUAL' : 'DEMO'}</span>
        </span>
        <Wallet />
      </div>
      <h2>{user.real ? moneyCents(user.balanceCents) : money(user.balance)}</h2>
      <span>PayNet virtual wallet · LKR</span>
      <div className="balance-bottom">
        <span>{user.wallet}</span>
        <ShieldCheck size={22} />
      </div>
      <div className="balance-actions">
        <Link to="/send-money">
          <ArrowUpRight size={17} /> Send money
        </Link>
        <Link to="/receive-money">
          <ArrowDownLeft size={17} /> Receive
        </Link>
      </div>
    </section>
  );
}
export function TransactionStatusBadge({ status }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {status}
    </span>
  );
}
export function ConfirmModal({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  busy = false,
}) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
        {onConfirm && (
          <button className="button" disabled={busy} onClick={onConfirm}>
            {busy ? <LoadingSpinner /> : confirmLabel}
          </button>
        )}
      </div>
    </dialog>
  );
}
export function FormInput({ label, id, type = "text", error, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          {...props}
          id={id}
          type={type === "password" && visible ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {type === "password" && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <small className="error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
export function ProtectedRoute({ children }) {
  const { user, authLoading } = useApp();
  if (authLoading) return <div className="empty" role="status">Loading your session...</div>;
  return demoMode || user ? children : <Navigate to="/login" replace />;
}
export function AdminRoute({ children }) {
  const { user, authLoading } = useApp();
  if (authLoading) return <div className="empty" role="status">Loading your session...</div>;
  return demoMode || user?.role === 'admin' ? children : <Navigate to={user ? '/dashboard' : '/login'} replace />;
}
export function HealthPanel() {
  const [status, setStatus] = useState("Not checked"),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const data = await checkHealth();
      setStatus(
        data.success === true
          ? data.message
          : "Backend reported an unhealthy state",
      );
    } catch (e) {
      setStatus(
        e.message.includes("fetch")
          ? "Backend unavailable. Start the backend on the configured API URL."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="health">
      <div>
        <strong>Backend connection</strong>
        <p role="status">{status}</p>
      </div>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={check}
      >
        {busy ? <LoadingSpinner /> : "Check connection"}
      </button>
    </div>
  );
}
export function NotificationItem({ item, onRead }) {
  return (
    <article className={`notification ${item.read ? "" : "unread"}`}>
      <span className={`transaction-icon ${item.type}`}>
        {item.type === "incoming" ? <ArrowDownLeft /> : <ArrowUpRight />}
      </span>
      <div>
        <strong>
          {item.real ? item.title : item.type === "incoming"
            ? "Sample payment received"
            : "Sample payment sent"}
        </strong>
        <p>
          {item.real ? item.message : `${money(item.amount)} · ${item.name}`}
        </p>
        <small>{item.date} · {item.real ? 'Virtual account notification' : 'Demo notification'}</small>
      </div>
      {!item.read && (
        <button className="text-button" onClick={onRead}>
          Mark read
        </button>
      )}
    </article>
  );
}
export function TransactionTable({ rows, compact = false }) {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="transaction-table">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Date</th>
              <th>Status</th>
              <th className="amount-cell">Amount</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="person">
                    <span className={`transaction-icon ${t.type}`}>
                      {t.type === "incoming" ? (
                        <ArrowDownLeft size={19} />
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{compact ? t.description : t.type}</small>
                    </span>
                  </div>
                </td>
                <td>{t.date}</td>
                <td>
                  <TransactionStatusBadge status={t.status} />
                </td>
                <td
                  className={`amount-cell ${t.type === "incoming" ? "positive" : ""}`}
                >
                  {t.type === "incoming" ? "+" : "-"}
                  {t.real ? moneyCents(t.amountCents) : money(t.amount)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${t.id}`}
                    onClick={() => setSelected(t)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <EmptyState title="No matching transactions">
          Try a different search or filter.
        </EmptyState>
      )}
      {selected && (
        <ConfirmModal
          title="Transaction details"
          onClose={() => setSelected(null)}
        >
          <div className="notice">
            {selected.real ? 'Recorded virtual transaction. No bank funds are involved.' : 'Sample transaction — no real payment occurred.'}
          </div>
          <dl className="details">
            {Object.entries(selected).filter(([k]) => k !== 'real').map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{k === "amount" ? money(v) : v}</dd>
              </div>
            ))}
          </dl>
        </ConfirmModal>
      )}
    </>
  );
}

