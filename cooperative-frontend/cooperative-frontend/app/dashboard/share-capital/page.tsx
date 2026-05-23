'use client';

import { useState, useMemo } from 'react';
import { useGetSharesByMemberQuery, useGetShareSummaryQuery } from '@/features/shareCapital/shareCapitalApi';
import { useGetMemberPassbookQuery } from '@/features/members/membersApi';
import { SharePurchaseForm } from '@/features/shareCapital/components/SharePurchaseForm';
import { ShareTransferForm } from '@/features/shareCapital/components/ShareTransferForm';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { MemberSearchInput } from '@/components/common/MemberSearchInput';

type TabId = 'overview' | 'passbook' | 'purchase' | 'transfer' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'passbook', label: 'Passbook' },
  { id: 'purchase', label: 'Purchase Shares' },
  { id: 'transfer', label: 'Transfer Shares' },
  { id: 'history', label: 'Share History' },
];

export default function ShareCapitalPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const { data: shares, refetch: refetchShares } = useGetSharesByMemberQuery(
    selectedMemberId, { skip: !selectedMemberId }
  );
  const { data: passbook, isLoading: passbookLoading, error: passbookError, refetch: refetchPassbook } =
    useGetMemberPassbookQuery(selectedMemberId, { skip: !selectedMemberId });
  const { data: shareSummary } = useGetShareSummaryQuery();

  // Filter passbook transactions
  const filteredTransactions = useMemo(() => {
    if (!passbook) return [];
    
    let allTransactions: any[] = [];
    
    if (passbook.regularSavingsTransactions) {
      allTransactions = [...allTransactions, ...passbook.regularSavingsTransactions.map(t => ({ ...t, category: 'Regular Savings' }))];
    }
    if (passbook.nonRegularSavingsTransactions) {
      allTransactions = [...allTransactions, ...passbook.nonRegularSavingsTransactions.map(t => ({ ...t, category: 'Non-Regular Savings' }))];
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      allTransactions = allTransactions.filter(t => 
        (t.description ?? '').toLowerCase().includes(query) ||
        (t.type ?? '').toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      allTransactions = allTransactions.filter(t => t.type === filterType);
    }

    // Sort by date (newest first)
    allTransactions.sort((a, b) => {
      const dateA = a.date ? new Date(String(a.date)).getTime() : 0;
      const dateB = b.date ? new Date(String(b.date)).getTime() : 0;
      return dateB - dateA;
    });

    return allTransactions;
  }, [passbook, searchQuery, filterType]);

  const handleSuccess = () => {
    if (selectedMemberId) {
      refetchShares();
      refetchPassbook();
    }
  };

  return (
    <RoleGuard allowedRoles={['MANAGER', 'ACCOUNTANT', 'MEMBER_OFFICER']}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Share Capital</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage share purchases, transfers, and view passbook</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <MemberSearchInput
            label="Select Member"
            placeholder="Search by name or national ID..."
            value={selectedMemberId}
            onChange={(id) => setSelectedMemberId(id)}
          />
        </div>

        {/* Tab Navigation - Moved to top */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Member Shares Summary - Moved to top */}
        {selectedMemberId && shares && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Shares', value: shares.totalShares?.toLocaleString() ?? '—', color: 'text-purple-600' },
              { label: 'Share Price', value: `ETB ${Number(shares.currentPricePerShare ?? 0).toLocaleString()}`, color: 'text-indigo-600' },
              { label: 'Total Value', value: `ETB ${Number(shares.totalValue ?? 0).toLocaleString()}`, color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Overview Tab - Show when no member selected or overview tab active */}
        {activeTab === 'overview' && shareSummary && (
          <div className="space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Total Members', value: shareSummary.totalMembers?.toLocaleString() ?? '0', color: 'text-blue-600', icon: '👥' },
                { label: 'Total Shares', value: shareSummary.totalShares?.toLocaleString() ?? '0', color: 'text-purple-600', icon: '📊' },
                { label: 'Total Value', value: `ETB ${(shareSummary.totalValue ?? 0).toLocaleString()}`, color: 'text-green-600', icon: '💰' },
                { label: 'Avg Shares/Member', value: (shareSummary.averageSharesPerMember ?? 0).toLocaleString(), color: 'text-indigo-600', icon: '📈' },
                { label: 'Current Share Price', value: `ETB ${(shareSummary.currentPricePerShare ?? 0).toLocaleString()}`, color: 'text-orange-600', icon: '💎' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500">{label}</p>
                    <span className="text-2xl">{icon}</span>
                  </div>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Quick Actions - Moved above Recent Transactions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setActiveTab('purchase')}
                className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 hover:border-purple-500 hover:bg-purple-50 transition-all group"
              >
                <div className="text-center">
                  <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">🛒</div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Purchase Shares</p>
                  <p className="text-xs text-gray-500">Buy shares for a member</p>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('transfer')}
                className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
              >
                <div className="text-center">
                  <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">🔄</div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Transfer Shares</p>
                  <p className="text-xs text-gray-500">Transfer shares between members</p>
                </div>
              </button>
            </div>

            {/* Recent Transactions */}
            {shareSummary.recentTransactions && shareSummary.recentTransactions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Share Transactions</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {shareSummary.recentTransactions.map((tx: any) => (
                    <div key={tx.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          tx.type === 'PURCHASE' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          <span className="text-lg">{tx.type === 'PURCHASE' ? '🛒' : '🔄'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tx.memberName}</p>
                          <p className="text-xs text-gray-500">
                            {tx.type === 'PURCHASE' ? 'Purchased' : 'Transferred'} {tx.shares} shares
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">ETB {tx.amount?.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{tx.date ? new Date(tx.date).toLocaleDateString() : '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && !shareSummary && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-sm text-gray-500">Loading share capital overview...</p>
          </div>
        )}

        {activeTab === 'purchase' && (
          <div className="flex justify-center">
            <div className="w-full max-w-xl">
              <SharePurchaseForm memberId={selectedMemberId || undefined} onSuccess={handleSuccess} />
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="flex justify-center">
            <div className="w-full max-w-xl">
              <ShareTransferForm onSuccess={handleSuccess} />
            </div>
          </div>
        )}

        {activeTab === 'passbook' && !selectedMemberId && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="text-6xl mb-4">📖</div>
            <p className="text-sm text-gray-500">Select a member above to view their passbook</p>
          </div>
        )}

        {activeTab === 'passbook' && selectedMemberId && (
          <div className="space-y-4">
            {passbookLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : passbookError ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <ErrorAlert error={passbookError as any} onRetry={refetchPassbook} />
              </div>
            ) : passbook ? (
              <>
                {/* Filters for transactions - Moved to top */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="all">All Types</option>
                      <option value="DEPOSIT">Deposits</option>
                      <option value="WITHDRAWAL">Withdrawals</option>
                    </select>
                  </div>
                </div>

                {/* Member Summary */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Member Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-xs text-gray-500">Member</p><p className="font-semibold">{passbook.memberName}</p></div>
                    <div><p className="text-xs text-gray-500">National ID</p><p className="font-semibold">{passbook.nationalId}</p></div>
                    <div><p className="text-xs text-gray-500">Regular Savings</p><p className="font-semibold text-green-700">ETB {Number(passbook.regularSavingsBalance ?? 0).toLocaleString()}</p></div>
                    <div><p className="text-xs text-gray-500">Non-Regular Savings</p><p className="font-semibold text-blue-700">ETB {Number(passbook.nonRegularSavingsBalance ?? 0).toLocaleString()}</p></div>
                    <div><p className="text-xs text-gray-500">Total Savings</p><p className="font-semibold">ETB {Number(passbook.totalSavings ?? 0).toLocaleString()}</p></div>
                    <div><p className="text-xs text-gray-500">Share Count</p><p className="font-semibold text-purple-700">{passbook.shareCount?.toLocaleString()}</p></div>
                    <div><p className="text-xs text-gray-500">Share Value</p><p className="font-semibold text-indigo-700">ETB {Number(passbook.shareValue ?? 0).toLocaleString()}</p></div>
                    <div><p className="text-xs text-gray-500">Available Balance</p><p className="font-semibold">ETB {Number(passbook.availableBalance ?? 0).toLocaleString()}</p></div>
                  </div>
                </div>

                {/* Combined Transactions View */}
                {filteredTransactions.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">
                        All Transactions ({filteredTransactions.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600">Description</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredTransactions.map((tx, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-5 py-3 text-gray-600">{tx.date ? new Date(String(tx.date)).toLocaleDateString() : '—'}</td>
                              <td className="px-5 py-3">
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                                  {tx.category}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${tx.type === 'DEPOSIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-gray-600 text-xs">{tx.description}</td>
                              <td className={`px-5 py-3 text-right font-semibold ${tx.type === 'WITHDRAWAL' ? 'text-red-600' : 'text-green-600'}`}>
                                ETB {Number(tx.amount ?? 0).toLocaleString()}
                              </td>
                              <td className="px-5 py-3 text-right font-bold text-gray-900">ETB {Number(tx.balance ?? 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
                    {searchQuery || filterType !== 'all' 
                      ? 'No transactions match your filters'
                      : 'No transaction history found for this member'
                    }
                  </div>
                )}

                {/* Loans */}
                {passbook.loans && passbook.loans.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900">Loans</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {passbook.loans.map((loan) => (
                        <div key={String(loan.loanId)} className="p-5 flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-400 font-mono">{String(loan.loanId).slice(0, 8)}…</p>
                            <p className="text-sm font-semibold text-gray-800">
                              ETB {Number(loan.principal ?? 0).toLocaleString()} — {loan.duration} months @ {(Number(loan.interestRate) * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Outstanding: <span className="font-semibold text-red-600">ETB {Number(loan.outstandingBalance ?? 0).toLocaleString()}</span>
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            loan.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                            loan.status === 'PAID_OFF' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{loan.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Share History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="text-6xl mb-4">📜</div>
            <p className="text-sm font-semibold text-gray-900 mb-2">Share Transaction History</p>
            <p className="text-xs text-gray-500 mb-4">View detailed history of all share purchases and transfers</p>
            <p className="text-xs text-gray-400 italic">Coming soon...</p>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
