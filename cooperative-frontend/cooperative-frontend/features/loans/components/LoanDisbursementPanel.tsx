'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { CircularProgress } from '@mui/material';
import { 
    useGetAllLoansQuery, 
    useDisburseLoanMutation, 
    useSkipDisbursementMutation,
    useUnskipDisbursementMutation
} from '../loansApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { Pagination } from '@/components/common/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/constants/app';
import { LoanStatus, Loan } from '@/types';

type SortField = 'queuePosition' | 'principalAmount' | 'interestRate' | 'durationMonths';

export function LoanDisbursementPanel() {
    const { data, isLoading } = useGetAllLoansQuery({ page: 0, size: 200, status: LoanStatus.APPROVED });
    const [disburse, { isLoading: disbursing }] = useDisburseLoanMutation();
    const [skipDisb, { isLoading: skippingDisb }] = useSkipDisbursementMutation();
    const [unskipDisb, { isLoading: unskippingDisb }] = useUnskipDisbursementMutation();

    const { hasAnyRole } = useAuth();
    const isManager = hasAnyRole([ROLES.MANAGER]);

    const [target, setTarget] = useState<Loan | null>(null);
    const [skipTarget, setSkipTarget] = useState<Loan | null>(null);
    const [skipReason, setSkipReason] = useState('');
    const [skipReasonError, setSkipReasonError] = useState('');
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
    const [queueBlockErrors, setQueueBlockErrors] = useState<Record<string, string>>({});

    const [sortField, setSortField] = useState<SortField>('queuePosition');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [page, setPage] = useState(0);
    const pageSize = 5;

    const allLoans = data?.content ?? [];

    const sorted = useMemo(() => {
        return [...allLoans].sort((a, b) => {
            let av: number;
            let bv: number;
            if (sortField === 'queuePosition') {
                av = (a as any).queuePosition ?? Number.MAX_SAFE_INTEGER;
                bv = (b as any).queuePosition ?? Number.MAX_SAFE_INTEGER;
            } else {
                av = Number((a as any)[sortField] ?? 0);
                bv = Number((b as any)[sortField] ?? 0);
            }
            return sortDir === 'asc' ? av - bv : bv - av;
        });
    }, [allLoans, sortField, sortDir]);

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

    const closeModal = () => {
        setSelectedLoan(null);
        setTarget(null);
        setSkipTarget(null);
        setSkipReason('');
        setSkipReasonError('');
    };

    useEffect(() => {
        if (!selectedLoan) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [selectedLoan]);

    const handleDisburse = async () => {
        if (!target) return;
        try {
            await disburse(target.id).unwrap();
            toastSuccess('Loan disbursed successfully');
            closeModal();
            setQueueBlockErrors(prev => { const n = { ...prev }; delete n[target.id]; return n; });
        } catch (e: any) {
            const msg: string = e?.data?.message ?? 'Failed to disburse loan';
            if (msg.includes('queue position') || e?.data?.status === 422) {
                setQueueBlockErrors(prev => ({ ...prev, [target.id]: msg }));
            } else {
                toastError(msg);
            }
            setTarget(null);
        }
    };

    const handleSkipDisbursement = async (loan: Loan) => {
        if (skipReason.trim().length < 10) {
            setSkipReasonError('Skip reason must be at least 10 characters');
            return;
        }
        try {
            await skipDisb({ id: loan.id, reason: skipReason.trim() }).unwrap();
            toastSuccess('Disbursement skipped');
            closeModal();
        } catch (e: any) {
            toastError(e?.data?.message ?? 'Failed to skip disbursement');
        }
    };

    const handleUnskipDisbursement = async (loan: Loan) => {
        try {
            await unskipDisb(loan.id).unwrap();
            toastSuccess('Loan unskipped and returned to queue');
        } catch (e: any) {
            toastError(e?.data?.message ?? 'Failed to unskip loan');
        }
    };

    const principal = (loan: Loan) => typeof loan.principalAmount === 'object'
        ? (loan.principalAmount as any).amount
        : loan.principalAmount;

    const outstanding = (loan: Loan) => typeof loan.outstandingPrincipal === 'object'
        ? (loan.outstandingPrincipal as any).amount
        : loan.outstandingPrincipal;

    if (isLoading) return <div className="flex justify-center py-8"><CircularProgress size={24} /></div>;

    if (allLoans.length === 0) {
        return <div className="text-center py-8 text-gray-400 text-sm">No approved loans</div>;
    }

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('queuePosition')}>
                                Queue # {sortIcon('queuePosition')}
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Loan Code</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('principalAmount')}>
                                Principal {sortIcon('principalAmount')}
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('interestRate')}>
                                Rate {sortIcon('interestRate')}
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('durationMonths')}>
                                Duration {sortIcon('durationMonths')}
                            </th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {paged.map((loan: Loan) => (
                            <tr
                                key={loan.id}
                                className="hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => {
                                    setSelectedLoan(loan);
                                    setTarget(null);
                                    setSkipTarget(null);
                                }}
                            >
                                <td className="px-4 py-2.5 font-semibold text-blue-700 text-sm">
                                    {(loan as any).queuePosition != null ? `#${(loan as any).queuePosition}` : '—'}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-600 font-medium">{loan.code}</td>
                                <td className="px-4 py-2.5 font-semibold text-gray-800">ETB {Number(principal(loan)).toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-gray-600">{(Number(loan.interestRate) * 100).toFixed(1)}%</td>
                                <td className="px-4 py-2.5 text-gray-600">{loan.durationMonths}mo</td>
                                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex gap-1.5 justify-end">
                                        {(loan as any).disbursementSkippedAt ? (
                                            <>
                                                <span className="px-2 py-1 rounded-md bg-orange-100 text-orange-700 text-xs font-medium">
                                                    Skipped
                                                </span>
                                                {isManager && (
                                                    <button
                                                        onClick={() => handleUnskipDisbursement(loan)}
                                                        disabled={unskippingDisb}
                                                        className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                                    >
                                                        {unskippingDisb ? '...' : 'Unskip'}
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => { setSelectedLoan(loan); setTarget(loan); setSkipTarget(null); }}
                                                    disabled={disbursing}
                                                    className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    Disburse
                                                </button>
                                                {isManager && (
                                                    <button
                                                        onClick={() => { setSelectedLoan(loan); setSkipTarget(loan); setTarget(null); setSkipReason(''); setSkipReasonError(''); }}
                                                        className="px-2.5 py-1 rounded-md bg-orange-500 text-white text-xs font-medium hover:bg-orange-600"
                                                    >
                                                        Skip
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <Pagination page={page} totalPages={totalPages} totalElements={sorted.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={() => {}} pageSizeOptions={[5, 10, 20]} />
            </div>

            {/* ── Detail Modal ── */}
            {selectedLoan && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={closeModal}
                >
                    <div
                        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Loan {selectedLoan.code}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                        {selectedLoan.status}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        Queue {(selectedLoan as any).queuePosition != null ? `#${(selectedLoan as any).queuePosition}` : '—'}
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
                                    <p className="text-xs text-gray-400 font-medium mb-1">Principal</p>
                                    <p className="text-sm font-bold text-gray-800">ETB {Number(principal(selectedLoan)).toLocaleString()}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Interest Rate</p>
                                    <p className="text-sm font-bold text-gray-800">{(Number(selectedLoan.interestRate) * 100).toFixed(1)}% p.a.</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Duration</p>
                                    <p className="text-sm font-bold text-gray-800">{selectedLoan.durationMonths} months</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Outstanding Principal</p>
                                    <p className="text-sm font-bold text-gray-800">ETB {Number(outstanding(selectedLoan)).toLocaleString()}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Loan Code</p>
                                    <p className="text-sm font-mono text-gray-700 font-medium">{selectedLoan.code}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Member ID</p>
                                    <p className="text-sm font-mono text-gray-700">{selectedLoan.memberId?.slice(0, 12) ?? '—'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Application ID</p>
                                    <p className="text-sm font-mono text-gray-700">{selectedLoan.applicationId?.slice(0, 12) ?? '—'}</p>
                                </div>
                                {selectedLoan.approvalDate && (
                                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                                        <p className="text-xs text-gray-400 font-medium mb-1">Approved</p>
                                        <p className="text-sm font-bold text-gray-800">{new Date(selectedLoan.approvalDate).toLocaleDateString()}</p>
                                    </div>
                                )}
                            </div>

                            {/* Queue blocking error banner */}
                            {queueBlockErrors[selectedLoan.id] && (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-300">
                                    <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-xs text-red-700 font-medium">{queueBlockErrors[selectedLoan.id]}</p>
                                    <button
                                        onClick={() => setQueueBlockErrors(prev => { const n = { ...prev }; delete n[selectedLoan.id]; return n; })}
                                        className="ml-auto text-red-400 hover:text-red-600 text-xs"
                                    >✕</button>
                                </div>
                            )}

                            {/* Skip history */}
                            {(selectedLoan as any).disbursementSkippedAt && (
                                <div className="px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-800">
                                    <p className="font-semibold mb-0.5">Disbursement skipped by {(selectedLoan as any).disbursementSkippedBy}</p>
                                    <p>Reason: {(selectedLoan as any).disbursementSkipReason}</p>
                                    <p className="text-orange-600 mt-0.5">Skipped at: {new Date((selectedLoan as any).disbursementSkippedAt).toLocaleString()}</p>
                                    <p className="text-green-700 font-semibold mt-1">Click Unskip to return this loan to the disbursement queue at position #{(selectedLoan as any).queuePosition}</p>
                                </div>
                            )}

                            {/* Disburse confirmation */}
                            {target?.id === selectedLoan.id && (
                                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                                    <p className="text-xs font-semibold text-amber-800 mb-2">
                                        Confirm disbursement of ETB {Number(principal(selectedLoan)).toLocaleString()} for {selectedLoan.durationMonths} months?
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleDisburse}
                                            disabled={disbursing}
                                            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {disbursing && <CircularProgress size={10} color="inherit" />}
                                            {disbursing ? 'Disbursing...' : 'Confirm Disburse'}
                                        </button>
                                        <button
                                            onClick={() => setTarget(null)}
                                            className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Skip form */}
                            {skipTarget?.id === selectedLoan.id && (
                                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                                    <p className="text-xs font-semibold text-orange-800 mb-2">Skip disbursement — provide a reason</p>
                                    <textarea
                                        value={skipReason}
                                        onChange={(e) => { setSkipReason(e.target.value); if (e.target.value.trim().length >= 10) setSkipReasonError(''); }}
                                        rows={2}
                                        placeholder="Reason for skipping disbursement (min 10 characters)..."
                                        className="w-full px-3 py-2 rounded-md border border-orange-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none bg-white"
                                    />
                                    {skipReasonError && <p className="text-xs text-red-500 mt-1">{skipReasonError}</p>}
                                    <p className="text-xs text-gray-400 mt-1">{skipReason.trim().length}/10 min characters</p>
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={() => handleSkipDisbursement(selectedLoan)}
                                            disabled={skippingDisb}
                                            className="px-3 py-1.5 rounded-md bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {skippingDisb && <CircularProgress size={10} color="inherit" />}
                                            {skippingDisb ? 'Skipping...' : 'Confirm Skip'}
                                        </button>
                                        <button
                                            onClick={() => { setSkipTarget(null); setSkipReason(''); setSkipReasonError(''); }}
                                            className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-white"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
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
        </>
    );
}