'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircularProgress } from '@mui/material';
import { useInitiateRestructuringMutation } from '../loansApi';
import { useGetCurrentConfigQuery } from '@/features/config/configApi';

const schema = z.object({
  restructuringReason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
  newDurationMonths: z.number().int().min(1, 'Min 1 month').max(360, 'Max 360 months'),
  newInterestRate: z.number().min(0.01, 'Interest rate must be positive'),
});

type FormData = z.infer<typeof schema>;

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';
const errCls = 'text-xs text-red-500 mt-1';

export function LoanRestructuringForm({ loanId, onSuccess }: { loanId: string; onSuccess?: () => void }) {
  const [initiateRestructuring, { isLoading, error, isSuccess }] = useInitiateRestructuringMutation();
  const { data: config } = useGetCurrentConfigQuery();

  const minRate = config ? Number(config.loanInterestRateMin) * 100 : 0;
  const maxRate = config ? Number(config.loanInterestRateMax) * 100 : 100;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await initiateRestructuring({
        loanId,
        ...data,
        newInterestRate: data.newInterestRate / 100,
      }).unwrap();
      reset();
      onSuccess?.();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      {isSuccess && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          Restructuring request submitted successfully.
        </div>
      )}
      {!!error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {String((error as any)?.data?.message ?? 'Failed to submit restructuring request')}
        </div>
      )}

      <div>
        <label className={labelCls}>Reason for Restructuring *</label>
        <textarea {...register('restructuringReason')} rows={3} className={inputCls} placeholder="Explain why restructuring is needed..." />
        {errors.restructuringReason && <p className={errCls}>{errors.restructuringReason.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>New Duration (months) *</label>
          <input type="number" min="1" max="360" {...register('newDurationMonths', { valueAsNumber: true })} className={inputCls} placeholder="24" />
          {errors.newDurationMonths && <p className={errCls}>{errors.newDurationMonths.message}</p>}
        </div>
        <div>
          <label className={labelCls}>New Interest Rate (%) *{config && ` — allowed: ${minRate.toFixed(1)}%–${maxRate.toFixed(1)}%`}</label>
          <input
            type="number" step="0.01"
            min={minRate} max={maxRate}
            {...register('newInterestRate', { valueAsNumber: true })}
            className={inputCls}
            placeholder={config ? `${minRate.toFixed(1)}` : ''}
          />
          {errors.newInterestRate && <p className={errCls}>{errors.newInterestRate.message}</p>}
          {config && (
            <p className="text-xs text-gray-400 mt-1">
              Allowed range: {minRate.toFixed(1)}% – {maxRate.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading && <CircularProgress size={14} color="inherit" />}
        {isLoading ? 'Submitting...' : 'Request Restructuring'}
      </button>
    </form>
  );
}
