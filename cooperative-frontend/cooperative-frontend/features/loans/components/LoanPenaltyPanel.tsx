'use client';

import { useState } from 'react';
import { CircularProgress } from '@mui/material';
import { useGetLoanPenaltiesQuery, useGetTotalUnpaidPenaltiesQuery, useAssessPenaltyMutation } from '../loansApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import type { LoanPenalty } from '@/types';

interface Props {
  loanId: string;
  loanStatus?: string;
}

export function LoanPenaltyPanel({ loanId, loanStatus }: Props) {
  const { data: penalties = [], isLoading, refetch } = useGetLoanPenaltiesQuery(loanId);
  const { data: totalUnpaid } = useGetTotalUnpaidPenaltiesQuery(loanId);
  const [assessPenalty, { isLoading: assessing }] = useAssessPenaltyMutation();
  const [showConfirm, setShowConfirm] = useState(false);

  const canAssess = loanStatus === 'ACTIVE' || loanStatus === 'DISBURSED';

  const handleAssess = async () => {
    try {
      await assessPenalty(loanId).unwrap();
      toastSuccess('Penalty assessed');
      setShowConfirm(false);
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to assess penalty');
      setShowConfirm(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-4"><CircularProgress size={20} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Total Unpaid Penalties</p>
          <p className="text-lg font-bold text-red-600">ETB {(totalUnpaid ?? 0).toLocaleString()}</p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={assessing || !canAssess}
          title={!canAssess ? `Only available for ACTIVE/DISBURSED loans (current: ${loanStatus})` : undefined}
          className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {assessing ? <CircularProgress size={12} color="inherit" /> : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          Assess Penalty
        </button>
      </div>

      {!canAssess && loanStatus && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Penalty assessment only available for <strong>ACTIVE</strong> or <strong>DISBURSED</strong> loans. Current status: <strong>{loanStatus}</strong>.
        </p>
      )}

      {/* Inline confirmation — no dark overlay */}
      {showConfirm && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            Assess a late payment penalty for this loan based on current configuration?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAssess}
              disabled={assessing}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
            >
              {assessing && <CircularProgress size={10} color="inherit" />}
              {assessing ? 'Assessing...' : 'Confirm'}
            </button>
            <button onClick={() => setShowConfirm(false)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {penalties.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No penalties recorded.</p>
      ) : (
        <div className="space-y-2">
          {penalties.map((p: LoanPenalty) => (
            <div key={p.id} className="p-3 rounded-lg bg-white border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-700">ETB {p.amount.toLocaleString()}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {p.paid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
              <p className="text-xs text-gray-500">{p.reason}</p>
              {/* Audit verification fields */}
              {((p as any).penaltyRate || (p as any).daysOverdue || (p as any).outstandingAtAssessment) && (
                <p className="text-xs text-gray-400 mt-1">
                  {(p as any).outstandingAtAssessment && `Base: ETB ${Number((p as any).outstandingAtAssessment).toLocaleString()}`}
                  {(p as any).penaltyRate && ` × ${(Number((p as any).penaltyRate) * 100).toFixed(2)}%`}
                  {(p as any).daysOverdue && ` × ${(p as any).daysOverdue} days / 365`}
                  {(p as any).configVersion && ` · Config v${(p as any).configVersion}`}
                </p>
              )}
              <p className="text-xs text-gray-400">{new Date(p.assessedAt).toLocaleDateString()} · by {(p as any).assessedBy}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
