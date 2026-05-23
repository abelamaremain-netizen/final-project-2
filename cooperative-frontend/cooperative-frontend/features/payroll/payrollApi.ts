import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';
import type { PayrollDeduction, PageResponse } from '@/types';

export interface ReconciliationDiscrepancy {
  memberId: string;
  memberName: string;
  expectedAmount: number;
  confirmedAmount: number;
  difference: number;
  reason: string;
}

export interface ReconciliationReport {
  month: string;
  expectedDeductions: number;
  confirmedDeductions: number;
  failedDeductions: number;
  totalExpected: number;
  totalConfirmed: number;
  discrepancyAmount: number;
  discrepancies: ReconciliationDiscrepancy[];
  reconciliationDate: string;
  reconciledBy: string;
}

export interface DeductionConfirmationDto {
  memberId: string;
  deductionMonth: string; // YYYY-MM
  amount: number;
  employerReference?: string;
}

export interface DeductionListParams {
  month: string;
  status?: string;
  memberType?: string;
  page?: number;
  size?: number;
  sortField?: string;
  sortDir?: string;
}

export const payrollApi = createApi({
  reducerPath: 'payrollApi',
  baseQuery,
  tagTypes: ['Payroll', 'DeductionList'],
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    generateDeductionList: builder.mutation<PayrollDeduction[], string>({
      query: (month) => ({ url: '/api/payroll/deduction-list', method: 'POST', params: { month } }),
      invalidatesTags: ['DeductionList'],
    }),
    // Non-paginated (kept for backward compat / total count checks)
    getDeductionList: builder.query<PayrollDeduction[], string>({
      query: (month) => ({ url: '/api/payroll/deduction-list', params: { month } }),
      providesTags: ['DeductionList'],
    }),
    // Paginated with filters
    getDeductionListPaged: builder.query<PageResponse<any>, DeductionListParams>({
      query: ({ month, status, memberType, page = 0, size = 20, sortField = 'memberName', sortDir = 'asc' }) => ({
        url: '/api/payroll/deductions/paged',
        params: {
          month,
          ...(status && status !== 'all' ? { status } : {}),
          ...(memberType && memberType !== 'all' ? { memberType } : {}),
          page,
          size,
          sortField,
          sortDir,
        },
      }),
      providesTags: ['DeductionList'],
    }),
    // Get all IDs for current filters (Select All in type)
    getDeductionIds: builder.query<string[], { month: string; status?: string; memberType?: string }>({
      query: ({ month, status, memberType }) => ({
        url: '/api/payroll/deductions/ids',
        params: {
          month,
          ...(status && status !== 'all' ? { status } : {}),
          ...(memberType && memberType !== 'all' ? { memberType } : {}),
        },
      }),
      providesTags: ['DeductionList'],
    }),
    processConfirmation: builder.mutation<PayrollDeduction, DeductionConfirmationDto>({
      query: (dto) => ({ url: '/api/payroll/confirmations', method: 'POST', body: dto }),
      invalidatesTags: ['DeductionList', 'Payroll'],
    }),
    reconcileDeductions: builder.mutation<ReconciliationReport, string>({
      query: (month) => ({ url: '/api/payroll/reconcile', method: 'POST', params: { month } }),
      invalidatesTags: ['DeductionList'],
    }),
    flagFailedDeduction: builder.mutation<void, { memberId: string; month: string; reason: string }>({
      query: ({ memberId, month, reason }) => ({
        url: '/api/payroll/failed-deductions',
        method: 'POST',
        params: { memberId, month, reason },
      }),
      invalidatesTags: ['DeductionList'],
    }),
  }),
});

export const {
  useGenerateDeductionListMutation,
  useGetDeductionListQuery,
  useGetDeductionListPagedQuery,
  useGetDeductionIdsQuery,
  useProcessConfirmationMutation,
  useReconcileDeductionsMutation,
  useFlagFailedDeductionMutation,
} = payrollApi;
