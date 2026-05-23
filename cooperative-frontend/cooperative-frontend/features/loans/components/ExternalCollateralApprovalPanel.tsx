'use client';

import { useState } from 'react';
import { CircularProgress } from '@mui/material';
import { useGetPendingExternalCollateralsQuery, useApproveExternalCollateralMutation } from '@/features/collateral/collateralApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { SimplePagination } from '@/components/common/SimplePagination';

export function ExternalCollateralApprovalPanel() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, refetch } = useGetPendingExternalCollateralsQuery({ page, size: pageSize });
  const [approve, { isLoading: approving }] = useApproveExternalCollateralMutation();

  const collaterals = data?.content ?? [];
  const totalElements = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const handleApprove = async (id: string) => {
    try {
      await approve(id).unwrap();
      toastSuccess('External collateral approved');
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to approve');
    }
  };

  if (isLoading) return <div className="flex justify-center py-4"><CircularProgress size={20} /></div>;
  if (collaterals.length === 0) return <p className="text-sm text-gray-500 text-center py-4">No pending external cooperative collaterals.</p>;

  return (
    <div>
      <div className="space-y-2">
        {collaterals.map((c: any) => (
          <div key={c.id} className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-gray-700">{c.externalCooperativeName}</p>
              <p className="text-gray-500">Value: ETB {Number(c.collateralValue).toLocaleString()}</p>
              {c.verificationDocument && <p className="text-gray-400">Doc ref: {c.verificationDocument}</p>}
            </div>
            <button
              onClick={() => handleApprove(c.id)}
              disabled={approving}
              className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {approving ? '...' : 'Approve'}
            </button>
          </div>
        ))}
      </div>

      <SimplePagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalElements}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}