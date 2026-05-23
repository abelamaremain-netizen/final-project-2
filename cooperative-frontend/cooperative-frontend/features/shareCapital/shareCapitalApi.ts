import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';
import { ShareCapital, PassbookEntry } from '@/types';

interface PurchaseSharesDto {
  memberId: string;
  sharesCount: number;
}

interface TransferSharesDto {
  fromMemberId: string;
  toMemberId: string;
  sharesCount: number;
}

interface ShareSummary {
  totalMembers: number;
  totalShares: number;
  totalValue: number;
  averageSharesPerMember: number;
  currentPricePerShare: number;
}

export const shareCapitalApi = createApi({
  reducerPath: 'shareCapitalApi',
  baseQuery,
  tagTypes: ['ShareCapital', 'Passbook', 'ShareSummary'],
  // Share capital changes infrequently — keep cache for 5 minutes
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    // Purchase shares
    purchaseShares: builder.mutation<void, PurchaseSharesDto>({
      query: (data) => ({
        url: '/api/shares/purchase',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['ShareCapital', 'Passbook', 'ShareSummary'],
    }),

    // Transfer shares
    transferShares: builder.mutation<void, TransferSharesDto>({
      query: (data) => ({
        url: '/api/shares/transfer',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['ShareCapital', 'Passbook', 'ShareSummary'],
    }),

    // Get shares by member
    getSharesByMember: builder.query<ShareCapital, string>({
      query: (memberId) => ({ url: `/api/shares/${memberId}` }),
      providesTags: (_result, _error, memberId) => [{ type: 'ShareCapital', id: memberId }],
    }),

    // Get passbook (transaction history)
    getPassbook: builder.query<PassbookEntry[], string>({
      query: (memberId) => ({ url: `/api/members/${memberId}/passbook` }),
      providesTags: (_result, _error, memberId) => [{ type: 'Passbook', id: memberId }],
    }),

    // Get share summary (overview statistics)
    getShareSummary: builder.query<ShareSummary, void>({
      query: () => ({ url: '/api/shares/summary' }),
      providesTags: ['ShareSummary'],
    }),
  }),
});

export const {
  usePurchaseSharesMutation,
  useTransferSharesMutation,
  useGetSharesByMemberQuery,
  useGetPassbookQuery,
  useGetShareSummaryQuery,
} = shareCapitalApi;
