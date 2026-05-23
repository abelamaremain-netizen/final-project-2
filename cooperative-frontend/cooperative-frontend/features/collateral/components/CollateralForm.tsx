'use client';

import { useState } from 'react';
import { CircularProgress } from '@mui/material';
import {
  useAddCollateralMutation,
  useGetCollateralByApplicationQuery,
  useGetCollateralByLoanQuery,
  useReleaseCollateralMutation,
  useLiquidateCollateralMutation,
  useApproveExternalCollateralMutation,
  useUpdateCollateralMutation,
} from '../collateralApi';
import { useUploadDocumentMutation } from '@/features/documents/documentsApi';
import { toastSuccess, toastError } from '@/components/common/Toast';
import { MemberAccountPicker } from '@/components/common/MemberAccountPicker';
import { useGetAccountsByMemberQuery } from '@/features/accounts/accountsApi';
import { useGetCurrentConfigQuery } from '@/features/config/configApi';
import { useAuth } from '@/hooks/useAuth';
import { ROLES } from '@/constants/app';
import type { Collateral } from '@/types';

interface Props {
  applicationId?: string;
  loanId?: string;
  memberId?: string;
  memberType?: string;
  readonly?: boolean;
}

const statusColors: Record<string, string> = {
  PLEDGED: 'bg-blue-100 text-blue-700',
  RELEASED: 'bg-green-100 text-green-700',
  LIQUIDATED: 'bg-red-100 text-red-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
};

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';
const errCls = 'text-xs text-red-500 mt-1';

type CollateralType = 'OWN_SAVINGS' | 'GUARANTOR' | 'EXTERNAL_COOPERATIVE' | 'FIXED_ASSET';

interface FormState {
  collateralType: CollateralType;
  accountId: string;
  pledgedAmount: string;
  guarantorMemberId: string;
  guarantorAccountId: string;
  guaranteedAmount: string;
  guarantorConsentConfirmed: boolean;
  externalCooperativeName: string;
  externalAccountNumber: string;
  collateralValue: string;
  verificationDocument: string;
  verificationFile: File | null;
  assetType: string;
  assetDescription: string;
  vehicleYear: string;
  appraisalValue: string;
  appraisalDate: string;
  appraisedBy: string;
  appraisalDocumentRef: string;
  appraisalFile: File | null;
  uploading: boolean;
}

const defaultForm: FormState = {
  collateralType: 'OWN_SAVINGS',
  accountId: '',
  pledgedAmount: '',
  guarantorMemberId: '',
  guarantorAccountId: '',
  guaranteedAmount: '',
  guarantorConsentConfirmed: false,
  externalCooperativeName: '',
  externalAccountNumber: '',
  collateralValue: '',
  verificationDocument: '',
  verificationFile: null,
  assetType: 'REAL_ESTATE',
  assetDescription: '',
  vehicleYear: '',
  appraisalValue: '',
  appraisalDate: '',
  appraisedBy: '',
  appraisalDocumentRef: '',
  appraisalFile: null,
  uploading: false,
};

function buildPayload(form: FormState, targetId: string) {
  const base: any = { loanId: targetId, collateralType: form.collateralType };
  switch (form.collateralType) {
    case 'OWN_SAVINGS':
      base.accountId = form.accountId || undefined;
      base.pledgedAmount = parseFloat(form.pledgedAmount);
      base.collateralValue = parseFloat(form.pledgedAmount);
      break;
    case 'GUARANTOR':
      base.guarantorMemberId = form.guarantorMemberId || undefined;
      base.guarantorAccountId = form.guarantorAccountId || undefined;
      base.guaranteedAmount = parseFloat(form.guaranteedAmount);
      base.collateralValue = parseFloat(form.guaranteedAmount);
      break;
    case 'EXTERNAL_COOPERATIVE':
      base.externalCooperativeName = form.externalCooperativeName;
      base.externalAccountNumber = form.externalAccountNumber;
      base.verificationDocument = form.verificationDocument || undefined;
      base.collateralValue = parseFloat(form.collateralValue);
      break;
    case 'FIXED_ASSET':
      base.assetType = form.assetType;
      base.assetDescription = form.assetDescription;
      base.appraisalValue = parseFloat(form.appraisalValue);
      base.collateralValue = parseFloat(form.appraisalValue);
      if (form.vehicleYear) base.vehicleYear = parseInt(form.vehicleYear);
      if (form.appraisalDate) base.appraisalDate = form.appraisalDate;
      if (form.appraisedBy) base.appraisedBy = form.appraisedBy;
      if (form.appraisalDocumentRef) base.verificationDocument = form.appraisalDocumentRef;
      break;
  }
  return base;
}

// ── CollateralCard (unchanged) ──────────────────────────────────────────────

function CollateralCard({
  c, readonly, isManager, approving,
  onRelease, onLiquidate, onApprove,
}: {
  c: Collateral;
  readonly: boolean;
  isManager: boolean;
  approving: boolean;
  onRelease: (id: string) => void;
  onLiquidate: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<'release' | 'liquidate' | null>(null);
  const coverageAmount = (c as any).pledgedAmount ?? (c as any).guaranteedAmount ?? (c as any).appraisalValue ?? (c as any).collateralValue;

  return (
    <div className="p-3 rounded-lg bg-white border border-gray-200 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">{c.collateralType?.replace(/_/g, ' ')}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {c.status === 'PENDING_APPROVAL' ? 'Pending Approval' : c.status}
        </span>
      </div>
      {c.collateralType === 'OWN_SAVINGS' && (
        <div className="text-xs space-y-0.5">
          <p className="text-gray-600"><span className="text-gray-400">Pledged (locked): </span><span className="font-semibold text-blue-700">ETB {Number((c as any).pledgedAmount ?? 0).toLocaleString()}</span></p>
          {(c as any).accountId && <p className="text-gray-400 font-mono">Account: {String((c as any).accountId).slice(0, 8)}...</p>}
        </div>
      )}
      {c.collateralType === 'GUARANTOR' && (
        <div className="text-xs space-y-0.5">
          <p className="text-gray-600"><span className="text-gray-400">Guaranteed (locked): </span><span className="font-semibold text-purple-700">ETB {Number((c as any).guaranteedAmount ?? 0).toLocaleString()}</span></p>
          {(c as any).guarantorMemberId && <p className="text-gray-400 font-mono">Guarantor: {String((c as any).guarantorMemberId).slice(0, 8)}...</p>}
        </div>
      )}
      {c.collateralType === 'EXTERNAL_COOPERATIVE' && (
        <div className="text-xs space-y-0.5">
          <p className="text-gray-600"><span className="text-gray-400">Cooperative: </span><span className="font-semibold">{(c as any).externalCooperativeName}</span></p>
          <p className="text-gray-600"><span className="text-gray-400">Value: </span><span className="font-semibold">ETB {Number(coverageAmount ?? 0).toLocaleString()}</span></p>
          {(c as any).verificationDocument && <p className="text-gray-400">Doc ref: {(c as any).verificationDocument}</p>}
        </div>
      )}
      {c.collateralType === 'FIXED_ASSET' && (
        <div className="text-xs space-y-0.5">
          <p className="text-gray-600"><span className="text-gray-400">Type: </span><span className="font-semibold">{(c as any).assetType?.replace(/_/g, ' ')}</span>{(c as any).vehicleYear && <span className="ml-1 text-gray-400">({(c as any).vehicleYear})</span>}</p>
          {(c as any).assetDescription && <p className="text-gray-600">{(c as any).assetDescription}</p>}
          <p className="text-gray-600"><span className="text-gray-400">Appraised: </span><span className="font-semibold">ETB {Number((c as any).appraisalValue ?? 0).toLocaleString()}</span></p>
          {(c as any).appraisalDate && <p className="text-gray-400">Appraised: {new Date((c as any).appraisalDate).toLocaleDateString()}{(c as any).appraisedBy && ` by ${(c as any).appraisedBy}`}</p>}
          {(c as any).verificationDocument && <p className="text-gray-400">Appraisal doc: {(c as any).verificationDocument}</p>}
        </div>
      )}
      <div className="pt-1 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Coverage: <span className="font-semibold text-gray-700">ETB {Number(coverageAmount ?? 0).toLocaleString()}</span>
          {c.status === 'PLEDGED' && <span className="ml-2 text-blue-600">Active</span>}
        </p>
      </div>
      {c.status === 'PENDING_APPROVAL' && (
        <div className="flex items-center gap-2 pt-1">
          <p className="text-xs text-amber-700 flex-1">Awaiting manager approval.</p>
          {isManager && !readonly && (
            <button onClick={() => onApprove(c.id)} disabled={approving} className="px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50">
              {approving ? '...' : 'Approve'}
            </button>
          )}
        </div>
      )}
      {!readonly && c.status === 'PLEDGED' && (
        <div className="pt-1">
          {confirmAction === null && (
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction('release')} className="text-xs text-green-600 hover:underline font-medium">Release</button>
              {isManager && <button onClick={() => setConfirmAction('liquidate')} className="text-xs text-red-600 hover:underline font-medium">Liquidate</button>}
            </div>
          )}
          {confirmAction === 'release' && (
            <div className="p-2 rounded-md bg-green-50 border border-green-200 text-xs">
              <p className="text-green-800 font-semibold mb-1">Release this collateral?</p>
              <div className="flex gap-2">
                <button onClick={() => { onRelease(c.id); setConfirmAction(null); }} className="px-2.5 py-1 rounded-md bg-green-600 text-white font-medium">Confirm</button>
                <button onClick={() => setConfirmAction(null)} className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">Cancel</button>
              </div>
            </div>
          )}
          {confirmAction === 'liquidate' && (
            <div className="p-2 rounded-md bg-red-50 border border-red-200 text-xs">
              <p className="text-red-800 font-semibold mb-1">Liquidate this collateral?</p>
              <div className="flex gap-2">
                <button onClick={() => { onLiquidate(c.id); setConfirmAction(null); }} className="px-2.5 py-1 rounded-md bg-red-600 text-white font-medium">Confirm</button>
                <button onClick={() => setConfirmAction(null)} className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-600">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CollateralForm({ applicationId, loanId, memberId, memberType, readonly = false }: Props) {
  const targetId = applicationId ?? loanId ?? '';
  const isApplication = !!applicationId;
  const appQuery = useGetCollateralByApplicationQuery(targetId, { skip: !isApplication });
  const loanQuery = useGetCollateralByLoanQuery(targetId, { skip: isApplication });
  const { data: collaterals = [], isLoading, refetch } = isApplication ? appQuery : loanQuery;
  const { data: memberAccounts = [] } = useGetAccountsByMemberQuery(memberId ?? '', { skip: !memberId });
  const { data: config } = useGetCurrentConfigQuery();
  const [addCollateral, { isLoading: adding }] = useAddCollateralMutation();
  const [updateCollateral] = useUpdateCollateralMutation();
  const [releaseCollateral] = useReleaseCollateralMutation();
  const [liquidateCollateral] = useLiquidateCollateralMutation();
  const [approveExternal, { isLoading: approving }] = useApproveExternalCollateralMutation();
  const [uploadDocument] = useUploadDocumentMutation();
  const { hasAnyRole } = useAuth();
  const isManager = hasAnyRole([ROLES.MANAGER]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState('');

  const vehicleAgeLimitYears = config?.vehicleAgeLimitYears ?? 0;
  const fixedAssetLtvRatio = config ? Number(config.fixedAssetLtvRatio) : null;
  const appraisalValidityMonths = config?.collateralAppraisalValidityMonths ?? 0;
  const currentYear = new Date().getFullYear();
  const minVehicleYear = vehicleAgeLimitYears > 0 ? currentYear - vehicleAgeLimitYears : 1900;

  const set = (key: keyof FormState, val: string | boolean | File | null) => setForm(f => ({ ...f, [key]: val }));

  const ltvCoverage = (() => {
    if (form.collateralType !== 'FIXED_ASSET' || !form.appraisalValue || !fixedAssetLtvRatio) return null;
    const appraised = parseFloat(form.appraisalValue);
    if (isNaN(appraised) || appraised <= 0) return null;
    return appraised * fixedAssetLtvRatio;
  })();

  const appraisalDateValid = (() => {
    if (!form.appraisalDate || appraisalValidityMonths <= 0) return true;
    const expiry = new Date(form.appraisalDate);
    expiry.setMonth(expiry.getMonth() + appraisalValidityMonths);
    return new Date() <= expiry;
  })();

  const validate = (): string => {
    switch (form.collateralType) {
      case 'OWN_SAVINGS': {
        if (!form.accountId) return 'Select the member account to pledge';
        if (!form.pledgedAmount || isNaN(parseFloat(form.pledgedAmount))) return 'Pledged amount is required';
        if (parseFloat(form.pledgedAmount) <= 0) return 'Pledged amount must be greater than zero';
        if (memberAccounts.length > 0) {
          const selected = memberAccounts.find(a => a.id === form.accountId);
          if (selected) {
            const available = Number(selected.availableBalance ?? selected.balance ?? 0);
            if (parseFloat(form.pledgedAmount) > available)
              return `Pledged amount exceeds available balance (ETB ${available.toLocaleString()})`;
          }
        }
        break;
      }
      case 'GUARANTOR': {
        if (!form.guarantorAccountId) return "Select the guarantor's account";
        if (!form.guaranteedAmount || isNaN(parseFloat(form.guaranteedAmount))) return 'Guaranteed amount is required';
        if (parseFloat(form.guaranteedAmount) <= 0) return 'Guaranteed amount must be greater than zero';
        if (!form.guarantorConsentConfirmed) return 'You must confirm that the guarantor has given written consent';
        break;
      }
      case 'EXTERNAL_COOPERATIVE': {
        if (!form.externalCooperativeName) return 'Cooperative name is required';
        if (!form.verificationFile) return 'Verification document is required - please select a file';
        if (!form.collateralValue || isNaN(parseFloat(form.collateralValue))) return 'Collateral value is required';
        if (parseFloat(form.collateralValue) <= 0) return 'Collateral value must be greater than zero';
        break;
      }
      case 'FIXED_ASSET': {
        if (!form.assetDescription.trim()) return 'Asset description is required';
        if (!form.appraisalValue || isNaN(parseFloat(form.appraisalValue))) return 'Appraised value is required';
        if (parseFloat(form.appraisalValue) <= 0) return 'Appraised value must be greater than zero';
        if (!form.appraisalDate) return 'Appraisal date is required';
        if (!appraisalDateValid) return `Appraisal has expired. Appraisals are valid for ${appraisalValidityMonths} months.`;
        if (!form.appraisedBy.trim()) return 'Appraiser name is required';
        if (!form.appraisalFile) return 'Appraisal report is required - please select a file';
        if (form.assetType === 'VEHICLE') {
          if (!form.vehicleYear) return 'Vehicle year is required';
          const year = parseInt(form.vehicleYear);
          if (isNaN(year) || year > currentYear) return 'Vehicle year is not valid';
          if (vehicleAgeLimitYears > 0 && year < minVehicleYear)
            return `Vehicle is too old. Maximum allowed age is ${vehicleAgeLimitYears} years (minimum year: ${minVehicleYear})`;
        }
        break;
      }
    }
    return '';
  };

  // ✅ UPDATED: Upload document to COLLATERAL entity AND to LOAN_APPLICATION / LOAN entity
  // so the file appears in the main DocumentManager and stays tied to the loan lifecycle.
  const uploadAndLinkDocument = async (collateralId: string, file: File, documentType: string): Promise<string> => {
    // 1) Upload linked to COLLATERAL (for the collateral record)
    const formDataCollateral = new FormData();
    formDataCollateral.append('file', file);
    formDataCollateral.append('documentType', documentType);
    formDataCollateral.append('entityType', 'COLLATERAL');
    formDataCollateral.append('entityId', collateralId);
    formDataCollateral.append('description', `${documentType.replace(/_/g, ' ')} for collateral`);

    const result = await uploadDocument(formDataCollateral).unwrap();

    // 2) Also upload linked to LOAN_APPLICATION or LOAN so it appears in the main document list
    if (applicationId || loanId) {
      const formDataLoan = new FormData();
      formDataLoan.append('file', file);
      formDataLoan.append('documentType', documentType);
      formDataLoan.append('entityType', applicationId ? 'LOAN_APPLICATION' : 'LOAN');
      formDataLoan.append('entityId', applicationId ?? loanId ?? '');
      formDataLoan.append('description', `${documentType.replace(/_/g, ' ')} for collateral`);
      await uploadDocument(formDataLoan).unwrap();
    }

    return result.id;
  };

  const handleAdd = async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    set('uploading', true);

    try {
      // Step 1: Create the collateral
      const result = await addCollateral(buildPayload(form, targetId)).unwrap();
      const collateralId = result.id;

      // Step 2: Upload verification/appraisal document if needed
      const file = form.verificationFile || form.appraisalFile;
      if (file && (form.collateralType === 'EXTERNAL_COOPERATIVE' || form.collateralType === 'FIXED_ASSET')) {
        const documentType = form.collateralType === 'EXTERNAL_COOPERATIVE' 
          ? 'COLLATERAL_VERIFICATION' 
          : 'APPRAISAL_REPORT';
        
        const documentId = await uploadAndLinkDocument(collateralId, file, documentType);

        // Step 3: Update collateral with the document reference
        await updateCollateral({
          id: collateralId,
          verificationDocument: documentId,
        }).unwrap();
      }

      toastSuccess('Collateral added' + (file ? ' with document' : ''));
      setForm(defaultForm);
      setShowForm(false);
      refetch();
    } catch (e: any) {
      setFormError(e?.data?.message ?? 'Failed to add collateral');
    } finally {
      set('uploading', false);
    }
  };

  const handleRelease = async (id: string) => {
    try {
      await releaseCollateral(id).unwrap();
      toastSuccess('Collateral released');
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to release');
    }
  };

  const handleLiquidate = async (id: string) => {
    try {
      await liquidateCollateral(id).unwrap();
      toastSuccess('Collateral liquidated');
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to liquidate');
    }
  };

  const handleApproveExternal = async (id: string) => {
    try {
      await approveExternal(id).unwrap();
      toastSuccess('External collateral approved');
      refetch();
    } catch (e: any) {
      toastError(e?.data?.message ?? 'Failed to approve');
    }
  };

  if (isLoading) return <div className="flex justify-center py-4"><CircularProgress size={20} /></div>;

  return (
    <div className="space-y-3">
      {collaterals.length === 0 && !showForm && (
        <p className="text-sm text-gray-500 text-center py-2">No collateral recorded.</p>
      )}
      {(collaterals as Collateral[]).map((c) => (
        <CollateralCard key={c.id} c={c} readonly={readonly} isManager={isManager} approving={approving}
          onRelease={handleRelease} onLiquidate={handleLiquidate} onApprove={handleApproveExternal} />
      ))}

      {!readonly && (
        showForm ? (
          <div className="space-y-3 p-4 rounded-lg bg-white border border-gray-200">
            {/* Collateral Type Selector */}
            <div>
              <label className={labelCls}>Collateral Type</label>
              <select value={form.collateralType} onChange={e => { setForm({ ...defaultForm, collateralType: e.target.value as CollateralType }); setFormError(''); }} className={inputCls}>
                <option value="OWN_SAVINGS">Own Savings (member account)</option>
                <option value="GUARANTOR">Guarantor (another member account)</option>
                {(!memberType || memberType === 'EXTERNAL_COOPERATIVE') && <option value="EXTERNAL_COOPERATIVE">External Cooperative</option>}
                <option value="FIXED_ASSET">Fixed Asset (property / vehicle)</option>
              </select>
            </div>

            {/* OWN_SAVINGS fields */}
            {form.collateralType === 'OWN_SAVINGS' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                  The selected amount will be <strong>immediately locked</strong>.
                </div>
                <div>
                  <label className={labelCls}>Member Savings Account *</label>
                  {memberId && memberAccounts.length > 0 ? (
                    <select value={form.accountId} onChange={e => set('accountId', e.target.value)} className={inputCls}>
                      <option value="">Select account...</option>
                      {memberAccounts.filter(acc => (acc.accountType === 'REGULAR_SAVING' || acc.accountType === 'NON_REGULAR_SAVING') && acc.status === 'ACTIVE').map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.accountType.replace(/_/g, ' ')} - ETB {Number(acc.availableBalance ?? acc.balance).toLocaleString()} available</option>
                      ))}
                    </select>
                  ) : (
                    <MemberAccountPicker onAccountSelected={(accountId) => set('accountId', accountId)} />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Amount to Lock (ETB) *</label>
                  <input type="number" step="0.01" value={form.pledgedAmount} onChange={e => set('pledgedAmount', e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
              </div>
            )}

            {/* GUARANTOR fields */}
            {form.collateralType === 'GUARANTOR' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-800">
                  Guarantor funds will be <strong>immediately locked</strong>.
                </div>
                <div>
                  <label className={labelCls}>Guarantor Account *</label>
                  <MemberAccountPicker onAccountSelected={(accountId, acc) => { set('guarantorAccountId', accountId); if (acc) set('guarantorMemberId', (acc as any).memberId ?? ''); }} />
                </div>
                <div>
                  <label className={labelCls}>Amount to Guarantee (ETB) *</label>
                  <input type="number" step="0.01" value={form.guaranteedAmount} onChange={e => set('guaranteedAmount', e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.guarantorConsentConfirmed} onChange={e => set('guarantorConsentConfirmed', e.target.checked)} className="mt-0.5" />
                    <span className="text-xs text-amber-800"><strong>I confirm</strong> the guarantor has provided written consent.</span>
                  </label>
                </div>
              </div>
            )}

            {/* EXTERNAL_COOPERATIVE - File upload */}
            {form.collateralType === 'EXTERNAL_COOPERATIVE' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Requires <strong>manager approval</strong>. Upload the official verification letter below.
                </div>
                <div><label className={labelCls}>Cooperative Name *</label><input value={form.externalCooperativeName} onChange={e => set('externalCooperativeName', e.target.value)} className={inputCls} placeholder="Name of the external cooperative" /></div>
                <div><label className={labelCls}>Account Number</label><input value={form.externalAccountNumber} onChange={e => set('externalAccountNumber', e.target.value)} className={inputCls} placeholder="Optional" /></div>
                <div>
                  <label className={labelCls}>Verification Document *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      set('verificationFile', file);
                    }}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {form.verificationFile && (
                    <p className="text-xs text-green-600 mt-1">Selected: {form.verificationFile.name} ({(form.verificationFile.size / 1024).toFixed(1)} KB)</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Official letter from the cooperative. Will be stored in documents.</p>
                </div>
                <div><label className={labelCls}>Collateral Value (ETB) *</label><input type="number" step="0.01" value={form.collateralValue} onChange={e => set('collateralValue', e.target.value)} className={inputCls} placeholder="0.00" /></div>
              </div>
            )}

            {/* FIXED_ASSET - File upload for appraisal */}
            {form.collateralType === 'FIXED_ASSET' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1">
                  {fixedAssetLtvRatio && <p>LTV ratio: <strong>{(fixedAssetLtvRatio * 100).toFixed(0)}%</strong> of appraised value</p>}
                  {appraisalValidityMonths > 0 && <p>Appraisal validity: <strong>{appraisalValidityMonths} months</strong></p>}
                  {vehicleAgeLimitYears > 0 && <p>Vehicle age limit: <strong>{vehicleAgeLimitYears} years</strong></p>}
                </div>
                <div>
                  <label className={labelCls}>Asset Type *</label>
                  <select value={form.assetType} onChange={e => { set('assetType', e.target.value); set('vehicleYear', ''); }} className={inputCls}>
                    <option value="REAL_ESTATE">Real Estate</option>
                    <option value="VEHICLE">Vehicle</option>
                    <option value="EQUIPMENT">Equipment / Machinery</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div><label className={labelCls}>Asset Description *</label><input value={form.assetDescription} onChange={e => set('assetDescription', e.target.value)} className={inputCls} placeholder="Describe the asset..." /></div>
                {form.assetType === 'VEHICLE' && (
                  <div>
                    <label className={labelCls}>Vehicle Year *</label>
                    <input type="number" value={form.vehicleYear} onChange={e => set('vehicleYear', e.target.value)} className={inputCls} placeholder={`e.g. ${currentYear - 3}`} min={minVehicleYear} max={currentYear} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Appraised Value (ETB) *</label>
                    <input type="number" step="0.01" value={form.appraisalValue} onChange={e => set('appraisalValue', e.target.value)} className={inputCls} placeholder="0.00" />
                    {ltvCoverage !== null && <p className="text-xs text-blue-700 mt-1">Coverage: <strong>ETB {ltvCoverage.toLocaleString()}</strong></p>}
                  </div>
                  <div>
                    <label className={labelCls}>Appraisal Date *</label>
                    <input type="date" value={form.appraisalDate} onChange={e => set('appraisalDate', e.target.value)} className={inputCls} max={new Date().toISOString().split('T')[0]} />
                  </div>
                </div>
                <div><label className={labelCls}>Appraiser Name *</label><input value={form.appraisedBy} onChange={e => set('appraisedBy', e.target.value)} className={inputCls} placeholder="Full name of certified appraiser" /></div>
                <div>
                  <label className={labelCls}>Appraisal Report *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      set('appraisalFile', file);
                    }}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {form.appraisalFile && (
                    <p className="text-xs text-green-600 mt-1">Selected: {form.appraisalFile.name} ({(form.appraisalFile.size / 1024).toFixed(1)} KB)</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Appraisal report will be stored in documents.</p>
                </div>
              </div>
            )}

            {formError && <p className={errCls}>{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={adding || form.uploading}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1"
              >
                {(adding || form.uploading) && <CircularProgress size={14} color="inherit" />}
                {form.uploading ? 'Uploading...' : adding ? 'Adding...' : 'Add Collateral'}
              </button>
              <button onClick={() => { setShowForm(false); setFormError(''); setForm(defaultForm); }} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} className="text-xs text-blue-600 hover:underline font-medium">+ Add Collateral</button>
        )
      )}
    </div>
  );
}