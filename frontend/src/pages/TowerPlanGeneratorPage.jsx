import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  Bot,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  FileJson,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RadioTower,
  RotateCcw,
  Sparkles,
  TowerControl,
  Undo2,
  Upload,
  WandSparkles,
} from 'lucide-react';

import Breadcrumb from '../components/Breadcrumb';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  fetchTowerPlanAiCapabilities,
  fetchTowerPlanConfiguration,
  generateTowerPlanAiVisualization,
} from '../services/api';
import TowerPlanAntennaEditor from '../features/tower-plan/TowerPlanAntennaEditor';
import TowerPlanAutofillDialog from '../features/tower-plan/TowerPlanAutofillDialog';
import TowerPlanPreview from '../features/tower-plan/TowerPlanPreview';
import TowerPlanSitePicker from '../features/tower-plan/TowerPlanSitePicker';
import {
  MAX_ANTENNAS,
  TOWER_TYPES,
  TOWER_TYPE_CONFIG,
  addAntenna,
  applyAutofillDraft,
  buildAiPayload,
  buildAutofillDraft,
  buildEngineeringPrompt,
  changeTowerType,
  createBlankTowerPlan,
  duplicateAntenna,
  migrateTowerPlan,
  removeAntenna,
  sortAntennas,
  updateAntenna,
  validateAutofillDraft,
  validateTowerPlan,
} from '../features/tower-plan/towerPlanState';
import { renderTowerPlanSvg } from '../features/tower-plan/towerPlanSvg';
import {
  loadTowerPlanAsset,
  loadTowerPlanDraft,
  saveTowerPlanAsset,
  saveTowerPlanDraft,
} from '../features/tower-plan/towerPlanStorage';

const MAX_ASSET_SIZE = 10 * 1024 * 1024;
const VISUAL_STYLES = [
  'Technical Blueprint',
  'Clean Engineering Infographic',
  'Semi-Realistic 3D Tower',
  'Minimal Schematic',
  'Custom Style',
];

const PSN003_PRESET = {
  schemaVersion: 6,
  planTitle: 'PLAN ADD MULTI SECTOR PSN003_BROMO',
  siteName: 'PSN003_BROMO',
  towerType: 'Four-leg lattice tower',
  towerHeight: 50,
  legABearingDeg: 45,
  visualStyle: 'Clean Engineering Infographic',
  customStyle: '',
  source: { provider: 'preset', siteId: 'PSN003_BROMO' },
  antennas: [
    { id: 'psn-1', name: 'ASI Existing Sec 3', operator: 'ASI', status: 'Existing', sector: '3', height: 43, azimuth: 255, cid: '32 & 92', color: '#334155', leg: 'D', note: '' },
    { id: 'psn-2', name: 'ASI Existing Sec 2', operator: 'ASI', status: 'Existing', sector: '2', height: 43, azimuth: 125, cid: '22 & 82', color: '#334155', leg: 'A', note: '' },
    { id: 'psn-3', name: 'ASI Existing Sec 1', operator: 'ASI', status: 'Existing', sector: '1', height: 43, azimuth: 60, cid: '12 & 42', color: '#334155', leg: 'B', note: '' },
    { id: 'psn-4', name: 'AMB New Sec 2', operator: 'AMB', status: 'New', sector: '2', height: 39, azimuth: 150, cid: '', color: '#1769e0', leg: 'B', note: '' },
    { id: 'psn-5', name: 'AMB New Sec 1', operator: 'AMB', status: 'New', sector: '1', height: 39, azimuth: 220, cid: '', color: '#1769e0', leg: 'C', note: '' },
    { id: 'psn-6', name: 'AMB Existing Sec 1', operator: 'AMB', status: 'Existing', sector: '1', height: 33, azimuth: 65, cid: '', color: '#334155', leg: 'A', note: '' },
  ],
};

function safeFilename(plan) {
  return (plan.siteName || plan.planTitle || 'tower-plan')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tower-plan';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function svgToPng(svg) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('SVG tidak dapat dirender menjadi PNG.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1536;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export PNG gagal.'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SectionTitle({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export default function TowerPlanGeneratorPage() {
  const [plan, setPlan] = useState(createBlankTowerPlan);
  const [hydrated, setHydrated] = useState(false);
  const [autofillDraft, setAutofillDraft] = useState(null);
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [notice, setNotice] = useState(null);
  const [promptOutput, setPromptOutput] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [aiMode, setAiMode] = useState('draft');
  const [aiCapabilities, setAiCapabilities] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiImageUrl, setAiImageUrl] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const jsonInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const configRequestRef = useRef(null);
  const validationErrors = useMemo(() => validateTowerPlan(plan), [plan]);
  const towerTypeConfig = TOWER_TYPE_CONFIG[plan.towerType];

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      loadTowerPlanDraft(),
      loadTowerPlanAsset('latest-ai'),
      loadTowerPlanAsset('manual-reference'),
      fetchTowerPlanAiCapabilities(controller.signal).catch(() => null),
    ]).then(([storedPlan, aiAsset, manualAsset, capabilities]) => {
      if (!active) return;
      if (storedPlan) setPlan(storedPlan);
      if (aiAsset?.blob) setAiImageUrl(URL.createObjectURL(aiAsset.blob));
      if (manualAsset?.blob) setManualImageUrl(URL.createObjectURL(manualAsset.blob));
      setAiCapabilities(capabilities);
      setHydrated(true);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const timer = setTimeout(() => saveTowerPlanDraft(plan), 250);
    return () => clearTimeout(timer);
  }, [hydrated, plan]);

  useEffect(
    () => () => aiImageUrl && URL.revokeObjectURL(aiImageUrl),
    [aiImageUrl],
  );

  useEffect(
    () => () => manualImageUrl && URL.revokeObjectURL(manualImageUrl),
    [manualImageUrl],
  );

  const notify = (type, message) => setNotice({ type, message });

  const editPlan = (updater) => {
    setUndoSnapshot(null);
    setPromptOutput('');
    setPlan((current) => (
      typeof updater === 'function' ? updater(current) : { ...current, ...updater }
    ));
  };

  const handleSiteSelection = async (siteId) => {
    configRequestRef.current?.abort();
    const controller = new AbortController();
    configRequestRef.current = controller;
    setAutofillLoading(true);
    try {
      const configuration = await fetchTowerPlanConfiguration(siteId, controller.signal);
      const draft = buildAutofillDraft(configuration, plan.towerType);
      setAutofillDraft(draft);
      setAutofillOpen(true);
    } catch (error) {
      if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
        notify('error', error.response?.data?.detail || 'Konfigurasi Site ID gagal dimuat.');
      }
    } finally {
      if (!controller.signal.aborted) setAutofillLoading(false);
    }
  };

  const applyAutofill = () => {
    const errors = validateAutofillDraft(autofillDraft);
    if (errors.length) return;
    const snapshot = structuredClone(plan);
    const next = applyAutofillDraft(plan, autofillDraft);
    setPromptOutput('');
    setPlan(next);
    setUndoSnapshot(snapshot);
    setAutofillOpen(false);
    setNotice({
      type: 'success',
      message: `${next.antennas.length} antena fisik dimuat dari ${next.siteName}.`,
    });
  };

  const undoAutofill = () => {
    if (!undoSnapshot) return;
    setPromptOutput('');
    setPlan(undoSnapshot);
    setUndoSnapshot(null);
    notify('success', 'Konfigurasi sebelum auto-fill telah dipulihkan.');
  };

  const requireValidPlan = () => {
    if (!validationErrors.length) return true;
    notify('error', `Perbaiki ${validationErrors.length} issue sebelum melanjutkan.`);
    return false;
  };

  const exportSvg = () => {
    if (!requireValidPlan()) return;
    downloadBlob(
      new Blob([renderTowerPlanSvg(plan)], { type: 'image/svg+xml;charset=utf-8' }),
      `${safeFilename(plan)}-tower-plan.svg`,
    );
  };

  const exportPng = async () => {
    if (!requireValidPlan()) return;
    try {
      const png = await svgToPng(renderTowerPlanSvg(plan));
      downloadBlob(png, `${safeFilename(plan)}-tower-plan.png`);
    } catch (error) {
      notify('error', error.message);
    }
  };

  const exportJson = () => {
    downloadBlob(
      new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }),
      `${safeFilename(plan)}-tower-plan.json`,
    );
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const imported = migrateTowerPlan(JSON.parse(await file.text()));
      setUndoSnapshot(structuredClone(plan));
      setPromptOutput('');
      setPlan(imported);
      notify('success', `Konfigurasi ${file.name} berhasil diimpor.`);
    } catch {
      notify('error', 'File JSON tidak valid atau tidak kompatibel.');
    }
  };

  const createPrompt = () => {
    if (!requireValidPlan()) return;
    setPromptOutput(buildEngineeringPrompt(plan, revisionInstruction));
  };

  const uploadReference = async (file) => {
    if (!file) return;
    if (!['image/png', 'image/webp'].includes(file.type) || file.size > MAX_ASSET_SIZE) {
      notify('error', 'Gunakan PNG/WebP maksimal 10 MB.');
      return;
    }
    await saveTowerPlanAsset('manual-reference', file, file.name);
    if (manualImageUrl) URL.revokeObjectURL(manualImageUrl);
    setManualImageUrl(URL.createObjectURL(file));
    notify('success', 'Referensi visual tersimpan di browser.');
  };

  const generateAi = async () => {
    if (!requireValidPlan()) return;
    if (!aiCapabilities?.enabled) {
      notify('error', 'Visualisasi AI belum diaktifkan pada server.');
      return;
    }
    if (!window.confirm(`Generate visualisasi AI mode ${aiMode}? Request ini dapat menggunakan kuota berbayar.`)) {
      return;
    }
    const controller = new AbortController();
    setAiLoading(true);
    try {
      const blob = await generateTowerPlanAiVisualization(
        buildAiPayload(plan, aiMode, revisionInstruction),
        controller.signal,
      );
      await saveTowerPlanAsset('latest-ai', blob, `${safeFilename(plan)}-ai.png`);
      if (aiImageUrl) URL.revokeObjectURL(aiImageUrl);
      setAiImageUrl(URL.createObjectURL(blob));
      notify('success', 'Visualisasi AI terbaru berhasil dibuat.');
    } catch (error) {
      notify('error', error.response?.data?.detail || 'Visualisasi AI gagal dibuat.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Breadcrumb />

      <header className="border-b border-border bg-[var(--bg-header)] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <TowerControl className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold">Tower Plan Generator</h1>
                <Badge variant="outline">Tools</Badge>
                {plan.source?.provider === 'ransys_gabungan' && (
                  <Badge variant="secondary"><Database className="size-3" /> Auto-filled</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Multi-type engineering plan · RF grouping · Deterministic export
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => editPlan(migrateTowerPlan(PSN003_PRESET))}>
              <RadioTower /> Preset PSN003
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm('Reset seluruh konfigurasi ke template kosong?')) {
                  editPlan(createBlankTowerPlan());
                  setPromptOutput('');
                }
              }}
            >
              <RotateCcw /> Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-5">
        {notice && (
          <div
            className={[
              'mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
              notice.type === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
            ].join(' ')}
            role="status"
          >
            <span className="flex items-center gap-2">
              {notice.type === 'error' ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
              {notice.message}
            </span>
            <div className="flex items-center gap-2">
              {undoSnapshot && (
                <Button size="sm" variant="outline" onClick={undoAutofill}>
                  <Undo2 /> Urungkan
                </Button>
              )}
              <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>Tutup</button>
            </div>
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(420px,2fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle
                  icon={Database}
                  title="Auto-fill Site ID"
                  description="Cari Site ID seperti RF Tilt Analysis, lalu review grouping antena sebelum diterapkan."
                  action={autofillLoading ? <LoaderCircle className="size-4 animate-spin text-primary" /> : null}
                />
              </CardHeader>
              <CardContent>
                <TowerPlanSitePicker disabled={autofillLoading} onSelect={handleSiteSelection} />
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Posisi instalasi dihitung otomatis dari azimuth sesuai tipe tower aktif.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle
                  icon={TowerControl}
                  title="Data proyek"
                  description="Parameter utama tower dan orientasi helicopter view."
                />
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="tower-plan-title">Plan title</Label>
                  <Input id="tower-plan-title" value={plan.planTitle} onChange={(event) => editPlan({ ...plan, planTitle: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-site-name">Site ID</Label>
                  <Input id="tower-site-name" value={plan.siteName} onChange={(event) => editPlan({ ...plan, siteName: event.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-type">Tower type</Label>
                  <select
                    id="tower-type"
                    className="dashboard-control h-9 w-full rounded-full px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                    value={plan.towerType}
                    onChange={(event) => editPlan((current) => (
                      changeTowerType(current, event.target.value)
                    ))}
                  >
                    {TOWER_TYPES.map((towerType) => (
                      <option key={towerType} value={towerType}>{towerType}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-height">Tower height (m)</Label>
                  <Input id="tower-height" min="1" step="0.1" type="number" value={plan.towerHeight} onChange={(event) => editPlan({ ...plan, towerHeight: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-bearing">
                    {towerTypeConfig.label} A bearing from North
                  </Label>
                  <Input id="tower-bearing" min="0" max="359.9" step="0.1" type="number" value={plan.legABearingDeg} onChange={(event) => editPlan({ ...plan, legABearingDeg: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-style">Visual style</Label>
                  <select
                    id="tower-style"
                    className="dashboard-control h-9 w-full rounded-full px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                    value={plan.visualStyle}
                    onChange={(event) => editPlan({ ...plan, visualStyle: event.target.value })}
                  >
                    {VISUAL_STYLES.map((style) => <option key={style}>{style}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tower-custom-style">Custom style</Label>
                  <Input id="tower-custom-style" disabled={plan.visualStyle !== 'Custom Style'} placeholder="Contoh: neutral steel technical render" value={plan.customStyle} onChange={(event) => editPlan({ ...plan, customStyle: event.target.value })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle
                  icon={RadioTower}
                  title={`Antennas · ${plan.antennas.length}/${MAX_ANTENNAS}`}
                  description="Satu baris mewakili satu antena fisik pada tower."
                  action={(
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => editPlan(sortAntennas(plan))}>
                        <ArrowDownUp /> Sort
                      </Button>
                      <Button disabled={plan.antennas.length >= MAX_ANTENNAS} size="sm" onClick={() => editPlan(addAntenna(plan))}>
                        <Plus /> Add antenna
                      </Button>
                    </div>
                  )}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.antennas.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
                    <RadioTower className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Belum ada antena</p>
                    <p className="mt-1 text-xs text-muted-foreground">Gunakan auto-fill Site ID atau tambahkan antena manual.</p>
                  </div>
                ) : plan.antennas.map((antenna, index) => (
                  <TowerPlanAntennaEditor
                    key={antenna.id}
                    antenna={antenna}
                    index={index}
                    towerType={plan.towerType}
                    onChange={(changes) => editPlan(updateAntenna(plan, antenna.id, changes))}
                    onDuplicate={() => editPlan(duplicateAntenna(plan, antenna.id))}
                    onRemove={() => editPlan(removeAntenna(plan, antenna.id))}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle
                  icon={WandSparkles}
                  title="Prompt & visualisasi"
                  description="Prompt lokal dapat memuat data proyek; request AI selalu disanitasi otomatis."
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tower-revision">Revision instruction</Label>
                  <Input
                    id="tower-revision"
                    placeholder="Contoh: gunakan warna steel sedikit lebih gelap"
                    value={revisionInstruction}
                    onChange={(event) => {
                      setRevisionInstruction(event.target.value);
                      setPromptOutput('');
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={createPrompt}><Sparkles /> Create Prompt</Button>
                  <Button disabled={!promptOutput} variant="outline" onClick={() => navigator.clipboard?.writeText(promptOutput)}>
                    <Clipboard /> Copy
                  </Button>
                </div>
                <Textarea className="min-h-52 font-mono text-xs" placeholder="Prompt engineering akan tampil di sini." readOnly value={promptOutput} />

                <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="size-4" /> Referensi visual</h3>
                      <Badge variant="outline">PNG/WebP · 10 MB</Badge>
                    </div>
                    <input ref={imageInputRef} accept="image/png,image/webp" className="hidden" type="file" onChange={(event) => uploadReference(event.target.files?.[0])} />
                    <Button variant="outline" onClick={() => imageInputRef.current?.click()}><Upload /> Upload image</Button>
                    {manualImageUrl && <img alt="Manual tower visual reference" className="aspect-[2/3] max-h-72 w-full rounded-lg border border-border bg-white object-contain" src={manualImageUrl} />}
                  </div>

                  <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><Bot className="size-4" /> Visualisasi AI</h3>
                      <Badge variant={aiCapabilities?.enabled ? 'secondary' : 'outline'}>
                        {aiCapabilities?.enabled ? aiCapabilities.model : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <select
                        aria-label="AI quality mode"
                        className="dashboard-control h-9 min-w-28 rounded-full px-3 text-sm outline-none"
                        value={aiMode}
                        onChange={(event) => setAiMode(event.target.value)}
                      >
                        <option value="draft">Draft · low</option>
                        <option value="final">Final · medium</option>
                      </select>
                      <Button disabled={aiLoading || !aiCapabilities?.enabled} onClick={generateAi}>
                        {aiLoading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                        Generate
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Output AI adalah referensi visual terpisah; SVG deterministik tetap sumber engineering.
                    </p>
                    {aiImageUrl && <img alt="Latest AI tower visualization" className="aspect-[2/3] max-h-72 w-full rounded-lg border border-border bg-white object-contain" src={aiImageUrl} />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <TowerPlanPreview plan={plan} validationErrors={validationErrors} />

            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle icon={Download} title="Export & konfigurasi" description="Engineering output dan backup konfigurasi." />
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button onClick={exportPng}><Download /> Export PNG</Button>
                <Button variant="outline" onClick={exportSvg}><Download /> Export SVG</Button>
                <Button variant="outline" onClick={exportJson}><FileJson /> Export JSON</Button>
                <Button variant="outline" onClick={() => jsonInputRef.current?.click()}><Upload /> Import JSON</Button>
                <input ref={jsonInputRef} accept="application/json,.json" className="hidden" type="file" onChange={(event) => importJson(event.target.files?.[0])} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border">
                <SectionTitle icon={AlertCircle} title="Validation" description="Kontrol kualitas sebelum export." />
              </CardHeader>
              <CardContent>
                {validationErrors.length === 0 ? (
                  <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 className="size-4" /> Konfigurasi valid.
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs text-destructive">
                    {validationErrors.map((error) => <li key={error}>• {error}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      <TowerPlanAutofillDialog
        draft={autofillDraft}
        open={autofillOpen}
        onApply={applyAutofill}
        onDraftChange={setAutofillDraft}
        onOpenChange={setAutofillOpen}
      />
    </div>
  );
}
