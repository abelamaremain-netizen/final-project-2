'use client';

import { useState, useEffect, useMemo } from 'react';
import { useGetAllLoansQuery } from '@/features/loans/loansApi';
import { LoanApplicationForm } from '@/features/loans/components/LoanApplicationForm';
import { LoanApprovalPanel } from '@/features/loans/components/LoanApprovalPanel';
import { LoanDisbursementPanel } from '@/features/loans/components/LoanDisbursementPanel';
import { RestructuringQueuePanel } from '@/features/loans/components/RestructuringQueuePanel';
import { SkipRequestsPanel } from '@/features/loans/components/SkipRequestsPanel';
import { ExternalCollateralApprovalPanel } from '@/features/loans/components/ExternalCollateralApprovalPanel';
import { AppealReviewPanel } from '@/features/loans/components/AppealReviewPanel';
import { useGetDeniedApplicationsQuery } from '@/features/loans/loansApi';
import { LoanStatus, Loan, LoanApplication } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/constants/app';
import { Pagination } from '@/components/common/Pagination';
import { exportToCsv } from '@/lib/exportCsv';

const statusColors: Record<string, string> = {
  [LoanStatus.ACTIVE]: 'bg-green-100 text-green-700 border border-green-200',
  [LoanStatus.PAID_OFF]: 'bg-blue-100 text-blue-700 border border-blue-200',
  [LoanStatus.DEFAULTED]: 'bg-red-100 text-red-700 border border-red-200',
  [LoanStatus.DISBURSED]: 'bg-purple-100 text-purple-700 border border-purple-200',
  [LoanStatus.APPROVED]: 'bg-amber-100 text-amber-700 border border-amber-200',
  PENDING: 'bg-gray-100 text-gray-600 border border-gray-200',
  DENIED: 'bg-red-100 text-red-700 border border-red-200',
};

export default function LoansPage() {
  const [tab, setTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('approvalDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [mounted, setMounted] = useState(false);
  const { hasAnyRole } = useAuth();

  useEffect(() => setMounted(true), []);

  const canViewLoans = mounted && hasAnyRole([ROLES.MANAGER, ROLES.LOAN_OFFICER, ROLES.ACCOUNTANT]);
  const canApprove = mounted && hasAnyRole([ROLES.MANAGER]);
  const canApply = mounted && hasAnyRole([ROLES.MANAGER, ROLES.LOAN_OFFICER]);
  const canViewDenied = mounted && hasAnyRole([ROLES.MANAGER, ROLES.LOAN_OFFICER, ROLES.ACCOUNTANT]);

  const { data, isLoading } = useGetAllLoansQuery({
    page, size: pageSize,
    status: statusFilter || undefined,
    sort: `${sortField},${sortDir}`,
  }, { skip: !canViewLoans });

  const loans = data?.content ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  const { data: deniedApps = [] } = useGetDeniedApplicationsQuery(undefined, { skip: !canViewDenied });
  const [deniedSort, setDeniedSort] = useState<'submissionDate' | 'requestedAmount'>('submissionDate');
  const [deniedDir, setDeniedDir] = useState<'asc' | 'desc'>('desc');
  const [deniedPage, setDeniedPage] = useState(0);
  const deniedPageSize = 5;

  const sortedDenied = useMemo(() => {
    return [...deniedApps].sort((a, b) => {
      if (deniedSort === 'submissionDate') {
        const av = new Date(a.submissionDate ?? 0).getTime();
        const bv = new Date(b.submissionDate ?? 0).getTime();
        return deniedDir === 'asc' ? av - bv : bv - av;
      }
      return deniedDir === 'asc'
        ? Number(a.requestedAmount ?? 0) - Number(b.requestedAmount ?? 0)
        : Number(b.requestedAmount ?? 0) - Number(a.requestedAmount ?? 0);
    });
  }, [deniedApps, deniedSort, deniedDir]);

  const deniedTotalPages = Math.ceil(sortedDenied.length / deniedPageSize);
  const pagedDenied = sortedDenied.slice(deniedPage * deniedPageSize, (deniedPage + 1) * deniedPageSize);

  const visibleTabs = [
    'All Loans',
    ...(canApply ? ['Apply'] : []),
    ...(canApprove ? ['Pending Approval', 'Disbursement', 'Restructuring Queue', 'Skip Requests', 'External Collateral', 'Appeal Review'] : []),
    'Denied Applications',
  ];

  const handleSort = (field: string) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(0);
  };

  const sortIcon = (field: string) => {
    if (field !== sortField) return <span className="ml-1 text-gray-400 text-xs">↕</span>;
    return <span className="ml-1 text-blue-600 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const columns = [
    { label: 'Code', field: null },
    { label: 'Principal', field: 'principalAmount' },
    { label: 'Outstanding', field: 'outstandingPrincipal' },
    { label: 'Rate', field: 'interestRate' },
    { label: 'Duration', field: 'durationMonths' },
    { label: 'Disbursed', field: 'disbursementDate' },
    { label: 'Status', field: 'status' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Loans</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage loan applications, approvals, and disbursements</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {visibleTabs.map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === i ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
            <div className="relative w-[130px]">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                className="w-full appearance-none px-2 py-1.5 pr-6 rounded-md border border-gray-300 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                {Object.values(LoanStatus).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
            </div>
            {totalElements > 0 && (
              <span className="text-xs text-gray-400">{totalElements} loans</span>
            )}
            <button
              onClick={() => exportToCsv(loans as unknown as Record<string, unknown>[], 'loans', [
                { key: 'code', label: 'Loan Code' },
                { key: 'memberId', label: 'Member ID' },
                { key: 'principalAmount', label: 'Principal' },
                { key: 'outstandingPrincipal', label: 'Outstanding' },
                { key: 'interestRate', label: 'Interest Rate' },
                { key: 'durationMonths', label: 'Duration (months)' },
                { key: 'disbursementDate', label: 'Disbursed' },
                { key: 'approvalDate', label: 'Approved' },
                { key: 'status', label: 'Status' },
              ])}
              disabled={loans.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors ml-auto"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : loans.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">No loans found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {columns.map(({ label, field }) => (
                      <th
                        key={label}
                        onClick={() => field && handleSort(field)}
                        className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap ${
                          field ? 'cursor-pointer hover:text-gray-900 select-none' : ''
                        }`}
                      >
                        {label}{field && sortIcon(field)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.map((loan: Loan) => {
                    const principal = typeof loan.principalAmount === 'object' ? (loan.principalAmount as any).amount : loan.principalAmount;
                    const outstanding = typeof loan.outstandingPrincipal === 'object' ? (loan.outstandingPrincipal as any).amount : loan.outstandingPrincipal;
                    return (
                      <tr
                        key={loan.id}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                        onClick={() => window.location.href = `/dashboard/loans/${loan.id}`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600 font-medium">{loan.code}</td>
                        <td className="px-3 py-2.5 font-semibold text-gray-900">ETB {Number(principal).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-gray-700">ETB {Number(outstanding).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-gray-700">{loan.interestRate}%</td>
                        <td className="px-3 py-2.5 text-gray-700">{loan.durationMonths}mo</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          {loan.disbursementDate ? new Date(loan.disbursementDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[loan.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {loan.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          />
        </div>
      )}

      {tab === 1 && canApply && (
        <div className="flex justify-center">
          <div className="w-full max-w-xl">
            <LoanApplicationForm onSuccess={() => setTab(0)} />
          </div>
        </div>
      )}

      {tab === visibleTabs.indexOf('Pending Approval') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Pending Applications</h2>
          <LoanApprovalPanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('Disbursement') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Ready for Disbursement</h2>
          <LoanDisbursementPanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('Restructuring Queue') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Pending Restructuring Requests</h2>
          <RestructuringQueuePanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('Skip Requests') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Pending Skip Requests</h2>
          <p className="text-xs text-gray-500 mb-4">Loan officers have requested these applications be skipped — review and approve or reject.</p>
          <SkipRequestsPanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('External Collateral') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Pending External Cooperative Collaterals</h2>
          <p className="text-xs text-gray-500 mb-4">External cooperative collaterals require manager approval before counting toward loan coverage.</p>
          <ExternalCollateralApprovalPanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('Appeal Review') && canApprove && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Appeal Review Queue</h2>
          <p className="text-xs text-gray-500 mb-4">Denied applications that members have appealed — pick up, review, and decide.</p>
          <AppealReviewPanel />
        </div>
      )}

      {tab === visibleTabs.indexOf('Denied Applications') && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Denied Applications</h2>
              <p className="text-xs text-gray-500 mt-0.5">Applications that were denied — eligible for appeal</p>
            </div>
            <span className="text-xs text-gray-400">{deniedApps.length} total</span>
          </div>
          {deniedApps.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">No denied applications</div>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">ID</th>
                    <th
                      className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => { setDeniedSort('requestedAmount'); setDeniedDir(d => deniedSort === 'requestedAmount' ? (d === 'asc' ? 'desc' : 'asc') : 'desc'); setDeniedPage(0); }}
                    >
                      Amount {deniedSort === 'requestedAmount' ? (deniedDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Duration</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Reason</th>
                    <th
                      className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => { setDeniedSort('submissionDate'); setDeniedDir(d => deniedSort === 'submissionDate' ? (d === 'asc' ? 'desc' : 'asc') : 'desc'); setDeniedPage(0); }}
                    >
                      Submitted {deniedSort === 'submissionDate' ? (deniedDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedDenied.map((app: LoanApplication) => (
                    <tr
                      key={app.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => window.location.href = `/dashboard/loans/applications/${app.id}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{app.id.slice(0, 8)}…</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-800">ETB {Number(app.requestedAmount).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-gray-600">{app.loanDurationMonths}mo</td>
                      <td className="px-3 py-2.5 text-xs text-red-600 max-w-[160px] truncate">{app.denialReason ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {app.submissionDate ? new Date(app.submissionDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => window.location.href = `/dashboard/loans/applications/${app.id}`}
                          className="px-2.5 py-1 rounded bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={deniedPage}
                totalPages={deniedTotalPages}
                totalElements={sortedDenied.length}
                pageSize={deniedPageSize}
                onPageChange={setDeniedPage}
                onPageSizeChange={() => {}}
                pageSizeOptions={[5, 10, 20]}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}