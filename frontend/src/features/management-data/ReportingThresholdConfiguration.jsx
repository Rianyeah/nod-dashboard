import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, RefreshCw, Save, Target } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  fetchReportingRevenueTargets,
  fetchReportingThresholds,
  saveReportingRevenueTarget,
  saveReportingThresholds,
} from '../../services/api';
import {
  SITE_CLASSES,
  thresholdDraftPayload,
  thresholdSnapshotDraft,
  validateThresholdDraft,
} from './reportingThresholdState';


const SITE_CLASS_LABELS = {
  diamond: 'Diamond',
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};


function localMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}


function requestErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  return 'Permintaan gagal. Periksa koneksi dan coba lagi.';
}


function formatTimestamp(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}


function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}


function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-300">{message}</p>;
}


export default function ReportingThresholdConfiguration() {
  const [effectiveMonth, setEffectiveMonth] = useState(localMonth);
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(() => thresholdSnapshotDraft(null));
  const [errors, setErrors] = useState({});
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdError, setThresholdError] = useState('');
  const [thresholdSuccess, setThresholdSuccess] = useState('');
  const [revenueTargets, setRevenueTargets] = useState([]);
  const [targetForm, setTargetForm] = useState({
    nop: '',
    trx_month: localMonth(),
    target_revenue: '',
    note: '',
  });
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [targetSuccess, setTargetSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchReportingThresholds(effectiveMonth, controller.signal)
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setDraft(thresholdSnapshotDraft(nextSnapshot));
        setErrors({});
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError') setThresholdError(requestErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setThresholdLoading(false);
      });
    return () => controller.abort();
  }, [effectiveMonth]);

  const refreshRevenueTargets = useCallback(async (signal) => {
    try {
      const rows = await fetchReportingRevenueTargets({ limit: 50 }, signal);
      setRevenueTargets(rows);
    } catch (error) {
      if (error?.name !== 'CanceledError') setTargetError(requestErrorMessage(error));
    } finally {
      if (!signal?.aborted) setTargetLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchReportingRevenueTargets({ limit: 50 }, controller.signal)
      .then((rows) => setRevenueTargets(rows))
      .catch((error) => {
        if (error?.name !== 'CanceledError') setTargetError(requestErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTargetLoading(false);
      });
    return () => controller.abort();
  }, []);

  const validation = useMemo(() => validateThresholdDraft(draft), [draft]);

  const changeEffectiveMonth = (value) => {
    setThresholdLoading(true);
    setThresholdError('');
    setThresholdSuccess('');
    setEffectiveMonth(value);
  };

  const handleRevenueRefresh = () => {
    setTargetLoading(true);
    setTargetError('');
    refreshRevenueTargets();
  };

  const updateAvailability = (siteClass, value) => {
    setDraft((current) => ({
      ...current,
      availability: { ...current.availability, [siteClass]: value },
    }));
    setThresholdSuccess('');
  };

  const saveThresholds = async (event) => {
    event.preventDefault();
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setThresholdSaving(true);
    setThresholdError('');
    setThresholdSuccess('');
    try {
      const saved = await saveReportingThresholds(
        effectiveMonth,
        thresholdDraftPayload(draft),
      );
      setSnapshot(saved);
      setDraft(thresholdSnapshotDraft(saved));
      setErrors({});
      setThresholdSuccess(`Threshold berlaku mulai ${effectiveMonth}.`);
    } catch (error) {
      setThresholdError(requestErrorMessage(error));
    } finally {
      setThresholdSaving(false);
    }
  };

  const saveRevenueTarget = async (event) => {
    event.preventDefault();
    const amount = String(targetForm.target_revenue).trim();
    if (!targetForm.nop.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetForm.trx_month) || !/^\d+$/.test(amount)) {
      setTargetError('Isi NOP, bulan, dan target revenue dalam rupiah bulat.');
      return;
    }
    setTargetSaving(true);
    setTargetError('');
    setTargetSuccess('');
    try {
      await saveReportingRevenueTarget(
        targetForm.nop.trim(),
        targetForm.trx_month,
        {
          target_revenue: Number(amount),
          note: targetForm.note.trim() || null,
        },
      );
      setTargetSuccess(`Target ${targetForm.nop.trim().toUpperCase()} untuk ${targetForm.trx_month} tersimpan.`);
      setTargetForm((current) => ({ ...current, target_revenue: '', note: '' }));
      setTargetLoading(true);
      await refreshRevenueTargets();
    } catch (error) {
      setTargetError(requestErrorMessage(error));
    } finally {
      setTargetSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={saveThresholds} className="glass-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-semibold">Target performa site</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Perubahan berlaku mulai bulan yang dipilih dan tidak mengubah interpretasi bulan sebelumnya.
            </p>
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="threshold-effective-month" className="text-xs font-medium text-[var(--text-secondary)]">
              Bulan efektif
            </label>
            <Input
              id="threshold-effective-month"
              type="month"
              value={effectiveMonth}
              onChange={(event) => changeEffectiveMonth(event.target.value)}
              className="mt-1 rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-5 px-4 py-4 sm:px-5">
          {thresholdLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Memuat threshold">
              {SITE_CLASSES.map((siteClass) => (
                <div key={siteClass} className="h-20 animate-pulse rounded-xl bg-[var(--bg-elevated)]/65" />
              ))}
            </div>
          ) : (
            <>
              <fieldset>
                <legend className="text-xs font-semibold text-[var(--text-primary)]">Availability per Site Class</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {SITE_CLASSES.map((siteClass) => (
                    <div key={siteClass}>
                      <label htmlFor={`availability-${siteClass}`} className="text-xs text-[var(--text-secondary)]">
                        {SITE_CLASS_LABELS[siteClass]}
                      </label>
                      <div className="relative mt-1">
                        <Input
                          id={`availability-${siteClass}`}
                          inputMode="decimal"
                          value={draft.availability[siteClass]}
                          onChange={(event) => updateAvailability(siteClass, event.target.value)}
                          aria-invalid={Boolean(errors[siteClass])}
                          className="rounded-xl pr-9 font-mono"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-muted)]">%</span>
                      </div>
                      <FieldError message={errors[siteClass]} />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label htmlFor="threshold-u30" className="text-xs font-medium text-[var(--text-secondary)]">Batas U30 revenue</label>
                  <Input
                    id="threshold-u30"
                    inputMode="numeric"
                    value={draft.revenue_u30_upper}
                    onChange={(event) => setDraft({ ...draft, revenue_u30_upper: event.target.value })}
                    aria-invalid={Boolean(errors.revenue_u30_upper)}
                    className="mt-1 rounded-xl font-mono"
                  />
                  <FieldError message={errors.revenue_u30_upper} />
                </div>
                <div>
                  <label htmlFor="threshold-u60" className="text-xs font-medium text-[var(--text-secondary)]">Batas U60 revenue</label>
                  <Input
                    id="threshold-u60"
                    inputMode="numeric"
                    value={draft.revenue_u60_upper}
                    onChange={(event) => setDraft({ ...draft, revenue_u60_upper: event.target.value })}
                    aria-invalid={Boolean(errors.revenue_u60_upper)}
                    className="mt-1 rounded-xl font-mono"
                  />
                  <FieldError message={errors.revenue_u60_upper} />
                </div>
                <div>
                  <label htmlFor="threshold-payload" className="text-xs font-medium text-[var(--text-secondary)]">Target Payload bulanan</label>
                  <div className="relative mt-1">
                    <Input
                      id="threshold-payload"
                      inputMode="decimal"
                      value={draft.payload_target_tb}
                      onChange={(event) => setDraft({ ...draft, payload_target_tb: event.target.value })}
                      aria-invalid={Boolean(errors.payload_target_tb)}
                      className="rounded-xl pr-10 font-mono"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-muted)]">TB</span>
                  </div>
                  <FieldError message={errors.payload_target_tb} />
                </div>
              </div>
            </>
          )}

          {thresholdError ? <Alert className="border-red-500/25 bg-red-500/10"><AlertTitle>Threshold tidak dapat dimuat atau disimpan</AlertTitle><AlertDescription>{thresholdError}</AlertDescription></Alert> : null}
          {thresholdSuccess ? <Alert className="border-emerald-500/25 bg-emerald-500/10"><AlertTitle>Threshold tersimpan</AlertTitle><AlertDescription>{thresholdSuccess}</AlertDescription></Alert> : null}
          {!thresholdLoading && snapshot && !snapshot.complete ? <Alert><AlertTitle>Konfigurasi belum lengkap</AlertTitle><AlertDescription>Lengkapi semua target sebelum menyimpan versi bulan ini.</AlertDescription></Alert> : null}

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              Berlaku dari {snapshot?.effective_month || '-'} | Diperbarui {formatTimestamp(snapshot?.updated_at)} oleh {snapshot?.updated_by || '-'}
            </p>
            <Button type="submit" disabled={thresholdLoading || thresholdSaving || !validation.valid} className="rounded-xl sm:min-w-36">
              {thresholdSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
              Simpan threshold
            </Button>
          </div>
        </div>
      </form>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold">Target revenue NOP bulanan</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Target ini digunakan oleh Executive Insight revenue dan terpisah dari klasifikasi U30/U60 per site.</p>
        </div>
        <form onSubmit={saveRevenueTarget} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_180px_220px_1.3fr_auto] lg:items-end">
          <div>
            <label htmlFor="revenue-target-nop" className="text-xs text-[var(--text-secondary)]">NOP</label>
            <Input id="revenue-target-nop" value={targetForm.nop} onChange={(event) => setTargetForm({ ...targetForm, nop: event.target.value })} placeholder="Contoh: SIDOARJO" className="mt-1 rounded-xl" />
          </div>
          <div>
            <label htmlFor="revenue-target-month" className="text-xs text-[var(--text-secondary)]">Bulan</label>
            <Input id="revenue-target-month" type="month" value={targetForm.trx_month} onChange={(event) => setTargetForm({ ...targetForm, trx_month: event.target.value })} className="mt-1 rounded-xl" />
          </div>
          <div>
            <label htmlFor="revenue-target-value" className="text-xs text-[var(--text-secondary)]">Target revenue</label>
            <Input id="revenue-target-value" inputMode="numeric" value={targetForm.target_revenue} onChange={(event) => setTargetForm({ ...targetForm, target_revenue: event.target.value })} placeholder="Rupiah" className="mt-1 rounded-xl font-mono" />
          </div>
          <div>
            <label htmlFor="revenue-target-note" className="text-xs text-[var(--text-secondary)]">Catatan (opsional)</label>
            <Textarea id="revenue-target-note" rows={1} value={targetForm.note} onChange={(event) => setTargetForm({ ...targetForm, note: event.target.value })} className="mt-1 min-h-9 resize-none rounded-xl" />
          </div>
          <Button type="submit" disabled={targetSaving} className="rounded-xl">
            {targetSaving ? <LoaderCircle className="animate-spin" /> : <Target />}
            Simpan target
          </Button>
        </form>

        {targetError ? <div className="px-4 pb-4 sm:px-5"><Alert className="border-red-500/25 bg-red-500/10"><AlertTitle>Target revenue gagal</AlertTitle><AlertDescription>{targetError}</AlertDescription></Alert></div> : null}
        {targetSuccess ? <div className="px-4 pb-4 sm:px-5"><Alert className="border-emerald-500/25 bg-emerald-500/10"><AlertTitle>Target revenue tersimpan</AlertTitle><AlertDescription>{targetSuccess}</AlertDescription></Alert></div> : null}

        <div className="border-t border-[var(--border)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <h3 className="text-xs font-semibold">Target terbaru</h3>
            <Button type="button" variant="ghost" size="sm" onClick={handleRevenueRefresh} disabled={targetLoading}>
              <RefreshCw data-icon="inline-start" /> Refresh
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-t border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                <tr><th className="px-5 py-2">NOP</th><th className="px-3 py-2">Bulan</th><th className="px-3 py-2 text-right">Target revenue</th><th className="px-3 py-2">Catatan</th><th className="px-5 py-2">Diperbarui</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {revenueTargets.map((item) => (
                  <tr key={`${item.nop_key}-${item.trx_month}`}>
                    <td className="px-5 py-2 font-semibold">{item.nop_key}</td>
                    <td className="px-3 py-2 font-mono">{item.trx_month}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatRupiah(item.target_revenue)}</td>
                    <td className="max-w-72 truncate px-3 py-2 text-[var(--text-secondary)]" title={item.note || ''}>{item.note || '-'}</td>
                    <td className="px-5 py-2 text-[var(--text-muted)]">{formatTimestamp(item.updated_at)} | {item.updated_by || '-'}</td>
                  </tr>
                ))}
                {!targetLoading && !revenueTargets.length ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--text-muted)]">Belum ada target revenue NOP.</td></tr> : null}
                {targetLoading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--text-muted)]">Memuat target revenue...</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
