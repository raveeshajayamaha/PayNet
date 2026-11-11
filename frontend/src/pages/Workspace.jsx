import { useState } from "react";
import { Link } from "react-router-dom";
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
export function ActivityChart({ bars = false }) {
  const Chart = bars ? BarChart : AreaChart;
  return (
    <div
      className="chart"
      role="img"
      aria-label="Sample monthly received and sent amounts, June to November 2026"
    >
      <ResponsiveContainer width="100%" height="100%">
        <Chart
          data={activity}
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
  const { user } = useApp();
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
          value={money(36500)}
          icon={ArrowUpRight}
          caption="This month · Sample outgoing transfers"
        />
        <StatCard
          title="Total received"
          value={money(58000)}
          icon={ArrowDownLeft}
          tone="teal"
          caption="This month · Sample incoming transfers"
        />
      </div>
      <div className="dashboard-middle">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Money in motion</h2>
              <p>Your monthly transaction activity · Sample LKR amounts</p>
            </div>
            <span className="period-label">Jun – Nov 2026</span>
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
            <p>A quick look at your sample activity</p>
          </div>
          <Link className="text-button" to="/transactions">
            View all <ArrowUpRight size={16} />
          </Link>
        </div>
        <TransactionTable rows={transactions.slice(0, 5)} compact />
      </section>
      <HealthPanel />
    </>
  );
}
export function SendMoney() {
  const { user } = useApp();
  const [form, setForm] = useState({ email: "", amount: "", description: "" }),
    [errors, setErrors] = useState({}),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  const bind = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
    error: errors[key],
  });
  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "Enter a valid recipient email.";
    if (form.email.toLowerCase() === user.email.toLowerCase())
      next.email = "Choose another recipient.";
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)
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
      await transactionService.send(form);
    } catch (e) {
      setResult(`${e.message} No payment was made.`);
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
              Sample available balance <strong>{money(user.balance)}</strong>
            </div>
            <div className="field">
              <label htmlFor="description">What's it for? (optional)</label>
              <textarea
                id="description"
                maxLength={180}
                placeholder="Lunch, shared plans, or a little thank you…"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="notice">
              Demo preview. Confirming checks backend availability; it will not
              transfer funds.
            </div>
            <button className="button full">
              Review transfer <ArrowUpRight size={18} />
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
          confirmLabel="Check backend availability"
        >
          <div className="notice">Demo transfer preview</div>
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
  const { user } = useApp();
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
              "After backend integration, confirmed transfers will appear in your activity.",
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
            This is a sample account. Receiving payments requires backend wallet
            and transaction services.
          </div>
        </section>
      </div>
      <section className="card mt-6">
        <h2>Recent incoming transactions</h2>
        <TransactionTable
          rows={transactions.filter((t) => t.type === "incoming").slice(0, 5)}
        />
      </section>
    </>
  );
}
export function Transactions() {
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState(""),
    [page, setPage] = useState(1);
  const rows = transactions.filter(
    (t) =>
      `${t.name} ${t.email} ${t.id}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!type || t.type === type) &&
      (!status || t.status === status) &&
      (!date || t.date === date),
  );
  const count = Math.max(1, Math.ceil(rows.length / 6));
  const safePage = Math.min(page, count);
  function reset() {
    setSearch("");
    setType("");
    setStatus("");
    setDate("");
    setPage(1);
  }
  function exportCsv() {
    const quote = (v) => '"' + String(v).replaceAll('"', '""') + '"';
    const data = [
      ["DEMO DATA - NOT REAL PAYMENTS"],
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
    a.download = "paynet-demo-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeader
        title="Every connection, in view."
        action={
          <button className="button secondary" onClick={exportCsv}>
            <Download size={18} /> Export sample CSV
          </button>
        }
      >
        Explore and review your sample transaction history.
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
            aria-label="Transaction date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
          />
          <button className="text-button" onClick={reset}>
            Reset
          </button>
        </div>
        <TransactionTable rows={rows.slice((safePage - 1) * 6, safePage * 6)} />
        <div className="pagination">
          <span>
            {rows.length} sample transactions · Page {safePage} of {count}
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
  const { notifications, setNotifications } = useApp();
  const [unread, setUnread] = useState(false);
  const rows = notifications.filter((n) => !unread || !n.read);
  return (
    <>
      <PageHeader
        title="You're in the loop."
        action={
          <button
            className="button secondary"
            disabled={notifications.every((n) => n.read)}
            onClick={() =>
              setNotifications(notifications.map((n) => ({ ...n, read: true })))
            }
          >
            <Check size={17} /> Mark all as read
          </button>
        }
      >
        Sample notifications. Live updates require future Socket.IO integration.
      </PageHeader>
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
            Unread ({notifications.filter((n) => !n.read).length})
          </button>
        </div>
        {rows.length ? (
          rows.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              onRead={() =>
                setNotifications(
                  notifications.map((n) =>
                    n.id === item.id ? { ...n, read: true } : n,
                  ),
                )
              }
            />
          ))
        ) : (
          <EmptyState title="All caught up.">
            There are no unread demo notifications.
          </EmptyState>
        )}
      </section>
    </>
  );
}
export function Profile() {
  const { user, setUser } = useApp();
  const [name, setName] = useState(user.name),
    [email, setEmail] = useState(user.email),
    [message, setMessage] = useState(""),
    [password, setPassword] = useState({ current: "", next: "", confirm: "" }),
    [pwMessage, setPwMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function save(e) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a full name and valid email.");
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
      await authService.changePassword(password);
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
          <span className="demo-chip">Sample personal account</span>
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
              <dd>Demo preview</dd>
            </div>
          </dl>
          <div className="notice">
            Profile changes stay in memory and reset on reload.
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
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button className="button">Save demo changes</button>
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
              JWT sign-in, password changes and multi-factor authentication
              require backend implementation. Never use a real banking password
              in this demo.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
export function Admin() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION · DEMO ONLY"
        title="The bigger picture."
      >
        Illustrative PayNet analytics. No production systems are connected.
      </PageHeader>
      <div className="admin-stats">
        <StatCard title="Total users" value="1,248" icon={Users} />
        <StatCard
          title="Total transactions"
          value="8,562"
          icon={ArrowLeftRight}
          tone="teal"
        />
        <StatCard title="Transferred volume" value="LKR 2.4M" icon={Wallet} />
        <StatCard
          title="Sample completion"
          value="98.6%"
          icon={Activity}
          tone="teal"
        />
      </div>
      <div className="dashboard-middle">
        <section className="card">
          <h2>Transaction analytics</h2>
          <p>Sample monthly volume · LKR</p>
          <ActivityChart bars />
        </section>
        <section className="card system-panel">
          <h2>System health</h2>
          <HealthPanel />
          {[
            ["Authentication", "Not implemented"],
            ["Database health", "Not exposed by API"],
            ["Payment processing", "Not connected"],
            ["Socket.IO events", "Planned"],
          ].map(([a, b]) => (
            <div className="system-row" key={a}>
              <span>{a}</span>
              <span>{b}</span>
            </div>
          ))}
          <div className="notice">
            Server-side admin role authorization is required before production
            use.
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Transaction monitoring</h2>
        <p>Sample data · No live transfers</p>
        <TransactionTable rows={transactions.slice(0, 5)} />
      </section>
      <section className="card mt-6">
        <h2>User management</h2>
        <p>Fictional accounts for interface preview</p>
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
              {[
                "Alex Morgan",
                "Sarah Wilson",
                "Daniel Perera",
                "Maya Fernando",
              ].map((name, i) => (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>{name.toLowerCase().replace(" ", ".")}@example.com</td>
                  <td>Sample user</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        setSelected({ name, id: `PN-DEMO-00${i + 1}` })
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
      </section>
      {selected && (
        <ConfirmModal
          title="Sample user details"
          onClose={() => setSelected(null)}
        >
          <h3>{selected.name}</h3>
          <p>{selected.id}</p>
          <div className="notice">
            User administration requires authorized backend endpoints. No
            account changes can be made here.
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
