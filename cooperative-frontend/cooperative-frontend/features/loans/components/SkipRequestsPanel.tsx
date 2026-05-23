'use client';

import React, { useState } from 'react';
import { CircularProgress } from '@mui/material';
import {
  useGetPendingSkipRequestsQuery,
  useApproveSkipRequestMutation,
  useRejectSkipRequestMutation,
} from '../loansApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { Pagination } from '@/components/common/Pagination';
import type { LoanApplication } from '@/types';

export function SkipRequestsPanel() {
  const { data: requests = [], isLoading } = useGetPendingSkipRequestsQuery();
  const [approveSkip, { isLoading: approving }] = useApproveSkipRequestMutation();
  const [rejectSkip, { isLoading: rejecting }] = useRejectSkipRequestMutation();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const [actionTarget, setActionTarget] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);

  const [page, setPage] = useState(0);
  const pageSize = 5;
  const totalPages = Math.ceil(requests.length / pageSize);
  const paged = requests.slice(page * pageSize, (page + 1) * pageSize);

  const clearForms = () => {
    setActionTarget(null);
    setApproveNote('');
    setRejectReason('');
    setRejectReasonError('');
  };

  const handleApprove = async (app: LoanApplication) => {
    try {
      await approveSkip({ id: app.id, note: approveNote.trim() || undefined }).unwrap();
      toastSuccess('Skip request approved');
      clearForms();
      setExpandedId(null);
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to approve skip request');
    }
  };

  const handleReject = async (app: LoanApplication) => {
    if (rejectReason.trim().length < 10) {
      setRejectReasonError('Rejection reason must be at least 10 characters');
      return;
    }
    try {
      await rejectSkip({ id: app.id, reason: rejectReason.trim() }).unwrap();
      toastSuccess('Skip request rejected');
      clearForms();
      setExpandedId(null);
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to reject skip request');
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><CircularProgress size={24} /></div>;

  if (requests.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No pending skip requests</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Queue #</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Application ID</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Requested By</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Reason</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Submitted</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {paged.map((app: LoanApplication) => (
            <React.Fragment key={app.id}>
              <tr
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => { setExpandedId(expandedId === app.id ? null : app.id); clearForms(); }}
              >
                <td className="px-4 py-2.5 font-semibold text-blue-700 text-sm">
                  {app.queuePosition != null ? `#${app.queuePosition}` : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{app.id.slice(0, 8)}…</td>
                <td className="px-4 py-2.5 text-gray-700 text-xs">{app.skipRequestedBy ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[200px] truncate">{app.skipRequestReason ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                  {app.skipRequestedAt ? new Date(app.skipRequestedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  {actionTarget?.id !== app.id && (
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => { setActionTarget({ id: app.id, action: 'approve' }); setExpandedId(app.id); }}
                        className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => { setActionTarget({ id: app.id, action: 'reject' }); setExpandedId(app.id); }}
                        className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>

              {expandedId === app.id && (
                <tr key={`${app.id}-detail`}>
                  <td colSpan={6} className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    {/* Full reason */}
                    <div className="mb-3 text-xs text-gray-700">
                      <span className="font-semibold text-gray-500 uppercase tracking-wide">Skip reason: </span>
                      {app.skipRequestReason}
                    </div>

                    {/* Approve form */}
                    {actionTarget?.id === app.id && actionTarget.action === 'approve' && (
                      <div className="p-3 rounded-lg bg-green-50 border border-green-200 mb-2">
                        <p className="text-xs font-semibold text-green-800 mb-2">Approve skip request</p>
                        <input
                          type="text"
                          value={approveNote}
                          onChange={(e) => setApproveNote(e.target.value)}
                          placeholder="Optional note..."
                          className="w-full px-3 py-2 rounded-md border border-green-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(app)}
                            disabled={approving}
                            className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {approving && <CircularProgress size={10} color="inherit" />}
                            {approving ? 'Approving...' : 'Confirm Approve'}
                          </button>
                          <button onClick={clearForms} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Reject form */}
                    {actionTarget?.id === app.id && actionTarget.action === 'reject' && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-2">
                        <p className="text-xs font-semibold text-red-800 mb-2">Reject skip request — provide a reason</p>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => { setRejectReason(e.target.value); if (e.target.value.trim().length >= 10) setRejectReasonError(''); }}
                          rows={2}
                          placeholder="Rejection reason (min 10 characters)..."
                          className="w-full px-3 py-2 rounded-md border border-red-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none bg-white"
                        />
                        {rejectReasonError && <p className="text-xs text-red-500 mt-1">{rejectReasonError}</p>}
                        <p className="text-xs text-gray-400 mt-1">{rejectReason.trim().length}/10 min characters</p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleReject(app)}
                            disabled={rejecting}
                            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {rejecting && <CircularProgress size={10} color="inherit" />}
                            {rejecting ? 'Rejecting...' : 'Confirm Reject'}
                          </button>
                          <button onClick={clearForms} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">Cancel</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalElements={requests.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={() => {}}
        pageSizeOptions={[5, 10, 20]}
      />
    </div>
  );
}
