import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api/client';
import type { DocumentMeta } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export const documentsApi = createApi({
  reducerPath: 'documentsApi',
  baseQuery,
  tagTypes: ['Document'],
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    /**
     * File upload uses native fetch so the browser sets
     * Content-Type: multipart/form-data with the correct boundary automatically.
     */
    uploadDocument: builder.mutation<DocumentMeta, FormData>({
      queryFn: async (formData) => {
        try {
          const token = typeof window !== 'undefined'
            ? localStorage.getItem('auth_token')
            : null;

          const res = await fetch(`${API_BASE}/api/documents`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
            return { error: { status: res.status, data: err } };
          }

          return { data: await res.json() };
        } catch (e: any) {
          return { error: { status: 'FETCH_ERROR', data: e.message } };
        }
      },
      invalidatesTags: ['Document'],
    }),

    getDocumentsByEntity: builder.query<DocumentMeta[], { entityType: string; entityId: string }>({
      query: ({ entityType, entityId }) => ({
        url: '/api/documents',
        params: { entityType, entityId },
      }),
      providesTags: ['Document'],
    }),

    getDocumentMetadata: builder.query<DocumentMeta, string>({
      query: (id) => ({ url: `/api/documents/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Document', id }],
    }),

    /**
     * Get a presigned MinIO URL for direct browser download.
     * Returns { url: string } — valid for the configured expiry window (default 30 min).
     */
    getDownloadUrl: builder.query<{ url: string }, string>({
      query: (id) => ({ url: `/api/documents/${id}/download` }),
    }),

    deleteDocument: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/documents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Document'],
    }),
  }),
});

export const {
  useUploadDocumentMutation,
  useGetDocumentsByEntityQuery,
  useGetDocumentMetadataQuery,
  useGetDownloadUrlQuery,
  useDeleteDocumentMutation,
} = documentsApi;
