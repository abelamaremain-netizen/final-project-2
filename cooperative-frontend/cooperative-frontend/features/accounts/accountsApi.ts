import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';
import { Account, Transaction, PageResponse } from '@/types';

// Backend AccountDto shape (no pagination, no member object, no accountNumber)
export interface AccountDto {
  id: string;
  code: string;
  memberId: string;
  accountType: string;
  balance: number;
  pledgedAmount: number;
  availableBalance: number;
  interestRate: number;
  createdDate: string;
  lastInterestDate?: string;
  status: string;
  frozenBySuspension: boolean;
  freezeReason?: string;
  unfreezeReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DepositRequest {
  amount: number;
  source?: string;
  reference?: string;
  notes?: string;
}

export interface WithdrawRequest {
  amount: number;
  notes?: string;
}

export const accountsApi = createApi({
  reducerPath: 'accountsApi',
  baseQuery,
  tagTypes: ['Account', 'Transaction'],
  // Account balances change with transactions — keep cache for 60 seconds
  keepUnusedDataFor: 60,
  endpoints: (builder) => ({
    // GET /api/accounts/search?q=  (smart search - detects ACC- prefix)
    searchAccounts: builder.query<AccountDto[], string>({
      query: (search) => ({
        url: '/api/accounts/search',
        params: { q: search },
      }),
      providesTags: ['Account'],
    }),

    // GET /api/accounts/member/{memberId}
    getAccountsByMember: builder.query<AccountDto[], string>({
      query: (memberId) => ({ url: `/api/accounts/member/${memberId}` }),
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Account' as const, id })), 'Account']
          : ['Account'],
    }),

    // GET /api/accounts/{id}/balance  (returns AccountDto)
    getAccountById: builder.query<AccountDto, string>({
      query: (id) => ({ url: `/api/accounts/${id}/balance` }),
      providesTags: (_result, _error, id) => [{ type: 'Account', id }],
    }),

    // GET /api/accounts/{id}/transactions  (returns Page<TransactionDto>)
    getAccountTransactions: builder.query<PageResponse<Transaction>, { id: string; page?: number; size?: number }>({
      query: ({ id, page = 0, size = 20 }) => ({
        url: `/api/accounts/${id}/transactions`,
        params: { page, size },
      }),
      providesTags: (_result, _error, { id }) => [{ type: 'Transaction', id }],
    }),

    // POST /api/accounts/regular?memberId=  (query param, not body)
    createRegularAccount: builder.mutation<AccountDto, string>({
      query: (memberId) => ({
        url: `/api/accounts/regular?memberId=${memberId}`,
        method: 'POST',
      }),
      invalidatesTags: ['Account'],
    }),

    // POST /api/accounts/non-regular?memberId=
    createNonRegularAccount: builder.mutation<AccountDto, string>({
      query: (memberId) => ({
        url: `/api/accounts/non-regular?memberId=${memberId}`,
        method: 'POST',
      }),
      invalidatesTags: ['Account'],
    }),

    // POST /api/accounts/{id}/deposit
    deposit: builder.mutation<Transaction, { accountId: string; data: DepositRequest }>({
      query: ({ accountId, data }) => ({
        url: `/api/accounts/${accountId}/deposit`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: 'Account', id: accountId },
        { type: 'Transaction', id: accountId },
        'Account',
      ],
    }),

    // POST /api/accounts/{id}/withdraw
    withdraw: builder.mutation<Transaction, { accountId: string; data: WithdrawRequest }>({
      query: ({ accountId, data }) => ({
        url: `/api/accounts/${accountId}/withdraw`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: 'Account', id: accountId },
        { type: 'Transaction', id: accountId },
        'Account',
      ],
    }),

    // POST /api/accounts/{id}/freeze
    freezeAccount: builder.mutation<AccountDto, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/api/accounts/${id}/freeze?reason=${encodeURIComponent(reason)}`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Account', id }, 'Account'],
    }),

    // POST /api/accounts/{id}/unfreeze
    unfreezeAccount: builder.mutation<AccountDto, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/api/accounts/${id}/unfreeze?reason=${encodeURIComponent(reason)}`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Account', id }, 'Account'],
    }),
  }),
});

export const {
  useSearchAccountsQuery,
  useGetAccountsByMemberQuery,
  useGetAccountByIdQuery,
  useGetAccountTransactionsQuery,
  useCreateRegularAccountMutation,
  useCreateNonRegularAccountMutation,
  useDepositMutation,
  useWithdrawMutation,
  useFreezeAccountMutation,
  useUnfreezeAccountMutation,
} = accountsApi;