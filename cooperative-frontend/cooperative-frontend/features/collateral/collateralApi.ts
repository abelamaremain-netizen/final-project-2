import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';
import type { Collateral, PageResponse } from '@/types';

export const collateralApi = createApi({
  reducerPath: 'collateralApi',
  baseQuery,
  tagTypes: ['Collateral'],
  // Collateral data changes infrequently — keep cache for 5 minutes
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    addCollateral: builder.mutation<Collateral, Partial<Collateral> & { loanId: string }>({
      query: ({ loanId, ...body }) => ({
        url: `/api/loans/applications/${loanId}/collateral`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Collateral'],
    }),
    getCollateralByApplication: builder.query<Collateral[], string>({
      query: (applicationId) => ({ url: `/api/loans/applications/${applicationId}/collateral` }),
      providesTags: ['Collateral'],
    }),
    getCollateralByLoan: builder.query<Collateral[], string>({
      query: (loanId) => ({ url: `/api/loans/${loanId}/collateral` }),
      providesTags: ['Collateral'],
    }),
    getPendingExternalCollaterals: builder.query<PageResponse<Collateral>, { page?: number; size?: number }>({
      query: ({ page = 0, size = 10 }) => ({
        url: '/api/loans/collateral/pending-external',
        params: { page, size },
      }),
      providesTags: ['Collateral'],
    }),
    updateCollateral: builder.mutation<Collateral, { id: string } & Partial<Collateral>>({
      query: ({ id, ...body }) => ({ url: `/api/loans/collateral/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Collateral'],
    }),
    releaseCollateral: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/loans/collateral/${id}/release`, method: 'POST' }),
      invalidatesTags: ['Collateral'],
    }),
    liquidateCollateral: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/loans/collateral/${id}/liquidate`, method: 'POST' }),
      invalidatesTags: ['Collateral'],
    }),
    deleteCollateral: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/loans/collateral/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Collateral'],
    }),
    approveExternalCollateral: builder.mutation<Collateral, string>({
      query: (id) => ({ url: `/api/loans/collateral/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Collateral'],
    }),
  }),
});

export const {
  useAddCollateralMutation,
  useGetCollateralByApplicationQuery,
  useGetCollateralByLoanQuery,
  useGetPendingExternalCollateralsQuery,
  useUpdateCollateralMutation,
  useReleaseCollateralMutation,
  useLiquidateCollateralMutation,
  useDeleteCollateralMutation,
  useApproveExternalCollateralMutation,
} = collateralApi;