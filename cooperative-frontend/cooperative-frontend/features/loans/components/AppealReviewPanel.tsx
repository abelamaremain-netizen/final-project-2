'use client';

import React, { useState } from 'react';
import { CircularProgress } from '@mui/material';
import {
  useGetPendingAppealsQuery,
  usePickUpAppealMutation,
  useRecordAppealDecisionMutation,
} from '@/features/loans/loansApi';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/constants/app';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { DocumentManager } from '@/features/documents/components/DocumentManager';

export function AppealReviewPanel() {
  const { hasAnyRole } = useAuth();
  const isManager = hasAnyRole([ROLES.MANAGER]);

  const { data: appeals, isLoading, refetch } = useGetPendingAppealsQuery();
  const [pickUp, { isLoading: pickingUp }] = usePickUpAppealMutation();
  const [recordDecision, { isLoading: deciding }] = useRecordAppealDecisionMutation();

  const [selectedAppeal, setSelectedAppeal] = useState<any | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState<'approve' | 'reject' | null>(null);

  if (!isManager) return null;
  if (isLoading) return <div className="flex justify-center py-8"><CircularProgress size={24} /></div>;
  if (!appeals || appeals.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No pending appeals</div>;
  }

  const handlePickUp = async (appealId: string) => {
    try {
      await pickUp(appealId).unwrap();
      toastSuccess('Appeal picked up for review');
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to pick up appeal');
    }
  };

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedAppeal) return;
    try {
      await recordDecision({
        id: selectedAppeal.id,
        decision,
        decisionNotes,
      }).unwrap();

      toastSuccess(`Appeal ${decision.toLowerCase()}`);
      setSelectedAppeal(null);
      setDecisionNotes('');
      setShowConfirm(null);
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to record decision');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Appeal Review Queue</h2>
          <p className="text-xs text-gray-500 mt-0.5">Denied applications awaiting manager review</p>
        </div>
        <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
          {appeals.length} pending
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Application</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Member</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Submitted</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Reviewed By</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {appeals.map((appeal: any) => (
              <tr
                key={appeal.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedAppeal(appeal)}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                  {appeal.applicationId?.slice(0, 8)}…
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {appeal.memberId?.slice(0, 8)}…
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                  {appeal.submissionDate ? new Date(appeal.submissionDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    appeal.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                    appeal.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {appeal.status === 'UNDER_REVIEW' ? 'Under Review' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  {appeal.reviewedBy ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  {appeal.status === 'PENDING' ? (
                    <button
                      onClick={() => handlePickUp(appeal.id)}
                      disabled={pickingUp}
                      className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {pickingUp ? '...' : 'Pick Up'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedAppeal(appeal)}
                      className="px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600"
                    >
                      Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedAppeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { setSelectedAppeal(null); setShowConfirm(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Appeal Review</h3>
                <p className="text-sm text-gray-500">Application #{selectedAppeal.applicationId?.slice(0, 8)}…</p>
              </div>
              <button
                onClick={() => { setSelectedAppeal(null); setShowConfirm(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Original Denial Reason</p>
                  <p className="text-sm text-red-600 font-medium">{selectedAppeal.denialReason ?? '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-400 font-medium mb-1">Reviewed By</p>
                  <p className="text-sm text-gray-800">{selectedAppeal.reviewedBy ?? 'Not yet reviewed'}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-800 mb-1">Appeal Reason</p>
                <p className="text-sm text-gray-800">{selectedAppeal.appealReason}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attached Documents</p>
                <DocumentManager
                  entityType="LOAN_APPLICATION"
                  entityId={selectedAppeal.applicationId}
                  canDelete={false}
                />
              </div>

              {selectedAppeal.status === 'UNDER_REVIEW' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Decision Notes</label>
                    <textarea
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      placeholder="Reason for approval or rejection..."
                    />
                  </div>

                  {!showConfirm ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowConfirm('approve')}
                        className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
                      >
                        Approve & Return to Queue
                      </button>
                      <button
                        onClick={() => setShowConfirm('reject')}
                        className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                      >
                        Reject Appeal
                      </button>
                    </div>
                  ) : (
                    <div className={`p-3 rounded-lg ${showConfirm === 'approve' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <p className="text-sm font-semibold mb-2">
                        {showConfirm === 'approve'
                          ? 'Confirm: Return application to pending approval queue?'
                          : 'Confirm: Reject this appeal?'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecision(showConfirm === 'approve' ? 'APPROVED' : 'REJECTED')}
                          disabled={deciding}
                          className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                            showConfirm === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {deciding ? <CircularProgress size={14} color="inherit" /> : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setShowConfirm(null)}
                          className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
                  <p className="text-sm text-gray-600">This appeal must be picked up for review before a decision can be made.</p>
                  <button
                    onClick={() => handlePickUp(selectedAppeal.id)}
                    disabled={pickingUp}
                    className="mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {pickingUp ? 'Picking up...' : 'Pick Up for Review'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}