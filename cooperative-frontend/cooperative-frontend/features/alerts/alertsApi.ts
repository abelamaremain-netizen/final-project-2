import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';

export interface MissedDepositAlert {
  memberId: string;
  memberCode: string;
  memberName: string;
  deductionStatus: 'PENDING' | 'FAILED';
  month: string;
}

export interface MissedRepaymentAlert {
  loanId: string;
  loanCode: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  outstandingAmount: number;
  firstPaymentDate: string;
  month: string;
}

export const alertsApi = createApi({
  reducerPath: 'alertsApi',
  baseQuery,
  tagTypes: ['Alert'],
  keepUnusedDataFor: 120,
  endpoints: (builder) => ({
    getMissedDeposits: builder.query<MissedDepositAlert[], string | undefined>({
      query: (month) => ({
        url: '/api/alerts/missed-deposits',
        params: month ? { month } : {},
      }),
      providesTags: ['Alert'],
    }),
    getMissedRepayments: builder.query<MissedRepaymentAlert[], string | undefined>({
      query: (month) => ({
        url: '/api/alerts/missed-repayments',
        params: month ? { month } : {},
      }),
      providesTags: ['Alert'],
    }),
  }),
});

export const {
  useGetMissedDepositsQuery,
  useGetMissedRepaymentsQuery,
} = alertsApi;
