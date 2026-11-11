import { useState } from "react";
import { Link } from "react-router-dom";
import { useRef } from 'react';
import { demoMode, queryString } from '../services/api';
import { useRemoteData } from '../hooks/useRemoteData';
import { displayRupees, mapTransaction, parseCents, moneyCents } from '../services/liveData';
import { readPending, executePendingPayment, isConfirmedPaymentFailure } from '../services/pendingPayments';
import { walletService } from '../services/wallets';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Wallet,
  Users,
  Copy,
  Check,
  Search,
  Download,
  Activity,
} from "lucide-react";
import { useApp } from "../context/useApp";
import { transactions, activity, money } from "../data/demo";
import {
  PageHeader,
  StatCard,
  BalanceCard,
  TransactionTable,
  FormInput,
  ConfirmModal,
  NotificationItem,
  EmptyState,
  HealthPanel,
  LoadingSpinner,
} from "../components/UI";
import { transactionService } from "../services/transactions";
import { authService } from "../services/auth";
export function ActivityChart({ bars = false, data }) {
  const { summary } = useApp();
  const chartData = demoMode ? activity : (data || summary?.activity || []).map((row) => ({ month: row.month, received: displayRupees(row.receivedCents), sent: displayRupees(row.sentCents) }));
  const Chart = bars ? BarChart : AreaChart;
  return (
    <div
      className="chart"
      role="img"
      aria-label={demoMode ? 'Sample monthly received and sent amounts, June to November 2026' : 'Recorded monthly virtual payment activity'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <Chart
          data={chartData}
          margin={{ top: 15, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="#e9edf5"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#8290a5" }}
          />
          <YAxis
            tickFormatter={(v) => `${v / 1000}k`}
            axisLine={false}
            tickLine={false}
            width={42}
            tick={{ fontSize: 11, fill: "#8290a5" }}
          />
          <Tooltip formatter={(v) => money(v)} />
          {bars ? (
            <>
              <Bar
                dataKey="received"
                name="Received"
                fill="#2563eb"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="sent"
                name="Sent"
                fill="#06b6d4"
                radius={[5, 5, 0, 0]}
              />
              <Legend />
            </>
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="received"
                name="Received"
                stroke="#2563eb"
                fill="#eaf1ff"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="sent"
                name="Sent"
                stroke="#06b6d4"
                fill="transparent"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            </>
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
export function Dashboard() {
  const { user, summary, refresh } = useApp();
  const [fundMessage, setFundMessage] = useState('');
  const [fundBusy, setFundBusy] = useState(false);
  const [savedFunding] = useState(() => demoMode ? null : readPending('fund', user.id));
  const [fundUncertain, setFundUncertain] = useState(Boolean(savedFunding));
  const fundingAttempt = useRef(savedFunding);
  async function fund() {
    if (!fundingAttempt.current) fundingAttempt.current = { key: crypto.randomUUID(), input: { amountCents: Math.min(100000, summary.demoFundingRemainingCents) } };
    setFundBusy(true);
    try {
      await executePendingPayment('fund', user.id, fundingAttempt.current, (input, key) => walletService.fund(input.amountCents, key));
      fundingAttempt.current = null; setFundUncertain(false); setFundMessage('Demo funds added.'); await refresh();
    } catch (error) {
      if (isConfirmedPaymentFailure(error)) fundingAttempt.current = null;
      setFundUncertain(Boolean(fundingAttempt.current));
      setFundMessage(error.message + (fundingAttempt.current ? ' Outcome unconfirmed. Retry to confirm the same funding request.' : ''));
    } finally { setFundBusy(false); }
  }
  return (
    <>
      <PageHeader
        title={`Good morning, ${user.name.split(" ")[0]}`}
        action={
          <Link to="/send-money" className="button">
            <ArrowUpRight size={18} /> Send money
          </Link>
        }
      >
        Here's what's happening with your money today.
      </PageHeader>
      <div className="overview-grid">
        <BalanceCard user={user} />
        <StatCard
          title="Total sent"
          value={demoMode ? money(36500) : moneyCents(summary?.totalSentCents)}
          icon={ArrowUpRight}
          caption={demoMode ? 'This month · Sample outgoing transfers' : 'Completed outgoing virtual transfers'}
        />
        <StatCard
          title="Total received"
          value={demoMode ? money(58000) : moneyCents(summary?.totalReceivedCents)}
          icon={ArrowDownLeft}
          tone="teal"
          caption={demoMode ? 'This month · Sample incoming transfers' : 'Completed incoming virtual funds'}
        />
      </div>
      {!demoMode && !summary && <p className="notice" role="status">Loading wallet activity...</p>}
      {!demoMode && summary?.demoFundingEnabled && <section className="card mt-6">
        <h2>Development virtual funds</h2><p>Limited to LKR 10,000 per wallet over its lifetime.</p>
        <button className="button secondary" disabled={fundBusy || (!fundUncertain && summary.demoFundingRemainingCents === 0)} onClick={fund}>{fundBusy ? 'Confirming...' : fundUncertain ? 'Retry demo funding' : 'Add demo funds'}</button>
        {fundMessage && <p role="status">{fundMessage}</p>}
      </section>}
      <div className="dashboard-middle">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Money in motion</h2>
              <p>{demoMode ? 'Your monthly transaction activity · Sample LKR amounts' : 'Your recorded virtual transaction activity · LKR'}</p>
            </div>
            <span className="period-label">{demoMode ? 'Jun – Nov 2026' : 'Recent months'}</span>
          </div>
          <div className="chart-legend">
            <span>● Received</span>
            <span>● Sent</span>
          </div>
          <ActivityChart />
        </section>
        <section className="card quick-actions">
          <h2>A little less effort.</h2>
          <p>Everything you need, a tap away.</p>
          {[
            [
              "/send-money",
              ArrowUpRight,
              "Send money",
              "Connect through a transfer",
            ],
            [
              "/receive-money",
              ArrowDownLeft,
              "Receive money",
              "Share your account details",
            ],
            [
              "/transactions",
              ArrowLeftRight,
              "View transactions",
              "Every detail in one place",
            ],
          ].map(([to, Icon, title, copy]) => (
            <Link to={to} key={to}>
              <span className="stat-icon blue">
                <Icon size={20} />
              </span>
              <div>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </section>
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Recent transactions</h2>
            <p>{demoMode ? 'A quick look at your sample activity' : 'A quick look at your recorded activity'}</p>
          </div>
          <Link className="text-button" to="/transactions">
            View all <ArrowUpRight size={16} />
          </Link>
        </div>
        <TransactionTable rows={demoMode ? transactions.slice(0, 5) : summary?.recentTransactions || []} compact />
      </section>
      <HealthPanel />
    </>
  );
}
export function SendMoney() {
  const { user, refresh } = useApp();
  const [savedAttempt] = useState(() => demoMode ? null : readPending('transfer', user.id));
  const attempt = useRef(savedAttempt);
  const [uncertain, setUncertain] = useState(Boolean(savedAttempt));
  const [form, setForm] = useState(savedAttempt ? { email: savedAttempt.input.recipientEmail, amount: displayRupees(savedAttempt.input.amountCents).toFixed(2), description: savedAttempt.input.description } : { email: "", amount: "", description: "" }),
    [errors, setErrors] = useState({}),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  const bind = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: errors[key],
    disabled: uncertain || busy,
  });
  function submit(e) {
    e.preventDefault();
    if (uncertain) { setConfirm(true); return; }
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "Enter a valid recipient email.";
    if (form.email.toLowerCase() === user.email.toLowerCase())
      next.email = "Choose another recipient.";
    if (!demoMode) {
      try {
        const amountCents = parseCents(form.amount);
        if (amountCents > user.balanceCents) next.amount = 'Amount exceeds the available balance.';
        attempt.current = { key: crypto.randomUUID(), input: { recipientEmail: form.email.trim().toLowerCase(), amountCents, description: form.description.trim() } };
      } catch (error) { next.amount = error.message; }
    } else if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)
      next.amount = "Enter an amount greater than zero.";
    else if (Number(form.amount) > user.balance)
      next.amount = "Amount exceeds the sample available balance.";
    else if (!/^\d+(\.\d{1,2})?$/.test(form.amount))
      next.amount = "Use no more than two decimal places.";
    setErrors(next);
    setResult("");
    if (!Object.keys(next).length) setConfirm(true);
  }
  async function send() {
    setBusy(true);
    try {
      const response = demoMode ? await transactionService.send(form) :
        await executePendingPayment('transfer', user.id, attempt.current, transactionService.send);
      setResult('Payment completed. Reference ' + response.transaction.referenceNumber);
      setConfirm(false); setUncertain(false); attempt.current = null;
      setForm({ email: '', amount: '', description: '' }); await refresh();
    } catch (e) {
      if (demoMode) setResult(`${e.message} No payment was made.`);
      else if (isConfirmedPaymentFailure(e)) {
        setResult(e.message + (e.details?.referenceNumber ? ' Reference ' + e.details.referenceNumber : ''));
        setUncertain(false); attempt.current = null;
      } else {
        setUncertain(true);
        setResult(e.message + ' Outcome unconfirmed. Retry this request to check the same payment; do not create a new payment.');
      }
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="A connection, sent simply.">
        Send virtual money to another PayNet user.
      </PageHeader>
      <div className="form-grid">
        <section className="card form-card">
          <h2>Send money</h2>
          <form onSubmit={submit} noValidate>
            <FormInput
              label="Recipient email"
              id="recipient"
              type="email"
              placeholder="friend@example.com"
              {...bind("email")}
            />
            <FormInput
              label="Amount (LKR)"
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              {...bind("amount")}
            />
            <div className="balance-hint">
              {demoMode ? 'Sample available balance' : 'Available virtual balance'} <strong>{demoMode ? money(user.balance) : moneyCents(user.balanceCents)}</strong>
            </div>
            <div className="field">
              <label htmlFor="description">What's it for? (optional)</label>
              <textarea
                id="description"
                maxLength={180}
                disabled={uncertain || busy}
                placeholder="Lunch, shared plans, or a little thank you…"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="notice">
              {demoMode ? 'Demo preview. Confirming checks backend availability; it will not transfer funds.' : 'Review carefully. Confirmation sends a server-controlled virtual payment.'}
            </div>
            <button className="button full">
              {uncertain ? 'Retry pending transfer' : 'Review transfer'} <ArrowUpRight size={18} />
            </button>
          </form>
          {result && (
            <div className="notice" role="status">
              {result}
            </div>
          )}
        </section>
        <div>
          <BalanceCard user={user} />
          <section className="card mt-6">
            <h3>A moment to double-check.</h3>
            <p>
              Make sure the recipient email and amount are correct. Payments
              must be confirmed by the server.
            </p>
          </section>
        </div>
      </div>
      {confirm && (
        <ConfirmModal
          title="Review your transfer"
          onClose={() => setConfirm(false)}
          onConfirm={send}
          busy={busy}
          confirmLabel={demoMode ? 'Check backend availability' : uncertain ? 'Retry same payment' : 'Confirm virtual transfer'}
        >
          <div className="notice">{demoMode ? 'Demo transfer preview' : 'Virtual transfer confirmation'}</div>
          <dl className="details">
            <div>
              <dt>To</dt>
              <dd>{form.email}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(Number(form.amount))}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{form.description || "No description"}</dd>
            </div>
          </dl>
        </ConfirmModal>
      )}
    </>
  );
}
export function ReceiveMoney() {
  const { user, revision } = useApp();
  const incoming = useRemoteData('/api/transactions?type=incoming&limit=5', !demoMode, revision);
  const [copy, setCopy] = useState("");
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        `PayNet demo account\n${user.name}\n${user.email}\n${user.wallet}`,
      );
      setCopy("Account details copied.");
    } catch {
      setCopy(
        "Clipboard unavailable. Select and copy the account details below.",
      );
    }
  }
  return (
    <>
      <PageHeader title="Good things, coming your way.">
        Share your details to prepare for a virtual payment.
      </PageHeader>
      <div className="receive-grid">
        <section className="card account-card">
          <span className="big-icon">
            <ArrowDownLeft size={32} />
          </span>
          <h2>Your PayNet details</h2>
          <p>One email. A simpler connection.</p>
          <dl className="details">
            <div>
              <dt>Account holder</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Registered email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Wallet identifier</dt>
              <dd>{user.wallet}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>LKR · Virtual funds</dd>
            </div>
          </dl>
          <button className="button full" onClick={copyDetails}>
            <Copy size={18} /> Copy account details
          </button>
          <p role="status">{copy}</p>
        </section>
        <section className="card">
          <h2>A little guide to receiving</h2>
          {[
            [
              "Share your registered email",
              "Another PayNet user will use this email to find your account.",
            ],
            [
              "They prepare a transfer",
              "The sender enters a virtual amount and reviews the details.",
            ],
            [
              "Stay up to date",
              demoMode ? "After backend integration, confirmed transfers will appear in your activity." : 'Confirmed virtual transfers appear instantly in your activity.',
            ],
          ].map(([title, copy], i) => (
            <div className="step" key={title}>
              <span>0{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
          <div className="notice">
            {demoMode ? 'This is a sample account. Receiving payments requires backend wallet and transaction services.' : 'Share your registered email. Only server-confirmed virtual payments will appear.'}
          </div>
        </section>
      </div>
      <section className="card mt-6">
        <h2>Recent incoming transactions</h2>
        {!demoMode && incoming.loading && <p role="status">Loading incoming transactions...</p>}
        {!demoMode && incoming.error && <p className="error" role="alert">{incoming.error} <button onClick={incoming.retry}>Retry</button></p>}
        <TransactionTable
          rows={demoMode ? transactions.filter((t) => t.type === 'incoming').slice(0, 5) : (incoming.data?.items || []).map(mapTransaction)}
        />
      </section>
    </>
  );
}
export function Transactions() {
  const { revision } = useApp();
  const [dateTo, setDateTo] = useState(''), [sort, setSort] = useState('newest');
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState(""),
    [page, setPage] = useState(1);
  const remote = useRemoteData('/api/transactions?' + queryString({ page, limit: 6, search, type, status: status.toUpperCase(), from: date, to: dateTo || date, sort }), !demoMode, revision);
  const rows = demoMode ? transactions.filter(
    (t) =>
      `${t.name} ${t.email} ${t.id}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!type || t.type === type) &&
      (!status || t.status === status) &&
      (!date || t.date === date),
  ) : (remote.data?.items || []).map(mapTransaction);
  const count = demoMode ? Math.max(1, Math.ceil(rows.length / 6)) : remote.data?.pages || 1;
  const safePage = Math.min(page, count);
  function reset() {
    setSearch("");
    setType("");
    setStatus("");
    setDate("");
    setPage(1);
    setDateTo(''); setSort('newest');
  }
  function exportCsv() {
    const quote = (v) => '"' + String(typeof v === 'string' && /^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
    const data = [
      [demoMode ? 'DEMO DATA - NOT REAL PAYMENTS' : 'RECORDED VIRTUAL PAYMENTS - CURRENT FILTERED PAGE'],
      ["id", "name", "type", "amount LKR", "status", "date"],
      ...rows.map((t) => [t.id, t.name, t.type, t.amount, t.status, t.date]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([data], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = demoMode ? 'paynet-demo-transactions.csv' : 'paynet-virtual-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeader
        title="Every connection, in view."
        action={
          <button className="button secondary" onClick={exportCsv}>
            <Download size={18} /> {demoMode ? 'Export sample CSV' : 'Export page CSV'}
          </button>
        }
      >
        {demoMode ? 'Explore and review your sample transaction history.' : 'Explore and review your recorded virtual transaction history.'}
      </PageHeader>
      <section className="card">
        <div className="filters">
          <div className="search-wrap">
            <Search size={18} />
            <input
              aria-label="Search transactions"
              placeholder="Search name, email or reference…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Transaction type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>
          <select
            aria-label="Transaction status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["completed", "pending", "failed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            aria-label={demoMode ? 'Transaction date' : 'From date'}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
          />
          {!demoMode && <>
            <input type="date" aria-label="To date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            <select aria-label="Sort transactions" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-asc">Amount ascending</option><option value="amount-desc">Amount descending</option>
            </select>
          </>}
          <button className="text-button" onClick={reset}>
            Reset
          </button>
        </div>
        {!demoMode && remote.loading && <p role="status">Loading transactions...</p>}
        {!demoMode && remote.error && <p role="alert" className="error">{remote.error} <button className="text-button" onClick={remote.retry}>Retry</button></p>}
        <TransactionTable rows={demoMode ? rows.slice((safePage - 1) * 6, safePage * 6) : rows} />
        <div className="pagination">
          <span>
            {demoMode ? rows.length + ' sample' : remote.data?.total || 0} transactions · Page {safePage} of {count}
          </span>
          <div>
            <button
              className="button secondary small"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </button>
            <button
              className="button secondary small"
              disabled={safePage === count}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function Notifications() {
  const { notifications, markRead, unreadCount, notificationPage, notificationPages, loadMoreNotifications, testNotifications, setTestNotifications } = useApp();
  const [unread, setUnread] = useState(false);
  const rows = notifications.filter((n) => !unread || !n.read);
  return (
    <>
      <PageHeader
        title="You're in the loop."
        action={
          <button
            className="button secondary"
            disabled={demoMode ? notifications.every((n) => n.read) : unreadCount === 0}
            onClick={() => markRead()}
          >
            <Check size={17} /> Mark all as read
          </button>
        }
      >
        {demoMode ? 'Sample financial data. Authenticated financial updates await backend integration.' : 'Persisted account notifications and confirmed virtual payment updates.'}
      </PageHeader>
      {import.meta.env.DEV && <section className="card live-test-notifications" aria-label="Real-time test notifications">
        <header><h2>Real-time test notifications</h2><button className="text-button" disabled={!testNotifications.length} onClick={() => setTestNotifications([])}>Clear test notifications</button></header>
        <p>Development only · nonfinancial · received on this browser connection. No payment was made.</p>
        {testNotifications.length ? testNotifications.map((item) => <article key={item.id} data-testid="test-notification">
          <strong>Development test notification</strong><p>{item.message}</p>
          <small><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time> · {item.id}</small>
        </article>) : <p>No real-time test notifications received. Use /network-demo to send one.</p>}
      </section>}
      <section className="card">
        <div className="tabs">
          <button
            className={!unread ? "active" : ""}
            onClick={() => setUnread(false)}
          >
            All notifications
          </button>
          <button
            className={unread ? "active" : ""}
            onClick={() => setUnread(true)}
          >
            Unread ({demoMode ? notifications.filter((n) => !n.read).length : unreadCount})
          </button>
        </div>
        {rows.length ? (
          rows.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              onRead={() => markRead(item.id)}
            />
          ))
        ) : (
          <EmptyState title="All caught up.">
            {demoMode ? 'There are no unread demo notifications.' : 'There are no matching notifications.'}
          </EmptyState>
        )}
      </section>
      {!demoMode && notificationPage < notificationPages && <button className="button secondary" onClick={loadMoreNotifications}>Load more notifications</button>}
    </>
  );
}
export function Profile() {
  const { user, setUser, refresh, signIn } = useApp();
  const [name, setName] = useState(user.name),
    [email, setEmail] = useState(user.email),
    [message, setMessage] = useState(""),
    [password, setPassword] = useState({ current: "", next: "", confirm: "" }),
    [pwMessage, setPwMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a full name and valid email.");
      return;
    }
    if (!demoMode) {
      setBusy(true);
      try { await walletService.updateProfile(name.trim()); setMessage('Profile saved.'); await refresh(); }
      catch (error) { setMessage(error.message); }
      finally { setBusy(false); }
      return;
    }
    setUser({ ...user, name: name.trim(), email });
    setMessage(
      "Demo profile updated for this session. Nothing was saved to a server.",
    );
  }
  async function change(e) {
    e.preventDefault();
    if (
      !password.current ||
      password.next.length < 8 ||
      password.next !== password.confirm
    ) {
      setPwMessage(
        "Enter your current password and matching new passwords with at least 8 characters.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await authService.changePassword(password);
      await signIn(result); setPwMessage('Password changed. Other sessions have been signed out.');
    } catch (err) {
      setPwMessage(err.message);
    } finally {
      setBusy(false);
      setPassword({ current: "", next: "", confirm: "" });
    }
  }
  return (
    <>
      <PageHeader title="A space that's yours.">
        Your profile, preferences and account information.
      </PageHeader>
      <div className="profile-grid">
        <section className="card profile-summary">
          <span className="avatar large">
            {user.name
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="demo-chip">{demoMode ? 'Sample personal account' : user.role + ' virtual account'}</span>
          <dl className="details">
            <div>
              <dt>Wallet identifier</dt>
              <dd>{user.wallet}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>LKR</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>{demoMode ? 'Demo preview' : 'Connected virtual account'}</dd>
            </div>
          </dl>
          <div className="notice">
            {demoMode ? 'Profile changes stay in memory and reset on reload.' : 'Profile changes are saved to your account.'}
          </div>
        </section>
        <div className="space-y-6">
          <section className="card">
            <h2>Personal information</h2>
            <form onSubmit={save}>
              <FormInput
                label="Full name"
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <FormInput
                label="Email address"
                id="profile-email"
                readOnly={!demoMode}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button className="button" disabled={busy}>{demoMode ? 'Save demo changes' : 'Save changes'}</button>
              <p role="status">{message}</p>
            </form>
          </section>
          <section className="card">
            <h2>Password & security</h2>
            <form onSubmit={change}>
              {[
                ["current", "Current password"],
                ["next", "New password"],
                ["confirm", "Confirm new password"],
              ].map(([key, label]) => (
                <FormInput
                  key={key}
                  label={label}
                  id={`pw-${key}`}
                  type="password"
                  autoComplete={
                    key === "current" ? "current-password" : "new-password"
                  }
                  value={password[key]}
                  onChange={(e) =>
                    setPassword({ ...password, [key]: e.target.value })
                  }
                />
              ))}
              <button className="button secondary" disabled={busy}>
                {busy ? <LoadingSpinner /> : "Change password"}
              </button>
              <p role="status">{pwMessage}</p>
            </form>
            <div className="notice">
              {demoMode ? 'JWT sign-in, password changes and multi-factor authentication require backend implementation. Never use a real banking password in this demo.' : 'Changing your password requires your current password and signs out your other sessions. Never use a banking password for this educational account.'}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
export function Admin() {
  const [selected, setSelected] = useState(null);
  const { revision } = useApp();
  const [userPage, setUserPage] = useState(1), [transactionPage, setTransactionPage] = useState(1), [userSearch, setUserSearch] = useState('');
  const overview = useRemoteData('/api/admin/dashboard', !demoMode, revision);
  const users = useRemoteData('/api/admin/users?' + queryString({ page: userPage, limit: 10, search: userSearch }), !demoMode, revision);
  const monitoring = useRemoteData('/api/admin/transactions?' + queryString({ page: transactionPage, limit: 10 }), !demoMode, revision);
  const health = useRemoteData('/api/admin/system-health', !demoMode, revision);
  return (
    <>
      <PageHeader
        eyebrow={demoMode ? 'ADMINISTRATION · DEMO ONLY' : 'ADMINISTRATION · VIRTUAL PAYMENT SYSTEM'}
        title="The bigger picture."
      >
        {demoMode ? 'Illustrative PayNet analytics. No production systems are connected.' : 'Recorded system activity. Access is authorized by the server.'}
      </PageHeader>
      <div className="admin-stats">
        <StatCard title="Total users" value={demoMode ? '1,248' : overview.data?.totalUsers ?? '—'} icon={Users} caption={demoMode ? undefined : 'Registered accounts'} />
        <StatCard
          title="Total transactions"
          value={demoMode ? '8,562' : overview.data?.totalTransfers ?? '—'}
          caption={demoMode ? undefined : 'Completed virtual transfers'}
          icon={ArrowLeftRight}
          tone="teal"
        />
        <StatCard title="Transferred volume" value={demoMode ? 'LKR 2.4M' : moneyCents(overview.data?.transferredCents)} icon={Wallet} caption={demoMode ? undefined : 'Recorded completed virtual transfers'} />
        <StatCard
          title={demoMode ? 'Sample completion' : 'Virtual wallets'}
          value={demoMode ? '98.6%' : overview.data?.totalWallets ?? '—'}
          caption={demoMode ? undefined : 'One wallet per registered account'}
          icon={Activity}
          tone="teal"
        />
      </div>
      {!demoMode && [overview, users, monitoring, health].some((r) => r.loading) && <p role="status">Loading administration data...</p>}
      {!demoMode && [overview, users, monitoring, health].filter((r) => r.error).map((r, i) => <p key={i} className="error" role="alert">{r.error} <button className="text-button" onClick={r.retry}>Retry</button></p>)}
      <div className="dashboard-middle">
        <section className="card">
          <h2>Transaction analytics</h2>
          <p>{demoMode ? 'Sample monthly volume · LKR' : 'Recorded monthly transferred virtual volume · LKR'}</p>
          <ActivityChart bars data={overview.data?.activity || []} />
        </section>
        <section className="card system-panel">
          <h2>System health</h2>
          <HealthPanel />
          {(demoMode ? [
            ["Authentication", "Not implemented"],
            ["Database health", "Not exposed by API"],
            ["Payment processing", "Not connected"],
            ["Socket.IO events", "Planned"],
          ] : [
            ['Authentication', 'Server-authorized admin session'], ['Database health', health.data?.database?.ready ? 'Connected' : 'Unavailable'],
            ['Payment processing', health.data?.database?.transactionsSupported ? 'Transactions supported' : 'Replica set required'],
            ['Socket.IO events', String(health.data?.sockets ?? 0) + ' authenticated clients'],
          ]).map(([a, b]) => (
            <div className="system-row" key={a}>
              <span>{a}</span>
              <span>{b}</span>
            </div>
          ))}
          <div className="notice">
            {demoMode ? 'Server-side admin role authorization is required before production use.' : 'Educational system using virtual funds only. No banking integration.'}
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Transaction monitoring</h2>
        <p>{demoMode ? 'Sample data · No live transfers' : 'Persisted virtual transfer audit records'}</p>
        <TransactionTable rows={demoMode ? transactions.slice(0, 5) : (monitoring.data?.items || []).map(mapTransaction)} />
        {!demoMode && <div className="pagination"><button className="button secondary small" disabled={transactionPage <= 1} onClick={() => setTransactionPage((p) => p - 1)}>Previous transfers</button><span>Page {transactionPage} of {monitoring.data?.pages || 1}</span><button className="button secondary small" disabled={transactionPage >= (monitoring.data?.pages || 1)} onClick={() => setTransactionPage((p) => p + 1)}>Next transfers</button></div>}
      </section>
      <section className="card mt-6">
        <h2>User management</h2>
        <p>{demoMode ? 'Fictional accounts for interface preview' : 'Registered account directory'}</p>
        {!demoMode && <input aria-label="Search users" placeholder="Search users" value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} />}
        <div className="transaction-table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(demoMode ? [
                "Alex Morgan",
                "Sarah Wilson",
                "Daniel Perera",
                "Maya Fernando",
              ].map((name, i) => ({ fullName: name, email: name.toLowerCase().replace(' ', '.') + '@example.com', role: 'Sample user', id: `PN-DEMO-00${i + 1}` })) : users.data?.items || []).map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.fullName}</strong>
                  </td>
                  <td>{account.email}</td>
                  <td>{account.role}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        setSelected({ name: account.fullName, id: account.id })
                      }
                    >
                      View user <ArrowUpRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!demoMode && <div className="pagination"><button className="button secondary small" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Previous users</button><span>Page {userPage} of {users.data?.pages || 1}</span><button className="button secondary small" disabled={userPage >= (users.data?.pages || 1)} onClick={() => setUserPage((p) => p + 1)}>Next users</button></div>}
      </section>
      {selected && (
        <ConfirmModal
          title={demoMode ? 'Sample user details' : 'User details'}
          onClose={() => setSelected(null)}
        >
          <h3>{selected.name}</h3>
          <p>{selected.id}</p>
          <div className="notice">
            {demoMode ? 'User administration requires authorized backend endpoints. No account changes can be made here.' : 'Account directory data is provided by the authorized admin API.'}
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
export function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">A SMALL DETOUR</span>
      <div className="error-code">404 ↗</div>
      <h1>This connection took a wrong turn.</h1>
      <p>Let's get you back to somewhere familiar.</p>
      <Link className="button" to="/">
        Return home <ArrowUpRight size={18} />
      </Link>
    </main>
  );
}
