import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  DatabaseZap,
  FileSpreadsheet,
  History,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useAuth } from '../auth/AuthContext';
import {
  commitManagementImport,
  createDashboardUser,
  deletePicAlias,
  fetchDashboardUsers,
  fetchManagementImports,
  fetchManagementTargets,
  fetchPicAliases,
  savePicAlias,
  updateDashboardUser,
  validateManagementImport,
} from '../services/api';
import { formatNumber } from '../utils/formatters';
import ReportingThresholdConfiguration from '../features/management-data/ReportingThresholdConfiguration';

const TABS = [
  { key: 'imports', label: 'Imports', icon: FileSpreadsheet },
  { key: 'aliases', label: 'PIC Aliases', icon: KeyRound },
  { key: 'thresholds', label: 'Threshold Configuration', icon: SlidersHorizontal },
  { key: 'users', label: 'Users & Roles', icon: Users, permission: 'users:manage' },
];

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return 'Permintaan gagal. Periksa koneksi dan coba lagi.';
}

function formatTimestamp(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusPill({ status }) {
  const tone = status === 'completed'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : status === 'failed'
      ? 'border-red-500/25 bg-red-500/10 text-red-300'
      : 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{status}</span>;
}

function Metric({ label, value, tone = '' }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/45 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${tone}`}>{formatNumber(value || 0)}</p>
    </div>
  );
}

function ImportsPanel({ targets, history, onRefresh }) {
  const [selectedTarget, setSelectedTarget] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeTarget = targets.some((target) => target.key === selectedTarget)
    ? selectedTarget
    : targets[0]?.key || '';
  const selected = useMemo(
    () => targets.find((target) => target.key === activeTarget),
    [activeTarget, targets],
  );

  const resetDialog = () => {
    setFiles([]);
    setPreview(null);
    setError('');
  };

  const handleValidate = async () => {
    if (!files.length || !activeTarget) return;
    setBusy(true);
    setError('');
    try {
      setPreview(await validateManagementImport(activeTarget, files));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!preview?.id) return;
    setBusy(true);
    setError('');
    try {
      const result = await commitManagementImport(preview.id);
      setPreview((current) => ({ ...current, ...result, preview_rows: current.preview_rows }));
      await onRefresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="glass-card p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label htmlFor="management-target" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tabel tujuan
            </label>
            <Select value={activeTarget} onValueChange={setSelectedTarget}>
              <SelectTrigger id="management-target" className="mt-2 h-11 w-full max-w-xl rounded-xl bg-[var(--bg-elevated)]/60">
                <SelectValue placeholder="Pilih tabel NeonDB" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => <SelectItem key={target.key} value={target.key}>{target.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {selected?.description || 'Pilih tabel untuk melihat format import yang didukung.'}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={!selected}
            onClick={() => { resetDialog(); setDialogOpen(true); }}
            className="rounded-xl"
          >
            <Upload data-icon="inline-start" />
            Upload file
          </Button>
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-[var(--primary-light)]" />
            <h2 className="text-sm font-semibold">Riwayat import</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw data-icon="inline-start" /> Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2">Waktu</th><th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Operator</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Source</th><th className="px-3 py-2 text-right">Insert</th>
                <th className="px-3 py-2 text-right">Update</th><th className="px-4 py-2 text-right">Invalid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {history.map((job) => (
                <tr key={job.id} className="hover:bg-[var(--bg-elevated)]/40">
                  <td className="px-4 py-2 font-mono text-[var(--text-secondary)]">{formatTimestamp(job.created_at)}</td>
                  <td className="px-3 py-2 font-medium">{job.target}</td>
                  <td className="px-3 py-2">{job.actor_username}</td>
                  <td className="px-3 py-2"><StatusPill status={job.status} /></td>
                  <td className="px-3 py-2 text-right font-mono">{formatNumber(job.source_rows)}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatNumber(job.inserted_rows)}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-200">{formatNumber(job.updated_rows)}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-300">{formatNumber(job.invalid_rows)}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">Belum ada riwayat import.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Upload ke {selected?.label}</DialogTitle>
            <DialogDescription>
              {selected?.strategy === 'upsert' ? 'Nomor ticket menjadi kunci upsert dan riwayat lama dipertahankan.' : 'Satu periode bulan akan diganti atomik setelah preview disetujui.'}
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="space-y-4">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)]/35 p-5 text-center hover:bg-[var(--bg-elevated)]/60">
                <FileSpreadsheet className="mb-3 size-8 text-[var(--primary-light)]" />
                <span className="text-sm font-semibold">Pilih file Excel atau CSV</span>
                <span className="mt-1 text-xs text-[var(--text-muted)]">Maksimal 8 MB per file dan 20 MB total</span>
                <Input
                  type="file"
                  accept={(selected?.accepted_extensions || []).join(',')}
                  multiple={selected?.supports_multiple_files}
                  className="sr-only"
                  onChange={(event) => setFiles(Array.from(event.target.files || []))}
                />
              </label>
              {files.length ? (
                <div className="rounded-xl border border-[var(--border)] p-3">
                  {files.map((file) => <p key={`${file.name}-${file.size}`} className="text-xs text-[var(--text-secondary)]">{file.name} • {(file.size / 1024).toFixed(1)} KB</p>)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Metric label="Source" value={preview.source_rows} />
                <Metric label="Insert" value={preview.inserted_rows} tone="text-emerald-300" />
                <Metric label="Update" value={preview.updated_rows} tone="text-amber-200" />
                <Metric label="Unchanged" value={preview.unchanged_rows} />
                <Metric label="Invalid" value={preview.invalid_rows} tone="text-red-300" />
              </div>
              {preview.warnings?.length ? (
                <Alert><AlertTitle>Catatan validasi</AlertTitle><AlertDescription>{preview.warnings.join(' ')}</AlertDescription></Alert>
              ) : null}
              <div className="max-h-72 overflow-auto rounded-xl border border-[var(--border)]">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--bg-surface)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr><th className="px-3 py-2">File</th><th className="px-3 py-2">Row</th><th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">PIC</th><th className="px-3 py-2">Change</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(preview.preview_rows || []).map((row) => (
                      <tr key={`${row.source_file}-${row.source_row}`}>
                        <td className="max-w-44 truncate px-3 py-2" title={row.source_file}>{row.source_file}</td>
                        <td className="px-3 py-2 font-mono">{row.source_row}</td>
                        <td className="px-3 py-2 font-mono">{row.row_key || '-'}</td>
                        <td className="px-3 py-2">{row.ticket_type || '-'}</td>
                        <td className="px-3 py-2">{row.pic || '-'}</td>
                        <td className="px-3 py-2"><StatusPill status={row.change_kind} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.status === 'completed' ? (
                <Alert className="border-emerald-500/25 bg-emerald-500/10">
                  <CheckCircle2 className="size-4" /><AlertTitle>Import selesai</AlertTitle><AlertDescription>Perubahan sudah tersimpan di NeonDB.</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}

          {error && <Alert className="border-red-500/25 bg-red-500/10"><XCircle className="size-4" /><AlertTitle>Import gagal</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            {!preview ? (
              <Button type="button" disabled={!files.length || busy} onClick={handleValidate} className="rounded-xl">
                {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                Validasi dan preview
              </Button>
            ) : preview.status !== 'completed' ? (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)} className="rounded-xl">Ganti file</Button>
                <Button type="button" disabled={busy || preview.invalid_rows > 0} onClick={handleCommit} className="rounded-xl">
                  {busy ? <LoaderCircle className="animate-spin" /> : <DatabaseZap />}
                  Commit ke NeonDB
                </Button>
              </>
            ) : <Button type="button" onClick={() => setDialogOpen(false)} className="rounded-xl">Selesai</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AliasesPanel({ aliases, onRefresh }) {
  const [alias, setAlias] = useState('');
  const [canonicalPic, setCanonicalPic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await savePicAlias({ alias, canonical_pic: canonicalPic });
      setAlias(''); setCanonicalPic(''); await onRefresh();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true); setError('');
    try { await deletePicAlias(id); await onRefresh(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={submit} className="glass-card h-fit space-y-4 p-4">
        <div><h2 className="text-sm font-semibold">Normalisasi nama PIC</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Alias diterapkan pada ranking gabungan tanpa mengubah nilai mentah.</p></div>
        <div><label className="text-xs text-[var(--text-muted)]">Nama pada sumber</label><Input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Contoh: A. Santoso" className="mt-1 rounded-xl" /></div>
        <div><label className="text-xs text-[var(--text-muted)]">Nama canonical</label><Input value={canonicalPic} onChange={(event) => setCanonicalPic(event.target.value)} placeholder="Contoh: Andi Santoso" className="mt-1 rounded-xl" /></div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <Button type="submit" disabled={busy || !alias.trim() || !canonicalPic.trim()} className="w-full rounded-xl">Simpan alias</Button>
      </form>
      <section className="glass-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Daftar alias PIC</h2></div>
        <div className="overflow-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"><tr><th className="px-4 py-2">Alias</th><th className="px-3 py-2">Canonical PIC</th><th className="px-3 py-2">Updated</th><th className="px-4 py-2 text-right">Action</th></tr></thead><tbody className="divide-y divide-[var(--border)]">
          {aliases.map((item) => <tr key={item.id}><td className="px-4 py-2">{item.alias}</td><td className="px-3 py-2 font-semibold">{item.canonical_pic}</td><td className="px-3 py-2 font-mono text-[var(--text-muted)]">{formatTimestamp(item.updated_at)}</td><td className="px-4 py-2 text-right"><Button type="button" variant="ghost" size="icon-sm" aria-label={`Hapus alias ${item.alias}`} onClick={() => remove(item.id)} disabled={busy}><Trash2 /></Button></td></tr>)}
          {!aliases.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--text-muted)]">Belum ada alias PIC.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}

function UsersPanel({ users, onRefresh }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await createDashboardUser(form); setForm({ username: '', password: '', role: 'viewer' }); await onRefresh(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };
  const update = async (id, payload) => {
    setBusy(true); setError('');
    try { await updateDashboardUser(id, payload); await onRefresh(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={submit} className="glass-card h-fit space-y-4 p-4">
        <div><h2 className="text-sm font-semibold">Buat pengguna</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Role diberikan eksplisit dan dapat dicabut oleh sysadmin.</p></div>
        <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Username" className="rounded-xl" />
        <Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password minimal 12 karakter" className="rounded-xl" />
        <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}><SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{['viewer', 'data_admin', 'sysadmin'].map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <Button type="submit" disabled={busy || form.username.length < 3 || form.password.length < 12} className="w-full rounded-xl">Buat pengguna</Button>
      </form>
      <section className="glass-card overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Pengguna database</h2></div><div className="overflow-auto"><table className="w-full min-w-[660px] text-left text-xs"><thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"><tr><th className="px-4 py-2">Username</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-4 py-2 text-right">Session version</th></tr></thead><tbody className="divide-y divide-[var(--border)]">
        {users.map((item) => <tr key={item.id}><td className="px-4 py-2 font-semibold">{item.username}</td><td className="px-3 py-2"><Select value={item.role} onValueChange={(role) => update(item.id, { role })} disabled={busy}><SelectTrigger className="h-8 w-36 rounded-lg"><SelectValue /></SelectTrigger><SelectContent>{['viewer', 'data_admin', 'sysadmin'].map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></td><td className="px-3 py-2"><Button type="button" size="sm" variant={item.is_active ? 'outline' : 'destructive'} disabled={busy} onClick={() => update(item.id, { is_active: !item.is_active })}>{item.is_active ? 'Active' : 'Inactive'}</Button></td><td className="px-4 py-2 text-right font-mono">{item.session_version}</td></tr>)}
        {!users.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--text-muted)]">Belum ada pengguna database. Buat sysadmin pertama melalui CLI bootstrap.</td></tr>}
      </tbody></table></div></section>
    </div>
  );
}

export default function ManagementDataPage() {
  const { user, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('imports');
  const [targets, setTargets] = useState([]);
  const [history, setHistory] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshImports = useCallback(async () => setHistory(await fetchManagementImports()), []);
  const refreshAliases = useCallback(async () => setAliases(await fetchPicAliases()), []);
  const refreshUsers = useCallback(async () => {
    if (hasPermission('users:manage')) setUsers(await fetchDashboardUsers());
  }, [hasPermission]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchManagementTargets(), fetchManagementImports(), fetchPicAliases(),
      hasPermission('users:manage') ? fetchDashboardUsers() : Promise.resolve([]),
    ]).then(([targetRows, importRows, aliasRows, userRows]) => {
      if (!cancelled) { setTargets(targetRows); setHistory(importRows); setAliases(aliasRows); setUsers(userRows); }
    }).catch((requestError) => { if (!cancelled) setError(errorMessage(requestError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasPermission]);

  const visibleTabs = TABS.filter((tab) => !tab.permission || hasPermission(tab.permission));

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--primary-light)]"><DatabaseZap className="size-4" /> Data Operations</div><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Management Data</h1><p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">Validasi, preview, dan commit data terkontrol ke tabel NeonDB yang diizinkan.</p></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/45 px-3 py-2 text-xs"><span className="text-[var(--text-muted)]">Signed in as </span><strong>{user?.username}</strong><span className="ml-2 rounded-full bg-[var(--primary)]/12 px-2 py-0.5 text-[var(--primary-light)]">{user?.role}</span></div>
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-1" aria-label="Management Data sections">
          {visibleTabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${activeTab === tab.key ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]'}`}><Icon className="size-4" />{tab.label}</button>; })}
        </nav>

        {error && <Alert className="border-red-500/25 bg-red-500/10"><AlertTitle>Gagal memuat Management Data</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {loading ? <div className="glass-card flex min-h-56 items-center justify-center text-sm text-[var(--text-muted)]"><LoaderCircle className="mr-2 size-4 animate-spin" /> Memuat data...</div> : null}
        {!loading && activeTab === 'imports' ? <ImportsPanel targets={targets} history={history} onRefresh={refreshImports} /> : null}
        {!loading && activeTab === 'aliases' ? <AliasesPanel aliases={aliases} onRefresh={refreshAliases} /> : null}
        {!loading && activeTab === 'thresholds' ? <ReportingThresholdConfiguration /> : null}
        {!loading && activeTab === 'users' && hasPermission('users:manage') ? <UsersPanel users={users} onRefresh={refreshUsers} /> : null}
      </div>
    </main>
  );
}
