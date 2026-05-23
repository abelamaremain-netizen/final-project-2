"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useGetAccountByIdQuery,
  useGetAccountTransactionsQuery,
  useFreezeAccountMutation,
  useUnfreezeAccountMutation,
} from "@/features/accounts/accountsApi";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { SimplePagination } from "@/components/common/SimplePagination";
import { RoleGuard } from "@/components/auth/RoleGuard";
import Link from "next/link";

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const [txPage, setTxPage] = useState(0);
  const [txSize, setTxSize] = useState(20);
  const [txType, setTxType] = useState("");

  const {
    data: account,
    isLoading,
    error,
    refetch,
  } = useGetAccountByIdQuery(accountId);
  const { data: txData, isLoading: txLoading } = useGetAccountTransactionsQuery(
    { id: accountId, page: txPage, size: txSize },
  );
  const transactions = txData?.content ?? [];
  const txTotalPages = txData?.totalPages ?? 1;
  const [freezeAccount, { isLoading: freezing }] = useFreezeAccountMutation();
  const [unfreezeAccount, { isLoading: unfreezing }] =
    useUnfreezeAccountMutation();

  const [freezeError, setFreezeError] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [unfreezeReason, setUnfreezeReason] = useState("");
  const [showFreezeForm, setShowFreezeForm] = useState(false);
  const [showUnfreezeForm, setShowUnfreezeForm] = useState(false);

  const handleFreeze = async () => {
    if (!freezeReason.trim() || freezeReason.trim().length < 5) {
      setFreezeError("Reason must be at least 5 characters");
      return;
    }
    setFreezeError("");
    try {
      await freezeAccount({ id: accountId, reason: freezeReason.trim() }).unwrap();
      setShowFreezeForm(false);
      setFreezeReason("");
      refetch();
    } catch (e: any) {
      setFreezeError(e?.data?.message ?? "Failed to freeze account");
    }
  };
  const handleUnfreeze = async () => {
    if (!unfreezeReason.trim() || unfreezeReason.trim().length < 5) {
      setFreezeError("Reason must be at least 5 characters");
      return;
    }
    setFreezeError("");
    try {
      await unfreezeAccount({ id: accountId, reason: unfreezeReason.trim() }).unwrap();
      setShowUnfreezeForm(false);
      setUnfreezeReason("");
      refetch();
    } catch (e: any) {
      setFreezeError(e?.data?.message ?? "Failed to unfreeze account");
    }
  };

  const filtered = txType
    ? transactions.filter((tx: any) => tx.transactionType === txType)
    : transactions;

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="p-4">
        <ErrorAlert message="Failed to load account" onRetry={refetch} />
      </div>
    );
  if (!account)
    return <div className="p-4 text-gray-500">Account not found.</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-600 hover:underline mb-1 block"
          >
            &larr; Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            Account Details
          </h1>
          <p className="text-sm text-gray-500">
            {account.accountType.replace(/_/g, " ")}
          </p>
          {/* ✅ ADDED: Show account code */}
          <p className="text-xs font-mono text-gray-400 mt-1">
            Account Code: <span className="font-semibold text-gray-600">{account.code}</span>
          </p>
        </div>
        <RoleGuard allowedRoles={["MANAGER"]}>
          <div className="flex gap-2">
            {account.status === "ACTIVE" && (
              <button
                onClick={() => { setShowFreezeForm(f => !f); setShowUnfreezeForm(false); setFreezeError(""); }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-yellow-500 text-white hover:bg-yellow-600"
              >
                Freeze
              </button>
            )}
            {account.status === "FROZEN" && (
              <button
                onClick={() => { setShowUnfreezeForm(f => !f); setShowFreezeForm(false); setFreezeError(""); }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500 text-white hover:bg-green-600"
              >
                Unfreeze
              </button>
            )}
          </div>
        </RoleGuard>
      </div>

      {freezeError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200">
          <svg
            className="w-4 h-4 text-red-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-red-700">{freezeError}</p>
        </div>
      )}

      {/* Freeze form */}
      {showFreezeForm && (
        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 space-y-3">
          <h3 className="text-sm font-semibold text-yellow-800">Freeze Account</h3>
          <div>
            <textarea
              rows={2}
              placeholder="Reason for freezing (min. 5 characters)..."
              value={freezeReason}
              onChange={(e) => { setFreezeReason(e.target.value); setFreezeError(""); }}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400 ${freezeError ? "border-red-400 bg-red-50" : "border-yellow-300"}`}
            />
            {freezeError && <p className="text-xs text-red-500 mt-1">{freezeError}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFreeze}
              disabled={freezing}
              className="px-4 py-1.5 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
            >
              {freezing ? "Freezing..." : "Confirm Freeze"}
            </button>
            <button
              onClick={() => { setShowFreezeForm(false); setFreezeReason(""); setFreezeError(""); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unfreeze form */}
      {showUnfreezeForm && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 space-y-3">
          <h3 className="text-sm font-semibold text-green-800">Unfreeze Account</h3>
          {account.freezeReason && (
            <p className="text-xs text-gray-600">
              Frozen reason: <span className="font-medium text-gray-800">{account.freezeReason}</span>
            </p>
          )}
          <div>
            <textarea
              rows={2}
              placeholder="Reason for unfreezing (min. 5 characters)..."
              value={unfreezeReason}
              onChange={(e) => { setUnfreezeReason(e.target.value); setFreezeError(""); }}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-green-400 ${freezeError ? "border-red-400 bg-red-50" : "border-green-300"}`}
            />
            {freezeError && <p className="text-xs text-red-500 mt-1">{freezeError}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUnfreeze}
              disabled={unfreezing}
              className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50"
            >
              {unfreezing ? "Unfreezing..." : "Confirm Unfreeze"}
            </button>
            <button
              onClick={() => { setShowUnfreezeForm(false); setUnfreezeReason(""); setFreezeError(""); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Account Info */}
      <div className="bg-white rounded-lg shadow-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500">Type</p>
          <p className="text-sm font-semibold text-gray-900">
            {account.accountType.replace(/_/g, " ")}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Balance</p>
          <p className="text-sm font-bold text-green-700">
            ETB {Number(account.balance).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Available</p>
          <p className="text-sm font-semibold text-gray-900">
            ETB {Number(account.availableBalance).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Status</p>
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
              account.status === "ACTIVE"
                ? "bg-green-100 text-green-700"
                : account.status === "FROZEN"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {account.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pledged</p>
          <p className="text-sm text-gray-700">
            ETB {Number(account.pledgedAmount).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Interest Rate</p>
          <p className="text-sm text-gray-700">{account.interestRate}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Opened</p>
          <p className="text-sm text-gray-700">
            {account.createdDate
              ? new Date(account.createdDate).toLocaleDateString()
              : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Member</p>
          <Link
            href={`/dashboard/members/${account.memberId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            View Member
          </Link>
        </div>
        {account.status === "FROZEN" && account.freezeReason && (
          <div className="col-span-2 md:col-span-4">
            <p className="text-xs text-gray-500">Freeze Reason</p>
            <p className="text-sm text-yellow-700 font-medium">{account.freezeReason}</p>
          </div>
        )}
        {account.status === "ACTIVE" && account.unfreezeReason && (
          <div className="col-span-2 md:col-span-4">
            <p className="text-xs text-gray-500">Last Unfreeze Reason</p>
            <p className="text-sm text-green-700 font-medium">{account.unfreezeReason}</p>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Transaction History
          </h2>
          <select
            value={txType}
            onChange={(e) => {
              setTxType(e.target.value);
              setTxPage(0);
            }}
            className="px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAWAL">Withdrawal</option>
          </select>
        </div>
        {txLoading ? (
          <div className="flex justify-center p-6">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-8">
            No transactions found.
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                  Notes
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                  Amount
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                  Balance After
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx: any) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {tx.timestamp
                      ? new Date(tx.timestamp).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        tx.transactionType === "DEPOSIT"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {tx.transactionType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {tx.notes || "-"}
                  </td>
                  <td
                    className={`px-4 py-2 text-sm font-semibold text-right ${
                      tx.transactionType === "DEPOSIT"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {tx.transactionType === "DEPOSIT" ? "+" : "-"}ETB{" "}
                    {Number(tx.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">
                    ETB {Number(tx.balanceAfter).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Pagination */}
        <SimplePagination
          currentPage={txPage}
          totalPages={txTotalPages}
          totalCount={txData?.totalElements ?? 0}
          pageSize={txSize}
          onPageChange={setTxPage}
          onPageSizeChange={setTxSize}
        />
      </div>
    </div>
  );
}