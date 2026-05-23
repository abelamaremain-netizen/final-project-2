'use client';

import { use, useState } from 'react';
import { CircularProgress } from '@mui/material';
import { useGetLoanByIdQuery, useGetRepaymentHistoryQuery } from '@/features/loans/loansApi';
import { LoanRepaymentForm } from '@/features/loans/components/LoanRepaymentForm';
import { LoanPenaltyPanel } from '@/features/loans/components/LoanPenaltyPanel';
import { LoanDefaultPanel } from '@/features/loans/components/LoanDefaultPanel';
import { LoanRestructuringForm } from '@/features/loans/components/LoanRestructuringForm';
import { DocumentManager } from '@/features/documents/components/DocumentManager';
import { CollateralForm } from '@/features/collateral/components/CollateralForm';
import { LoanStatus, LoanRepayment } from '@/types';

const statusColors: Record<string, string> = {
  [LoanStatus.ACTIVE]: 'bg-green-100 text-green-700',
  [LoanStatus.PAID_OFF]: 'bg-blue-100 text-blue-700',
  [LoanStatus.DEFAULTED]: 'bg-red-100 text-red-700',
  [LoanStatus.DISBURSED]: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-amber-100 text-amber-700',
};

type Tab = 'repayment' | 'collateral' | 'penalties' | 'default' | 'restructuring' | 'documents';

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: loan, isLoading } = useGetLoanByIdQuery(id);
  const { data: repayments } = useGetRepaymentHistoryQuery(id);
  const [activeTab, setActiveTab] = useState<Tab>('repayment');

  if (isLoading) return (
    <div className="flex justify-center items-center h-64"><CircularProgress /></div>
  );
  if (!loan) return (
    <div className="text-center py-16 text-gray-500">Loan not found</div>
  );

  const principal = typeof loan.principalAmount === 'object' ? (loan.principalAmount as any).amount : loan.principalAmount;
  const outstanding = typeof loan.outstandingPrincipal === 'object' ? (loan.outstandingPrincipal as any).amount : loan.outstandingPrincipal;
  const outstandingInterest = typeof loan.outstandingInterest === 'object' ? (loan.outstandingInterest as any).amount : (loan.outstandingInterest ?? 0);
  const totalOutstandingBalance = Number(outstanding ?? 0) + Number(outstandingInterest ?? 0);

  // Use totalPaid from backend (authoritative) — fall back to summing repayment history for legacy loans
  const totalPaidFromLoan = typeof loan.totalPaid === 'object' ? (loan.totalPaid as any).amount : loan.totalPaid;
  const totalPaidRaw = totalPaidFromLoan != null
    ? Number(totalPaidFromLoan)
    : (repayments?.reduce((sum, r) => sum + Number(r.paymentAmount ?? 0), 0) ?? 0);

  const isActive = ['ACTIVE', 'DISBURSED'].includes(loan.status as string);
  const canRestructure = isActive;

  const interestRate = Number(loan.interestRate ?? 0);
  const months = Number(loan.durationMonths ?? 1);
  const principalNum = Number(principal ?? 0);
  const totalInterest = principalNum * interestRate * (months / 12);
  const monthlyPrincipal = principalNum / months;
  const monthlyInterest = totalInterest / months;
  const monthlyTotal = monthlyPrincipal + monthlyInterest;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'repayment', label: 'Repayments' },
    { id: 'collateral', label: 'Collateral' },
    { id: 'documents', label: 'Documents' },
    ...(isActive ? [{ id: 'penalties' as Tab, label: 'Penalties' }] : []),
    ...(isActive || loan.status === 'DEFAULTED' ? [{ id: 'default' as Tab, label: 'Default' }] : []),
    ...(canRestructure ? [{ id: 'restructuring' as Tab, label: 'Restructuring' }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Loan {loan.code}</h1>
            <p className="text-xs text-gray-500 mt-0.5">Application: {loan.applicationId?.slice(0, 8)}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[loan.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {loan.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Principal', value: `ETB ${Number(principal).toLocaleString()}` },
            { label: 'Interest Rate', value: `${(interestRate * 100).toFixed(2)}% p.a.` },
            { label: 'Duration', value: `${loan.durationMonths} months` },
            { label: 'Outstanding', value: `ETB ${totalOutstandingBalance.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {loan.disbursementDate && (
          <p className="text-xs text-gray-400 mt-3">
            Disbursed: {new Date(loan.disbursementDate).toLocaleDateString()}
            {(loan as any).disbursedBy && ` by ${(loan as any).disbursedBy}`}
            {loan.maturityDate && ` · Matures: ${new Date(loan.maturityDate).toLocaleDateString()}`}
            {(loan as any).firstPaymentDate && ` · First payment: ${new Date((loan as any).firstPaymentDate).toLocaleDateString()}`}
          </p>
        )}
        {(loan as any).loanPurpose && (
          <p className="text-xs text-gray-400 mt-1">
            Purpose: <span className="font-medium text-gray-600">{(loan as any).loanPurpose.replace(/_/g, ' ')}</span>
            {(loan as any).purposeDescription && ` — ${(loan as any).purposeDescription}`}
          </p>
        )}
        {((loan as any).reviewedBy || loan.approvedBy) && (
          <p className="text-xs text-gray-400 mt-1">
            {(loan as any).reviewedBy && `Reviewed by: ${(loan as any).reviewedBy}`}
            {(loan as any).reviewedBy && loan.approvedBy && ' · '}
            {loan.approvedBy && `Approved by: ${loan.approvedBy}`}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 overflow-x-auto w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">

        {/* ── Repayments ── */}
        {activeTab === 'repayment' && (
          <div className="space-y-5">
            {/* Loan summary */}
            {months > 0 && principalNum > 0 && (
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Loan Summary</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { label: 'Total Interest', value: `ETB ${totalInterest.toFixed(2)}`, color: 'text-orange-600', sub: `${principalNum.toLocaleString()} × ${(interestRate * 100).toFixed(1)}% × ${(months / 12).toFixed(2)} yrs` },
                    { label: 'Total Payable', value: `ETB ${(principalNum + totalInterest).toFixed(2)}`, color: 'text-gray-800', sub: 'Principal + Interest' },
                    { label: 'Monthly Installment', value: `ETB ${monthlyTotal.toFixed(2)}`, color: 'text-blue-700', sub: `${monthlyPrincipal.toFixed(2)} + ${monthlyInterest.toFixed(2)}` },
                    { label: 'Payments Made', value: `ETB ${Number(totalPaidRaw).toLocaleString()}`, color: 'text-green-600', sub: loan.status === 'PAID_OFF' ? 'Fully paid off' : `of ETB ${(principalNum + totalInterest).toFixed(2)}` },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} className="p-2 rounded-lg bg-white border border-gray-100">
                      <p className="text-gray-500">{label}</p>
                      <p className={`font-bold ${color}`}>{value}</p>
                      <p className="text-gray-400 mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Repayment Progress</span>
                    <span>{loan.status === 'PAID_OFF' ? '100.0' : Math.min(100, (totalPaidRaw / (principalNum + totalInterest)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{ width: loan.status === 'PAID_OFF' ? '100%' : `${Math.min(100, (totalPaidRaw / (principalNum + totalInterest)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Record repayment */}
            {isActive && (
              <div>
                <h2 className="text-sm font-semibold text-gray-800 mb-1">Record Repayment</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Monthly installment: <span className="font-semibold text-blue-700">ETB {monthlyTotal.toFixed(2)}</span>
                  {' '}· Outstanding balance: <span className="font-semibold text-gray-700">ETB {totalOutstandingBalance.toFixed(2)}</span>
                </p>
                <LoanRepaymentForm
                  loanId={loan.id}
                  suggestedAmount={monthlyTotal}
                  outstandingBalance={totalOutstandingBalance}
                />
              </div>
            )}

            {/* History */}
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Repayment History</h2>
              {!repayments || repayments.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No repayments recorded</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Payment Date</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Recorded At</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Amount</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Principal</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Interest</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Balance After</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {repayments.map((r: LoanRepayment) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-700">{new Date(r.paymentDate).toLocaleDateString()}</td>
                          <td className="py-2 px-3 text-gray-400 text-xs">
                            {(r as any).recordedAt ? new Date((r as any).recordedAt).toLocaleString() : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-gray-800">ETB {Number(r.paymentAmount).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-blue-700">ETB {Number(r.principalPaid).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-orange-600">
                            ETB {Number(r.interestPaid).toLocaleString()}
                            {(r as any).interestForgiven > 0 && (
                              <span className="ml-1 text-green-600 text-xs" title="Interest forgiven on early settlement">
                                (-ETB {Number((r as any).interestForgiven).toFixed(2)} forgiven)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600">
                            {(r as any).outstandingBalanceAfter != null
                              ? `ETB ${Number((r as any).outstandingBalanceAfter).toLocaleString()}`
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-gray-500 truncate max-w-[80px]">{r.processedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Collateral ── */}
        {activeTab === 'collateral' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Collateral</h2>
            <CollateralForm loanId={loan.id} readonly={loan.status === 'PAID_OFF' || loan.status === 'DEFAULTED'} />
            {loan.applicationId && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-400 mb-3">Collateral pledged during application</p>
                <CollateralForm applicationId={loan.applicationId} readonly={true} />
              </div>
            )}
          </div>
        )}

        {/* ── Penalties ── */}
        {activeTab === 'penalties' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Loan Penalties</h2>
            <LoanPenaltyPanel loanId={loan.id} loanStatus={loan.status as string} />
          </div>
        )}

        {/* ── Default ── */}
        {activeTab === 'default' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Default Management</h2>
            <LoanDefaultPanel loanId={loan.id} />
          </div>
        )}

        {/* ── Restructuring ── */}
        {activeTab === 'restructuring' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Loan Restructuring</h2>
            <LoanRestructuringForm loanId={loan.id} />
          </div>
        )}

         {/* ── Documents ── */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {loan.applicationId && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-gray-800">Application Documents</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100">
                    From Application #{loan.applicationId.slice(0, 8)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Documents uploaded during the loan application phase
                </p>
                <DocumentManager entityType="LOAN_APPLICATION" entityId={loan.applicationId} canDelete={false} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
