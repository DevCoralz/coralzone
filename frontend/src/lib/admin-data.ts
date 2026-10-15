export type AdminUserStatus = 'Active' | 'Restricted' | 'Suspended';

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  joined: string;
  lastSeen: string;
  status: AdminUserStatus;
  role: string;
  balance: number;
  usage: number;
  plan: string;
};

export const adminUsers: AdminUser[] = [
  { id: 'usr_2048', name: 'Amara Okafor', email: 'amara.okafor@example.com', joined: 'Oct 12, 2026', lastSeen: '2 min ago', status: 'Active', role: 'Member', balance: 24520, usage: 3240, plan: 'Developer' },
  { id: 'usr_2047', name: 'Daniel Mensah', email: 'daniel.m@example.com', joined: 'Oct 11, 2026', lastSeen: '18 min ago', status: 'Active', role: 'Member', balance: 10800, usage: 812, plan: 'Starter' },
  { id: 'usr_2046', name: 'Zainab Bello', email: 'zainab.b@example.com', joined: 'Oct 10, 2026', lastSeen: '1 hr ago', status: 'Restricted', role: 'Member', balance: 5200, usage: 9910, plan: 'Developer' },
  { id: 'usr_2045', name: 'Tobi Adeyemi', email: 'tobi.a@example.com', joined: 'Oct 09, 2026', lastSeen: 'Yesterday', status: 'Active', role: 'Member', balance: 76500, usage: 1780, plan: 'Pro' },
  { id: 'usr_2044', name: 'Mariam Yusuf', email: 'mariam.y@example.com', joined: 'Oct 08, 2026', lastSeen: '2 days ago', status: 'Suspended', role: 'Member', balance: 0, usage: 0, plan: 'Starter' },
  { id: 'usr_2043', name: 'Kofi Asante', email: 'kofi.a@example.com', joined: 'Oct 06, 2026', lastSeen: '3 days ago', status: 'Active', role: 'Member', balance: 15750, usage: 2470, plan: 'Developer' },
];

export const revenueRanges = {
  '7d': { label: 'Last 7 days', amount: 1842500, change: '+12.8%', points: [32, 48, 39, 64, 55, 73, 91], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  '30d': { label: 'Last 30 days', amount: 7284500, change: '+8.4%', points: [28, 37, 33, 48, 42, 57, 52, 71, 66, 82], labels: ['1', '4', '7', '10', '13', '16', '19', '22', '25', '30'] },
  '90d': { label: 'Last 90 days', amount: 18220500, change: '+16.2%', points: [22, 30, 28, 43, 39, 55, 50, 62, 59, 77, 73, 92], labels: ['Jul', 'Jul', 'Aug', 'Aug', 'Aug', 'Sep', 'Sep', 'Sep', 'Oct', 'Oct', 'Oct', 'Now'] },
  'all': { label: 'All time', amount: 84215750, change: '+21.6%', points: [12, 20, 17, 32, 28, 42, 48, 45, 63, 72, 68, 94], labels: ['Nov', 'Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'Jan', 'Mar', 'May', 'Aug', 'Now'] },
} as const;

export const adminPayments = [
  { id: 'PAY-03842', name: 'Amara Okafor', email: 'amara.okafor@example.com', date: 'Today, 10:42 AM', method: 'Card · Visa', amount: 10000, status: 'Completed' },
  { id: 'PAY-03841', name: 'Daniel Mensah', email: 'daniel.m@example.com', date: 'Today, 9:18 AM', method: 'Bank transfer', amount: 25000, status: 'Pending' },
  { id: 'PAY-03840', name: 'Zainab Bello', email: 'zainab.b@example.com', date: 'Yesterday, 4:30 PM', method: 'Card · Mastercard', amount: 5000, status: 'Review' },
  { id: 'PAY-03839', name: 'Tobi Adeyemi', email: 'tobi.a@example.com', date: 'Oct 13, 2026', method: 'Bank transfer', amount: 50000, status: 'Completed' },
  { id: 'PAY-03838', name: 'Kofi Asante', email: 'kofi.a@example.com', date: 'Oct 12, 2026', method: 'Card · Visa', amount: 15000, status: 'Refunded' },
];

export const revenueChartRows = (range: keyof typeof revenueRanges) => {
  const selected = revenueRanges[range];
  return selected.points.map((revenue, index) => ({ label: selected.labels[index] ?? '', revenue: Math.round(revenue * selected.amount / 100) }));
};

export const formatNaira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;