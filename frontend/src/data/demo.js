export const sampleUser = {
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
  wallet: "PN-DEMO-004821",
  balance: 125750,
};
export const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(value);
export const transactions = Array.from({ length: 24 }, (_, i) => ({
  id: `PN-DEMO-${1048 - i}`,
  name: [
    "Sarah Wilson",
    "Daniel Perera",
    "Maya Fernando",
    "James Carter",
    "Nimal Silva",
    "Emma Thompson",
  ][i % 6],
  email:
    ["sarah", "daniel", "maya", "james", "nimal", "emma"][i % 6] +
    "@example.com",
  type: i % 3 === 0 ? "incoming" : "outgoing",
  amount: [8500, 3250, 12000, 4500, 1800, 6200][i % 6],
  status: i % 7 === 5 ? "pending" : i % 9 === 8 ? "failed" : "completed",
  date: `2026-11-${String(11 - Math.floor(i / 3)).padStart(2, "0")}`,
  description: [
    "Project contribution",
    "Lunch with friends",
    "Monthly savings",
    "Weekend plans",
  ][i % 4],
}));
export const activity = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map(
  (month, i) => ({
    month,
    received: [24000, 38000, 32000, 51000, 42000, 58000][i],
    sent: [18000, 24000, 22000, 34000, 29000, 36500][i],
  }),
);
export const initialNotifications = transactions
  .slice(0, 4)
  .map((t, i) => ({ ...t, read: i > 1 }));
