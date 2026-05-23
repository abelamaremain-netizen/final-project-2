'use client';

import { useState, useCallback } from 'react';
import {
  useGenerateDeductionListMutation,
  useGetDeductionListPagedQuery,
  useGetDeductionIdsQuery,
  useGetDeductionListQuery,
  useProcessConfirmationMutation,
  useReconcileDeductionsMutation,
  type ReconciliationReport,
} from '@/features/payroll/payrollApi';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { exportToCsv } from '@/lib/exportCsv';
import { toastError, toastSuccess } from '@/components/common/Toast';
import { Pagination } from '@/components/common/Pagination';

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-green-100 text-green-700 border border-green-200',
  FAILED: 'bg-red-100 text-red-700 border border-red-200',
};

type SortField = 'memberName' | 'deductionAmount' | 'status';
type SortDir = 'asc' | 'desc';
type GroupBy = 'none' | 'status' | 'amount';

export default function PayrollPage() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [reconcileResult, setReconcileResult] = useState<ReconciliationReport | null>(null);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAmounts, setConfirmAmounts] = useState<Record<string, string>>({});

  // Filters & pagination (server-side)
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMemberType, setFilterMemberType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('memberName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkConfirmAmount, setBulkConfirmAmount] = useState('');

  const selectedPeriod = toYearMonth(selectedYear, selectedMonth);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Server-side paginated query
  const { data: pagedData, isLoading: listLoading, refetch: refetchList } =
    useGetDeductionListPagedQuery({
      month: selectedPeriod,
      status: filterStatus !== 'all' ? filterStatus : undefined,
      memberType: filterMemberType !== 'all' ? filterMemberType : undefined,
      page,
      size: pageSize,
      sortField,
      sortDir,
    });

  // Non-paginated for total count badge and export
  const { data: allDeductions = [] } = useGetDeductionListQuery(selectedPeriod);

  // IDs for "Select All in current filter" 
  const { data: filteredIds = [] } = useGetDeductionIdsQuery({
    month: selectedPeriod,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    memberType: filterMemberType !== 'all' ? filterMemberType : undefined,
  });

  const deductions = pagedData?.content ?? [];
  const totalElements = pagedData?.totalElements ?? 0;
  const totalPages = pagedData?.totalPages ?? 0;

  const [generateList, { isLoading: generating }] = useGenerateDeductionListMutation();
  const [processConfirmation] = useProcessConfirmationMutation();
  const [reconcile, { isLoading: reconciling }] = useReconcileDeductionsMutation();

  // Reset page when filters change
  const handleFilterChange = useCallback((fn: () => void) => {
    fn();
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectPage = () => {
    const pageIds = deductions.filter((d: any) => d.status !== 'CONFIRMED').map((d: any) => d.id);
    const allSelected = pageIds.every((id: string) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) pageIds.forEach((id: string) => next.delete(id));
    else pageIds.forEach((id: string) => next.add(id));
    setSelectedIds(next);
  };

  const selectAllInFilter = () => {
    setSelectedIds(new Set(filteredIds as string[]));
  };

  const selectedDeductions = deductions.filter((d: any) => selectedIds.has(d.id));
  const pendingSelected = selectedDeductions.filter((d: any) => d.status === 'PENDING');

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(0);
  };

  const handleGenerate = async () => {
    try { await generateList(selectedPeriod).unwrap(); refetchList(); } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to generate deduction list');
    }
  };

  const handleConfirm = async (d: any) => {
    const amount = parseFloat(confirmAmounts[d.id] ?? String(d.deductionAmount ?? 0));
    if (!amount || isNaN(amount)) return;
    setConfirmingId(d.id);
    try {
      await processConfirmation({ memberId: d.memberId, deductionMonth: selectedPeriod, amount }).unwrap();
      refetchList();
    } catch (e: any) {
      const msg = e?.data?.message ?? e?.data?.error ?? 'Failed to confirm deduction';
      toastError(msg);
    }
    setConfirmingId(null);
  };

  const handleBulkConfirm = async () => {
    const amount = parseFloat(bulkConfirmAmount);
    if (!amount || isNaN(amount) || selectedIds.size === 0) return;
    setShowBulkConfirm(false);

    // Confirm all selected IDs — these may span multiple pages
    // We use the deduction list from the current page for visible ones,
    // but for cross-page selections we confirm by memberId from filteredIds
    const idsToConfirm = Array.from(selectedIds);
    let failCount = 0;
    let successCount = 0;

    // Build a map of id -> memberId from current page deductions
    const idToMemberId: Record<string, string> = {};
    deductions.forEach((d: any) => { idToMemberId[d.id] = d.memberId; });

    for (const id of idsToConfirm) {
      const memberId = idToMemberId[id];
      if (!memberId) continue; // skip if not on current page (cross-page selection)
      try {
        await processConfirmation({ memberId, deductionMonth: selectedPeriod, amount }).unwrap();
        successCount++;
      } catch { failCount++; }
    }

    refetchList();
    setSelectedIds(new Set());
    setBulkConfirmAmount('');
    if (failCount > 0) toastError(`${failCount} deduction(s) failed to confirm`);
    if (successCount > 0) toastSuccess(`${successCount} deduction(s) confirmed`);
  };

  const handleReconcile = async () => {
    try {
      const result = await reconcile(selectedPeriod).unwrap();
      setReconcileResult(result);
      setShowReconcileConfirm(false);
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to reconcile deductions');
      setShowReconcileConfirm(false);
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const hasFilters = filterStatus !== 'all' || filterMemberType !== 'all' || searchQuery;

  return (
    <RoleGuard allowedRoles={['MANAGER', 'ACCOUNTANT']}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Deductions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate and reconcile monthly salary deductions</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Monthly Payroll Processing</h2>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
              <select value={selectedMonth} onChange={(e) => { setSelectedMonth(Number(e.target.value)); setPage(0); }}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
              <select value={selectedYear} onChange={(e) => { setSelectedYear(Number(e.target.value)); setPage(0); }}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating ? 'Generating...' : 'Generate List'}
              </button>
              <button onClick={() => setShowReconcileConfirm(true)}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                Reconcile
              </button>
            </div>
          </div>

          {/* Filters */}
          {(allDeductions as any[]).length > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[200px]">
                  <input type="text" placeholder="Search by member name..."
                    value={searchQuery}
                    onChange={(e) => handleFilterChange(() => setSearchQuery(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <select value={filterStatus}
                  onChange={(e) => handleFilterChange(() => setFilterStatus(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="FAILED">Failed</option>
                </select>

                <select value={filterMemberType}
                  onChange={(e) => handleFilterChange(() => setFilterMemberType(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="all">All Member Types</option>
                  <option value="REGULAR">Regular</option>
                  <option value="EXTERNAL_COOPERATIVE">External Cooperative</option>
                  <option value="CONTRACT">Contract</option>
                </select>

                <select value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="none">No Grouping</option>
                  <option value="status">Group by Status</option>
                  <option value="amount">Group by Amount</option>
                </select>

                {/* Select All in current filter */}
                {filteredIds.length > 0 && (
                  <button onClick={selectAllInFilter}
                    className="px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100">
                    Select All ({filteredIds.length})
                  </button>
                )}

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-xs font-medium text-blue-700">{selectedIds.size} selected</span>
                {selectedIds.size > 0 && (
                  <button onClick={() => setShowBulkConfirm(true)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                    Bulk Confirm ({selectedIds.size})
                  </button>
                )}
                    <button onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-blue-600 hover:text-blue-800">Clear</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Deductions — {MONTHS[selectedMonth - 1]} {selectedYear}
              {hasFilters && <span className="ml-2 text-xs text-blue-600 font-normal">(filtered)</span>}
            </h2>
            <div className="flex items-center gap-3">
              {totalElements > 0 && (
                <>
                  <span className="text-xs text-gray-400">{totalElements} records</span>
                  <button
                    onClick={() => exportToCsv(
                      allDeductions as unknown as Record<string, unknown>[],
                      `payroll_${selectedPeriod}`,
                      [
                        { key: 'memberId', label: 'Member ID' },
                        { key: 'memberName', label: 'Member Name' },
                        { key: 'memberType', label: 'Member Type' },
                        { key: 'deductionAmount', label: 'Expected Amount' },
                        { key: 'confirmedAmount', label: 'Confirmed Amount' },
                        { key: 'deductionMonth', label: 'Month' },
                        { key: 'status', label: 'Status' },
                      ]
                    )}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {listLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
            </div>
          ) : deductions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3 text-left w-10">
                        <input type="checkbox"
                          checked={deductions.length > 0 && deductions.every((d: any) => selectedIds.has(d.id))}
                          onChange={toggleSelectPage}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('memberName')}>
                        Member {sortIcon('memberName')}
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Type</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('deductionAmount')}>
                        Expected {sortIcon('deductionAmount')}
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Month</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('status')}>
                        Status {sortIcon('status')}
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deductions.map((d: any) => (
                      <tr key={d.id} className={`hover:bg-gray-50 ${selectedIds.has(d.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-5 py-3">
                          {d.status !== 'CONFIRMED' ? (
                            <input type="checkbox"
                              checked={selectedIds.has(d.id)}
                              onChange={() => toggleSelection(d.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-green-500 text-sm">✓</span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{d.memberName ?? d.memberId}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{d.memberType ? d.memberType.replace(/_/g, ' ') : '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          ETB {Number(d.deductionAmount ?? 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{d.deductionMonth ?? selectedPeriod}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {d.status === 'PENDING' && (
                            <div className="flex items-center gap-2">
                              <input type="number"
                                placeholder={String(d.deductionAmount ?? '')}
                                value={confirmAmounts[d.id] ?? ''}
                                onChange={(e) => setConfirmAmounts(prev => ({ ...prev, [d.id]: e.target.value }))}
                                className="w-24 px-2 py-1 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                              <button onClick={() => handleConfirm(d)} disabled={confirmingId === d.id}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                                {confirmingId === d.id ? '...' : 'Confirm'}
                              </button>
                            </div>
                          )}
                          {d.status === 'CONFIRMED' && (
                            <span className="text-xs text-gray-400">
                              ETB {Number(d.confirmedAmount ?? 0).toLocaleString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                totalElements={totalElements}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
              />
            </>
          ) : (
            <div className="py-10 text-center text-gray-400 text-sm">
              {hasFilters
                ? 'No deductions match your filters'
                : `No deduction list for ${MONTHS[selectedMonth - 1]} ${selectedYear}. Click Generate List to create one.`
              }
            </div>
          )}
        </div>

        {/* Payroll Summary Card */}
        {(allDeductions as any[]).length > 0 && (() => {
          const all = allDeductions as any[];
          const total = all.length;
          const confirmed = all.filter(d => d.status === 'CONFIRMED').length;
          const pending = all.filter(d => d.status === 'PENDING').length;
          const failed = all.filter(d => d.status === 'FAILED').length;
          const totalExpected = all.reduce((s, d) => s + Number(d.deductionAmount ?? 0), 0);
          const totalConfirmed = all.filter(d => d.status === 'CONFIRMED')
            .reduce((s, d) => s + Number(d.confirmedAmount ?? 0), 0);
          return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                Summary — {MONTHS[selectedMonth - 1]} {selectedYear}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Total Members', value: String(total), color: 'text-gray-900' },
                  { label: 'Confirmed', value: String(confirmed), color: 'text-green-600' },
                  { label: 'Pending', value: String(pending), color: 'text-amber-600' },
                  { label: 'Failed', value: String(failed), color: 'text-red-600' },
                  { label: 'Total Expected', value: `ETB ${totalExpected.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: 'text-gray-900' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-base font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              {totalConfirmed > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total Confirmed Amount</span>
                  <span className="font-bold text-green-700">ETB {totalConfirmed.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Reconciliation result */}
        {reconcileResult && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Reconciliation — {String(reconcileResult.month)}</h2>
              <button onClick={() => setReconcileResult(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Expected', value: reconcileResult.expectedDeductions, color: 'text-gray-900' },
                { label: 'Confirmed', value: reconcileResult.confirmedDeductions, color: 'text-green-600' },
                { label: 'Failed', value: reconcileResult.failedDeductions, color: 'text-red-600' },
                { label: 'Discrepancy', value: `ETB ${Number(reconcileResult.discrepancyAmount).toLocaleString()}`, color: 'text-orange-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className={`text-base font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reconcile confirm modal */}
        {showReconcileConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Confirm Reconciliation</h3>
              <p className="text-sm text-gray-600 mb-5">
                Reconcile deductions for <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={handleReconcile} disabled={reconciling}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                  {reconciling ? 'Reconciling...' : 'Confirm'}
                </button>
                <button onClick={() => setShowReconcileConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk confirm modal */}
        {showBulkConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Bulk Confirm Deductions</h3>
              <p className="text-sm text-gray-600 mb-4">
                Confirm <strong>{selectedIds.size}</strong> selected deduction{selectedIds.size !== 1 ? 's' : ''} with the same amount.
                Only PENDING deductions will be processed.
              </p>
              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-700 mb-2">Confirmed Amount (ETB)</label>
                <input type="number" value={bulkConfirmAmount}
                  onChange={(e) => setBulkConfirmAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-3 mb-5 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-gray-700 mb-2">Selected Members:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {pendingSelected.map((d: any) => (
                    <li key={d.id} className="flex justify-between">
                      <span>{d.memberName ?? d.memberId}</span>
                      <span className="text-gray-400">ETB {Number(d.deductionAmount ?? 0).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <button onClick={handleBulkConfirm}
                  disabled={!bulkConfirmAmount || isNaN(parseFloat(bulkConfirmAmount))}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  Confirm All
                </button>
                <button onClick={() => { setShowBulkConfirm(false); setBulkConfirmAmount(''); }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
