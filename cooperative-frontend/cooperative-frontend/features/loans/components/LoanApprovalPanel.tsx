'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { CircularProgress } from '@mui/material';
import {
  useGetPendingApplicationsQuery,
  useApproveApplicationMutation,
  useRejectApplicationMutation,
  useStartReviewMutation,
  useSkipApplicationMutation,
  useUnskipApplicationMutation,
  useRequestSkipMutation,
} from '../loansApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { CollateralForm } from '@/features/collateral/components/CollateralForm';
import { DocumentManager } from '@/features/documents/components/DocumentManager';
import { Pagination } from '@/components/common/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/constants/app';
import type { LoanApplication } from '@/types';

type SortField = 'queuePosition' | 'submissionDate' | 'requestedAmount' | 'loanDurationMonths';

export function LoanApprovalPanel() {
  const { data, isLoading } = useGetPendingApplicationsQuery();
  const [approve, { isLoading: approving }] = useApproveApplicationMutation();
  const [startReview] = useStartReviewMutation();
  const [reject, { isLoading: rejecting }] = useRejectApplicationMutation();
  const [skipApp, { isLoading: skipping }] = useSkipApplicationMutation();
  const [unskipApp, { isLoading: unskipping }] = useUnskipApplicationMutation();
  const [requestSkip, { isLoading: requestingSkip }] = useRequestSkipMutation();

  const { hasAnyRole } = useAuth();
  const isManager = hasAnyRole([ROLES.MANAGER]);
  const isLoanOfficer = hasAnyRole([ROLES.LOAN_OFFICER]);

  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [skipTarget, setSkipTarget] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [skipReasonError, setSkipReasonError] = useState('');
  const [skipRequestTarget, setSkipRequestTarget] = useState<string | null>(null);
  const [skipRequestReason, setSkipRequestReason] = useState('');
  const [skipRequestReasonError, setSkipRequestReasonError] = useState('');
  const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);
  // Per-application queue blocking error
  const [queueBlockErrors, setQueueBlockErrors] = useState<Record<string, string>>({});

  // Client-side sort + pagination — default sort by queuePosition ascending
  const [sortField, setSortField] = useState<SortField>('queuePosition');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const pageSize = 5;

  const applications = data ?? [];

  const sorted = useMemo(() => {
    return [...applications].sort((a, b) => {
      let av: any;
      let bv: any;
      if (sortField === 'queuePosition') {
        av = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
        bv = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
      } else if (sortField === 'submissionDate') {
        av = new Date(a.submissionDate).getTime();
        bv = new Date(b.submissionDate).getTime();
      } else {
        av = Number((a as any)[sortField] ?? 0);
        bv = Number((b as any)[sortField] ?? 0);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [applications, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'queuePosition' ? 'asc' : 'desc'); }
    setPage(0);
  };

  const sortIcon = (field: SortField) => {
    if (field !== sortField) return <span className="ml-0.5 text-gray-300 text-xs">↕</span>;
    return <span className="ml-0.5 text-blue-500 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const clearSkipForms = () => {
    setSkipTarget(null); setSkipReason(''); setSkipReasonError('');
    setSkipRequestTarget(null); setSkipRequestReason(''); setSkipRequestReasonError('');
  };

  const closeModal = () => {
    setSelectedApp(null);
    setApproveTarget(null);
    setRejectTarget(null);
    setRejectReason('');
    setRejectError('');
    clearSkipForms();
  };

  useEffect(() => {
    if (!selectedApp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [selectedApp]);

  const handleApprove = async (app: LoanApplication) => {
    try {
      if ((app.status as string) === 'PENDING') await startReview(app.id).unwrap();
      await approve(app.id).unwrap();
      toastSuccess('Loan application approved');
      setApproveTarget(null);
      setQueueBlockErrors(prev => { const n = { ...prev }; delete n[app.id]; return n; });
    } catch (e: any) {
      const msg: string = e?.data?.message ?? 'Failed to approve application';
      if (msg.includes('queue position') || e?.data?.status === 422) {
        setQueueBlockErrors(prev => ({ ...prev, [app.id]: msg }));
      } else {
        toastError(msg);
      }
      setApproveTarget(null);
    }
  };

  const handleReject = async (app: LoanApplication) => {
    if (!rejectReason.trim()) { setRejectError('Rejection reason is required'); return; }
    try {
      if ((app.status as string) === 'PENDING') await startReview(app.id).unwrap();
      await reject({ id: app.id, reason: rejectReason }).unwrap();
      toastSuccess('Application rejected');
      setRejectTarget(null); setRejectReason(''); setRejectError('');
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to reject application'); }
  };

  const handleSkip = async (app: LoanApplication) => {
    if (skipReason.trim().length < 10) {
      setSkipReasonError('Skip reason must be at least 10 characters');
      return;
    }
    try {
      await skipApp({ id: app.id, reason: skipReason.trim() }).unwrap();
      toastSuccess('Application skipped');
      clearSkipForms();
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to skip application'); }
  };

  const handleUnskip = async (app: LoanApplication) => {
    try {
      await unskipApp(app.id).unwrap();
      toastSuccess('Application restored to PENDING');
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to un-skip application'); }
  };

  const handleRequestSkip = async (app: LoanApplication) => {
    if (skipRequestReason.trim().length < 10) {
      setSkipRequestReasonError('Skip reason must be at least 10 characters');
      return;
    }
    try {
      await requestSkip({ id: app.id, reason: skipRequestReason.trim() }).unwrap();
      toastSuccess('Skip request submitted');
      clearSkipForms();
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to submit skip request'); }
  };

  if (isLoading) return <div className="flex justify-center py-8"><CircularProgress size={24} /></div>;

  if (applications.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No pending applications</div>;
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-gray-100 text-gray-600',
      UNDER_REVIEW: 'bg-blue-100 text-blue-700',
      SKIP_REQUESTED: 'bg-amber-100 text-amber-700',
      SKIPPED: 'bg-red-100 text-red-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Document reminder */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-xs text-amber-800">Ensure all required documents (ID copy, employment letter, collateral proof) are uploaded before approving.</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th
                className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={() => handleSort('queuePosition')}
              >
                Queue # {sortIcon('queuePosition')}
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">ID</th>
              <th
                className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={() => handleSort('requestedAmount')}
              >
                Amount {sortIcon('requestedAmount')}
              </th>
              <th
                className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={() => handleSort('loanDurationMonths')}
              >
                Duration {sortIcon('loanDurationMonths')}
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
              <th
                className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={() => handleSort('submissionDate')}
              >
                Submitted {sortIcon('submissionDate')}
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map((app) => (
              <tr
                key={app.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedApp(app);
                  setApproveTarget(null);
                  setRejectTarget(null);
                  clearSkipForms();
                }}
              >
                <td className="px-4 py-2.5 font-semibold text-blue-700 text-sm">
                  {app.queuePosition != null ? `#${app.queuePosition}` : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{app.id.slice(0, 8)}…</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800">ETB {Number(app.requestedAmount).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-gray-600">{app.loanDurationMonths}mo</td>
                <td className="px-4 py-2.5">{statusBadge(app.status as string)}</td>
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                  {app.submissionDate ? new Date(app.submissionDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  {(app.status as string) !== 'SKIPPED' && (
                    <div className="flex gap-1.5 justify-end flex-wrap">
                      {(app.status as string) !== 'SKIP_REQUESTED' && (
                        <>
                          <button
                            onClick={() => { setSelectedApp(app); setApproveTarget(app.id); setRejectTarget(null); clearSkipForms(); }}
                            disabled={approving}
                            className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setSelectedApp(app); setRejectTarget(app.id); setApproveTarget(null); clearSkipForms(); setRejectReason(''); setRejectError(''); }}
                            className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {isManager && (app.status as string) !== 'SKIP_REQUESTED' && (
                        <button
                          onClick={() => { setSelectedApp(app); setSkipTarget(app.id); setApproveTarget(null); setRejectTarget(null); setSkipRequestTarget(null); }}
                          className="px-2.5 py-1 rounded-md bg-orange-500 text-white text-xs font-medium hover:bg-orange-600"
                        >
                          Skip
                        </button>
                      )}
                      {isLoanOfficer && (app.status as string) !== 'SKIP_REQUESTED' && (
                        <button
                          onClick={() => { setSelectedApp(app); setSkipRequestTarget(app.id); setApproveTarget(null); setRejectTarget(null); setSkipTarget(null); }}
                          className="px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
                        >
                          Request Skip
                        </button>
                      )}
                    </div>
                  )}
                  {(app.status as string) === 'SKIPPED' && isManager && (
                    <button
                      onClick={() => handleUnskip(app)}
                      disabled={unskipping}
                      className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {unskipping ? '...' : 'Un-skip'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalElements={sorted.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={() => {}}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ── Detail Modal ── */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Application #{selectedApp.id.slice(0, 8)}…</h2>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(selectedApp.status as string)}
                  <span className="text-sm text-gray-500">
                    Queue {selectedApp.queuePosition != null ? `#${selectedApp.queuePosition}` : '—'}
                  </span>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Details grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Requested Amount</p>
                  <p className="text-sm font-bold text-gray-800">ETB {Number(selectedApp.requestedAmount).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Duration</p>
                  <p className="text-sm font-bold text-gray-800">{selectedApp.loanDurationMonths} months</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Submitted</p>
                  <p className="text-sm font-bold text-gray-800">
                    {selectedApp.submissionDate ? new Date(selectedApp.submissionDate).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Member ID</p>
                  <p className="text-sm font-bold text-gray-800 font-mono">{selectedApp.memberId?.slice(0, 12) ?? '—'}</p>
                </div>
              </div>

              {/* Queue blocking error banner */}
              {queueBlockErrors[selectedApp.id] && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-300">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-red-700 font-medium">{queueBlockErrors[selectedApp.id]}</p>
                  <button
                    onClick={() => setQueueBlockErrors(prev => { const n = { ...prev }; delete n[selectedApp.id]; return n; })}
                    className="ml-auto text-red-400 hover:text-red-600 text-xs"
                  >✕</button>
                </div>
              )}

              {/* Skip history */}
              {((selectedApp.status as string) === 'SKIPPED' || ((selectedApp.status as string) === 'PENDING' && selectedApp.skipReason)) && selectedApp.skipReason && (
                <div className="px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800">
                  <p className="font-semibold mb-0.5">
                    {(selectedApp.status as string) === 'SKIPPED' ? 'Skipped' : 'Previously skipped'} by {selectedApp.skippedBy}
                  </p>
                  <p>Reason: {selectedApp.skipReason}</p>
                  {selectedApp.skippedAt && <p className="text-orange-600 mt-0.5">{new Date(selectedApp.skippedAt).toLocaleString()}</p>}
                  {(selectedApp.status as string) === 'PENDING' && (
                    <p className="text-green-700 font-semibold mt-1">✓ Un-skipped — back in queue at position #{selectedApp.queuePosition}</p>
                  )}
                </div>
              )}

              {/* Skip request info */}
              {(selectedApp.status as string) === 'SKIP_REQUESTED' && (
                <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <p className="font-semibold mb-0.5">Skip requested by {selectedApp.skipRequestedBy}</p>
                  <p>Reason: {selectedApp.skipRequestReason}</p>
                  {selectedApp.skipRequestedAt && <p className="text-amber-600 mt-0.5">{new Date(selectedApp.skipRequestedAt).toLocaleString()}</p>}
                </div>
              )}

              {/* Approve confirmation */}
              {approveTarget === selectedApp.id && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-xs font-semibold text-green-800 mb-2">
                    Confirm approval of ETB {Number(selectedApp.requestedAmount).toLocaleString()} for {selectedApp.loanDurationMonths} months?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(selectedApp)}
                      disabled={approving}
                      className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {approving && <CircularProgress size={10} color="inherit" />}
                      {approving ? 'Approving...' : 'Confirm Approve'}
                    </button>
                    <button onClick={() => setApproveTarget(null)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* Reject form */}
              {rejectTarget === selectedApp.id && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs font-semibold text-red-800 mb-2">Rejection reason</p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => { setRejectReason(e.target.value); setRejectError(''); }}
                    rows={2}
                    placeholder="Reason for rejection..."
                    className="w-full px-3 py-2 rounded-md border border-red-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none bg-white"
                  />
                  {rejectError && <p className="text-xs text-red-500 mt-1">{rejectError}</p>}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleReject(selectedApp)} disabled={rejecting} className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                      {rejecting ? 'Rejecting...' : 'Confirm Reject'}
                    </button>
                    <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* Skip form (MANAGER) */}
              {skipTarget === selectedApp.id && (
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-xs font-semibold text-orange-800 mb-2">Skip application — provide a reason</p>
                  <textarea
                    value={skipReason}
                    onChange={(e) => { setSkipReason(e.target.value); if (e.target.value.trim().length >= 10) setSkipReasonError(''); }}
                    rows={2}
                    placeholder="Reason for skipping (min 10 characters)..."
                    className="w-full px-3 py-2 rounded-md border border-orange-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none bg-white"
                  />
                  {skipReasonError && <p className="text-xs text-red-500 mt-1">{skipReasonError}</p>}
                  <p className="text-xs text-gray-400 mt-1">{skipReason.trim().length}/10 min characters</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleSkip(selectedApp)} disabled={skipping} className="px-3 py-1.5 rounded-md bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-50">
                      {skipping ? 'Skipping...' : 'Confirm Skip'}
                    </button>
                    <button onClick={() => { setSkipTarget(null); setSkipReason(''); }} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* Skip request form (LOAN_OFFICER) */}
              {skipRequestTarget === selectedApp.id && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Request skip — provide a reason for the manager</p>
                  <textarea
                    value={skipRequestReason}
                    onChange={(e) => { setSkipRequestReason(e.target.value); if (e.target.value.trim().length >= 10) setSkipRequestReasonError(''); }}
                    rows={2}
                    placeholder="Reason for skip request (min 10 characters)..."
                    className="w-full px-3 py-2 rounded-md border border-amber-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none bg-white"
                  />
                  {skipRequestReasonError && <p className="text-xs text-red-500 mt-1">{skipRequestReasonError}</p>}
                  <p className="text-xs text-gray-400 mt-1">{skipRequestReason.trim().length}/10 min characters</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleRequestSkip(selectedApp)} disabled={requestingSkip} className="px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50">
                      {requestingSkip ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button onClick={() => { setSkipRequestTarget(null); setSkipRequestReason(''); }} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {/* Collateral + Documents */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Collateral</p>
                  <CollateralForm applicationId={selectedApp.id} memberId={selectedApp.memberId} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</p>
                  <DocumentManager entityType="LOAN_APPLICATION" entityId={selectedApp.id} canDelete={true} />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}