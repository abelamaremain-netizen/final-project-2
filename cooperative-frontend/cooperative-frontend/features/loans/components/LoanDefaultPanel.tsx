'use client';

import { useState } from 'react';
import { CircularProgress } from '@mui/material';
import {
  useGetDefaultForLoanQuery,
  useDeclareDefaultMutation,
  useInitiateLegalActionMutation,
  useResolveDefaultMutation,
} from '../loansApi';
import { toastSuccess, toastError } from '@/components/common/Toast';

interface Props {
  loanId: string;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 transition-all';

const statusColors: Record<string, string> = {
  DEFAULTED: 'bg-red-100 text-red-700',
  LEGAL_ACTION_INITIATED: 'bg-orange-100 text-orange-700',
  IN_COURT: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
};

export function LoanDefaultPanel({ loanId }: Props) {
  const { data: loanDefault, isLoading, isError, error, refetch } = useGetDefaultForLoanQuery(loanId);
  const is404 = isError && (error as any)?.status === 404;
  const hasNoDefault = is404 || (!isLoading && !loanDefault);

  const [declareDefault, { isLoading: declaring }] = useDeclareDefaultMutation();
  const [initiateLegal, { isLoading: initiating }] = useInitiateLegalActionMutation();
  const [resolveDefault, { isLoading: resolving }] = useResolveDefaultMutation();

  const [reason, setReason] = useState('');
  const [courtCase, setCourtCase] = useState('');
  const [resolution, setResolution] = useState('');
  const [mode, setMode] = useState<'declare' | 'confirm_declare' | 'legal' | 'resolve' | null>(null);

  const handleDeclare = async () => {
    if (!reason.trim()) return;
    try {
      await declareDefault({ id: loanId, reason }).unwrap();
      toastSuccess('Default declared');
      setMode(null); setReason(''); refetch();
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to declare default'); }
  };

  const handleLegal = async () => {
    if (!courtCase.trim()) return;
    try {
      await initiateLegal({ id: loanId, courtCaseNumber: courtCase }).unwrap();
      toastSuccess('Legal action initiated');
      setMode(null); setCourtCase(''); refetch();
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to initiate legal action'); }
  };

  const handleResolve = async () => {
    if (!resolution.trim()) return;
    try {
      await resolveDefault({ id: loanId, resolutionNotes: resolution }).unwrap();
      toastSuccess('Default resolved');
      setMode(null); setResolution(''); refetch();
    } catch (e: any) { toastError(e?.data?.message ?? 'Failed to resolve default'); }
  };

  if (isLoading) return <div className="flex justify-center py-4"><CircularProgress size={20} /></div>;
  if (isError && !is404) return <p className="text-sm text-red-500">Failed to load default information.</p>;

  return (
    <div className="space-y-4">
      {loanDefault && !hasNoDefault ? (
        /* ── Existing default record ── */
        <div className="p-4 rounded-lg bg-white border border-red-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Default Record</p>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[loanDefault.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {loanDefault.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-gray-600"><span className="font-medium">Reason:</span> {loanDefault.reason}</p>
          {loanDefault.courtCaseNumber && (
            <p className="text-xs text-gray-600"><span className="font-medium">Court Case:</span> {loanDefault.courtCaseNumber}</p>
          )}
          {loanDefault.resolutionNotes && (
            <p className="text-xs text-gray-600"><span className="font-medium">Resolution:</span> {loanDefault.resolutionNotes}</p>
          )}
          <p className="text-xs text-gray-400">Declared: {new Date(loanDefault.declaredAt).toLocaleDateString()}</p>

          {/* Action buttons */}
          {mode === null && (
            <div className="flex gap-3 pt-1">
              {loanDefault.status === 'DEFAULTED' && (
                <button onClick={() => setMode('legal')} className="text-xs text-orange-600 hover:underline font-medium">
                  Initiate Legal Action
                </button>
              )}
              {loanDefault.status !== 'RESOLVED' && (
                <button onClick={() => setMode('resolve')} className="text-xs text-green-600 hover:underline font-medium">
                  Resolve Default
                </button>
              )}
            </div>
          )}

          {/* Legal action inline form */}
          {mode === 'legal' && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700">Court case number</p>
              <input value={courtCase} onChange={(e) => setCourtCase(e.target.value)} placeholder="e.g. CV-2026-001234" className={inputCls} />
              <div className="flex gap-2">
                <button onClick={handleLegal} disabled={initiating || !courtCase.trim()} className="flex-1 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">
                  {initiating ? <CircularProgress size={14} color="inherit" /> : 'Confirm'}
                </button>
                <button onClick={() => { setMode(null); setCourtCase(''); }} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Resolve inline form */}
          {mode === 'resolve' && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700">Resolution notes</p>
              <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} placeholder="Describe how the default was resolved..." className={inputCls} />
              <div className="flex gap-2">
                <button onClick={handleResolve} disabled={resolving || !resolution.trim()} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                  {resolving ? <CircularProgress size={14} color="inherit" /> : 'Resolve'}
                </button>
                <button onClick={() => { setMode(null); setResolution(''); }} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── No default yet ── */
        <div className="space-y-3">
          <p className="text-sm text-gray-500">No default record for this loan.</p>

          {mode === null && (
            <button
              onClick={() => setMode('declare')}
              className="text-xs text-red-600 hover:underline font-medium"
            >
              Declare Default
            </button>
          )}

          {/* Step 1: enter reason */}
          {mode === 'declare' && (
            <div className="space-y-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs font-semibold text-red-800">Reason for default</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Describe why this loan is being declared in default..."
                className={inputCls}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { if (reason.trim()) setMode('confirm_declare'); }}
                  disabled={!reason.trim()}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  Continue
                </button>
                <button onClick={() => { setMode(null); setReason(''); }} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Step 2: confirmation guard */}
          {mode === 'confirm_declare' && (
            <div className="space-y-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs font-semibold text-red-800">Confirm default declaration</p>
              <p className="text-xs text-red-700">
                This will mark the loan as <strong>DEFAULTED</strong> and make collateral eligible for liquidation. This action cannot be undone without manager resolution.
              </p>
              <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 mt-1">
                Reason: {reason}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleDeclare}
                  disabled={declaring}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {declaring && <CircularProgress size={12} color="inherit" />}
                  {declaring ? 'Declaring...' : 'Confirm — Declare Default'}
                </button>
                <button onClick={() => setMode('declare')} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Back</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
