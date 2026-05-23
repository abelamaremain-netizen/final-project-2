'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircularProgress } from '@mui/material';
import { useSubmitAppealMutation } from '../loansApi';
import { useUploadDocumentMutation } from '@/features/documents/documentsApi';

const schema = z.object({
  appealReason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  applicationId: string;
  memberId: string;
  onSuccess?: () => void;
}

export function LoanAppealForm({ applicationId, memberId, onSuccess }: Props) {
  const [submitAppeal, { isLoading }] = useSubmitAppealMutation();
  const [uploadDocument] = useUploadDocumentMutation();
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);
    
    try {
      await submitAppeal({
        applicationId,
        memberId,
        appealReason: data.appealReason,
      }).unwrap();

      if (attachedFile) {
        try {
          const formData = new FormData();
          formData.append('file', attachedFile);
          formData.append('documentType', 'APPEAL_SUPPORTING_DOC');
          formData.append('entityType', 'LOAN_APPLICATION');
          formData.append('entityId', applicationId);
          formData.append('description', `Appeal supporting document for application ${applicationId}`);
          await uploadDocument(formData).unwrap();
        } catch (e: any) {
          console.warn('Document upload failed:', e);
        }
      }

      setSubmitSuccess(true);
      reset();
      setAttachedFile(null);
      onSuccess?.();
    } catch (e: any) {
      setSubmitError(e?.data?.message ?? 'Failed to submit appeal');
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';
  const errCls = 'text-xs text-red-500 mt-1';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {submitSuccess && (
        <div className="p-3 rounded-xl bg-green-50/80 border border-green-200 text-green-700 text-sm">
          Appeal submitted successfully.
        </div>
      )}
      {submitError && (
        <div className="p-3 rounded-xl bg-red-50/80 border border-red-200 text-red-700 text-sm">
          {submitError}
        </div>
      )}

      <div>
        <label className={labelCls}>Appeal Reason</label>
        <textarea
          {...register('appealReason')}
          rows={4}
          className={inputCls}
          placeholder="Explain why this loan application should be reconsidered..."
        />
        {errors.appealReason && <p className={errCls}>{errors.appealReason.message}</p>}
      </div>

      <div>
        <label className={labelCls}>Supporting Document <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {attachedFile && (
          <p className="text-xs text-green-600 mt-1">
            Selected: {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Attach new evidence (payslip, employment letter, etc.) to support your appeal
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? <CircularProgress size={16} color="inherit" /> : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        )}
        {isLoading ? 'Submitting...' : 'Submit Appeal'}
      </button>
    </form>
  );
}