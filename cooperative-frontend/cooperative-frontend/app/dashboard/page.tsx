'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useGetFinancialReportQuery,
  useGetLoanPortfolioReportQuery,
  useGetMembershipReportQuery,
} from '@/features/reports/reportsApi';
import {
  useGetPendingApplicationsQuery,
  useGetPendingAppealsQuery,
  useGetPendingRestructuringsQuery,
} from '@/features/loans/loansApi';
import {
  useGetMissedDepositsQuery,
  useGetMissedRepaymentsQuery,
} from '@/features/alerts/alertsApi';

const f = (n?: number | null) => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `ETB ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `ETB ${(n / 1_000).toFixed(1)}K`;
  return `ETB ${n.toLocaleString()}`;
};
// For values stored as decimals (0.9662 → 96.6%)
const p = (n?: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
// For values already stored as percentages (3.16 → 3.2%)
const pct = (n?: number | null) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
const hi = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function KPICard({ title, value, subtitle, icon, color = 'blue' }: {
  title: string; value: string; subtitle?: string;
  icon: React.ReactNode; color?: 'blue' | 'green' | 'red' | 'purple' | 'orange';
}) {
  const gradients = {
    blue: 'from-[#0A2E5C] to-[#1A4A8A]',
    green: 'from-[#00C853] to-[#009624]',
    red: 'from-[#DC2626] to-[#991B1B]',
    purple: 'from-[#7C3AED] to-[#5B21B6]',
    orange: 'from-[#EA580C] to-[#C2410C]',
  };
  return (
    <div className="group relative p-6 rounded-2xl bg-white border border-gray-100/60 hover:border-gray-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>{value}</h3>
      <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

function StatRow({ label, value, accent, warn, bold }: {
  label: string; value: string; accent?: boolean; warn?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-100/60 last:border-0">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className={`text-xs font-semibold ${warn ? 'text-red-500' : accent ? 'text-emerald-600' : bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}

function NavTile({ label, href, icon, sub }: { label: string; href: string; icon: React.ReactNode; sub: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-3 p-4 rounded-2xl border border-gray-200/60 bg-white hover:border-blue-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 group-hover:from-blue-50 group-hover:to-blue-100 group-hover:border-blue-200 group-hover:text-blue-600 transition-all flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors leading-tight" style={{ fontFamily: 'Poppins' }}>{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-tight">{sub}</p>
      </div>
    </Link>
  );
}

const NAV_ITEMS = [
  { label: 'Members', href: '/dashboard/members', sub: 'Member directory', roles: ['MANAGER', 'MEMBER_OFFICER', 'LOAN_OFFICER', 'ACCOUNTANT'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { label: 'Accounts', href: '/dashboard/accounts', sub: 'Savings accounts', roles: ['MANAGER', 'MEMBER_OFFICER', 'ACCOUNTANT'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> },
  { label: 'Loans', href: '/dashboard/loans', sub: 'Applications & loans', roles: ['MANAGER', 'LOAN_OFFICER', 'ACCOUNTANT'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
  { label: 'Transactions', href: '/dashboard/transactions', sub: 'Deposit & withdraw', roles: ['MANAGER', 'ACCOUNTANT'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
  { label: 'Share Capital', href: '/dashboard/share-capital', sub: 'Shares & transfers', roles: ['MANAGER', 'MEMBER_OFFICER', 'ACCOUNTANT'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
  { label: 'Reports', href: '/dashboard/reports/financial', sub: 'Analytics', roles: ['MANAGER', 'ACCOUNTANT', 'AUDITOR'],
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { user } = useAuth();
  const roles = mounted ? (user?.roles ?? []) : [];
  const canFin = roles.some(r => ['MANAGER', 'ACCOUNTANT', 'AUDITOR'].includes(r));
  const canLoans = roles.some(r => ['MANAGER', 'LOAN_OFFICER', 'ACCOUNTANT', 'AUDITOR'].includes(r));
  const canMembers = roles.some(r => ['MANAGER', 'MEMBER_OFFICER', 'AUDITOR'].includes(r));

  const { data: fin } = useGetFinancialReportQuery(undefined, { skip: !mounted || !canFin });
  const { data: loans } = useGetLoanPortfolioReportQuery(undefined, { skip: !mounted || !canLoans });
  const { data: members } = useGetMembershipReportQuery(undefined, { skip: !mounted || !canMembers });
  const { data: pendingApps } = useGetPendingApplicationsQuery(undefined, { skip: !mounted || !canLoans });
  const { data: pendingAppeals } = useGetPendingAppealsQuery(undefined, { skip: !mounted || !canLoans });
  const { data: pendingRestructurings } = useGetPendingRestructuringsQuery(undefined, { skip: !mounted || !canLoans });

  const canAlerts = roles.some(r => ['MANAGER', 'ACCOUNTANT', 'MEMBER_OFFICER', 'LOAN_OFFICER'].includes(r));
  const { data: missedDeposits = [] } = useGetMissedDepositsQuery(undefined, { skip: !mounted || !canAlerts });
  const { data: missedRepayments = [] } = useGetMissedRepaymentsQuery(undefined, { skip: !mounted || !canAlerts });

  const pendingCount = pendingApps?.length ?? 0;
  const appealCount = pendingAppeals?.length ?? 0;
  const restructCount = pendingRestructurings?.length ?? 0;

  const visibleNav = NAV_ITEMS.filter(n => n.roles.some(r => roles.includes(r)));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200">
              Operations Dashboard
            </span>
            {fin && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                fin.withinLendingLimit
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${fin.withinLendingLimit ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
                {fin.withinLendingLimit ? 'Compliant' : 'Limit Exceeded'}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>
            {hi()}, {mounted ? (user?.fullName ? user.fullName.split(' ')[0] : user?.username ?? 'User') : 'there'}!
          </h1>
          <p className="text-gray-500 text-sm">Welcome to your Ma'ed Cooperative dashboard</p>
        </div>
        <Link
          href="/dashboard/reports/financial"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0A2E5C] to-[#1A4A8A] text-white font-semibold text-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Full Report
        </Link>
      </div>

      {/* KPI Cards */}
      {canFin && fin && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <KPICard title="Total Savings" value={f(fin.totalSavings)} subtitle={`Regular: ${f(fin.totalRegularSavings)}`} color="blue"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>} />
          <KPICard title="Share Capital" value={f(fin.totalShareCapital)} subtitle={`${fin.totalShares?.toLocaleString() ?? 0} shares`} color="green"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
          <KPICard title="Loan Portfolio" value={f(fin.totalOutstandingLoans)} subtitle={`${fin.activeLoanCount ?? 0} active loans`} color="purple"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} />
          <KPICard title="Lending Capacity" value={f(fin.remainingLendingCapacity)} subtitle={`${p(fin.lendingLimitPercentage)} of limit`} color="orange"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
        </div>
      )}

      {/* Navigation + Financial Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Financial asset snapshot */}
        {canFin && fin && (
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-gray-100/60">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Financial Snapshot</h2>
              <Link href="/dashboard/reports/financial" className="text-xs text-blue-600 hover:underline">Full report →</Link>
            </div>
            {/* Asset composition bars */}
            {(() => {
              const totalAssets = (fin.totalSavings ?? 0) + (fin.totalShareCapital ?? 0);
              const bars = [
                { label: 'Regular Savings', value: fin.totalRegularSavings ?? 0, color: '#3b82f6' },
                { label: 'Non-Regular Savings', value: fin.totalNonRegularSavings ?? 0, color: '#8b5cf6' },
                { label: 'Share Capital', value: fin.totalShareCapital ?? 0, color: '#22c55e' },
                { label: 'Outstanding Loans', value: fin.totalOutstandingLoans ?? 0, color: '#f97316' },
              ];
              return (
                <div className="space-y-3 mb-6">
                  {bars.map(({ label, value, color }) => {
                    const pctVal = totalAssets > 0 ? Math.min((value / totalAssets) * 100, 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span className="font-medium">{label}</span>
                          <span className="text-gray-500">{f(value)} <span className="text-gray-400">({pctVal.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctVal}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {/* Liquidity + lending */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Liquidity Ratio</p>
                <p className={`text-base font-bold ${(fin.liquidityRatio ?? 0) > 0.5 ? 'text-emerald-600' : 'text-amber-600'}`}>{p(fin.liquidityRatio)}</p>
              </div>
              <div className="text-center border-x border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Remaining Capacity</p>
                <p className="text-base font-bold text-blue-600">{f(fin.remainingLendingCapacity)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Compliance</p>
                <p className={`text-base font-bold ${fin.withinLendingLimit ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fin.withinLendingLimit ? 'Compliant' : 'Exceeded'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Navigation</h2>
            <span className="text-xs text-gray-400">Quick access</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {visibleNav.slice(0, 6).map((item) => (
              <NavTile key={item.href} label={item.label} href={item.href} icon={item.icon} sub={item.sub} />
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {(canLoans || canMembers) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {canLoans && loans && (
            <div className="p-6 rounded-2xl bg-white border border-gray-100/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Loan Portfolio</h3>
                <Link href="/dashboard/loans" className="text-xs text-blue-600 hover:underline">Manage →</Link>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">Repayment Rate</p>
                  <p className="text-xl font-bold text-emerald-700">{pct(loans.repaymentRate)}</p>
                </div>
                <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wide mb-1">Default Rate</p>
                  <p className={`text-xl font-bold ${(loans.defaultRate ?? 0) > 5 ? 'text-red-700' : 'text-gray-700'}`}>{pct(loans.defaultRate)}</p>
                </div>
              </div>
              {/* Pending action items */}
              {(pendingCount > 0 || appealCount > 0 || restructCount > 0) && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Needs Attention</p>
                  {pendingCount > 0 && (
                    <Link href="/dashboard/loans" className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
                      <span className="text-xs font-medium text-orange-700">Pending Applications</span>
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">{pendingCount}</span>
                    </Link>
                  )}
                  {appealCount > 0 && (
                    <Link href="/dashboard/loans" className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                      <span className="text-xs font-medium text-red-700">Pending Appeals</span>
                      <span className="text-xs font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">{appealCount}</span>
                    </Link>
                  )}
                  {restructCount > 0 && (
                    <Link href="/dashboard/loans" className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                      <span className="text-xs font-medium text-blue-700">Pending Restructurings</span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded-full">{restructCount}</span>
                    </Link>
                  )}
                </div>
              )}
              <div className="space-y-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">By Status</p>
                {Object.entries(loans.loansByStatus || {}).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <StatRow key={status} label={status.replace(/_/g, ' ')} value={String(count)} />
                ))}
              </div>
            </div>
          )}

          {canMembers && members && (
            <div className="p-6 rounded-2xl bg-white border border-gray-100/60">
              <h3 className="text-base font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>Membership Overview</h3>
              <div className="space-y-0">
                <StatRow label="Total Members" value={String(members.totalMembers)} bold />
                <StatRow label="Active Members" value={String(members.activeMembers)} accent />
                <StatRow label="New This Month" value={String(members.newMembersThisMonth)} accent />
                <StatRow label="Suspended" value={String(members.suspendedMembers)} warn />
              </div>
              {members.suspensionsByReason && Object.keys(members.suspensionsByReason).length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Suspension Reasons</p>
                  {Object.entries(members.suspensionsByReason).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => (
                    <StatRow key={reason} label={reason.replace(/_/g, ' ')} value={String(count)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compliance Warnings */}
      {canAlerts && (missedDeposits.length > 0 || missedRepayments.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>Compliance Warnings</h2>
            <span className="text-xs text-gray-400">— {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Missed Deposits */}
            {missedDeposits.length > 0 && (
              <div className="rounded-2xl bg-white border border-amber-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <p className="text-sm font-semibold text-amber-800">Missed Monthly Deposits</p>
                  </div>
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    {missedDeposits.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {missedDeposits.map((alert) => (
                    <Link
                      key={alert.memberId}
                      href={`/dashboard/members/${alert.memberId}`}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{alert.memberName}</p>
                        <p className="text-xs text-gray-400 font-mono">{alert.memberCode}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        alert.deductionStatus === 'FAILED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {alert.deductionStatus}
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="px-5 py-2 border-t border-gray-100 bg-gray-50">
                  <Link href="/dashboard/payroll" className="text-xs text-blue-600 hover:underline">
                    Go to Payroll →
                  </Link>
                </div>
              </div>
            )}

            {/* Missed Repayments */}
            {missedRepayments.length > 0 && (
              <div className="rounded-2xl bg-white border border-red-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-red-50 border-b border-red-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <p className="text-sm font-semibold text-red-800">Missed Loan Repayments</p>
                  </div>
                  <span className="text-xs font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
                    {missedRepayments.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {missedRepayments.map((alert) => (
                    <Link
                      key={alert.loanId}
                      href={`/dashboard/loans/${alert.loanId}`}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{alert.memberName}</p>
                        <p className="text-xs text-gray-400 font-mono">{alert.loanCode} · {alert.memberCode}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-red-700">
                          ETB {Number(alert.outstandingAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-gray-400">outstanding</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="px-5 py-2 border-t border-gray-100 bg-gray-50">
                  <Link href="/dashboard/loans" className="text-xs text-blue-600 hover:underline">
                    Go to Loans →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
