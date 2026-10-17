import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DownloadSimple,
  UploadSimple,
  FileXls,
  FilePdf,
  FileCsv,
  ShieldCheck,
  DeviceMobile,
  Trash,
  Database,
  Sparkle,
  Moon,
  Sun,
  CircleHalf,
} from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Button, Card, Chip, Field, SectionTitle, inputCls } from '../components/ui';
import {
  deleteCustomCardio,
  deleteCustomExercise,
  exportBackup,
  importBackup,
  putSessions,
  putWaterLogs,
  requestPersistentStorage,
  saveMeasurement,
  saveSettings,
  uid,
  wipeAll,
} from '../db/db';
import { choiceDialog, confirmDialog } from '../lib/dialog';
import { csvToSessions, downloadText, sessionsToCsv } from '../lib/csv';
import { addDays, todayKey } from '../lib/date';
import { makeDemoSessions, makeDemoWater } from '../lib/demo';
import { groupName } from '../data/exercises';
import type { BackupFile, ThemePref } from '../types';

export default function SettingsPage() {
  const nav = useNavigate();
  const data = useData();
  const { settings, sessions, customExercises, customCardio } = data;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024).toFixed(0)} KB used`);
    });
  }, [sessions.length]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 6000);
  };

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      flash(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  const exportData = () => ({
    sessions: data.sessions,
    records: data.records,
    measurements: data.measurements,
    goals: data.goals,
    profile: data.profile,
    settings: data.settings,
    water: data.water,
  });

  async function onImportCsv(file: File) {
    const { sessions: list, errors } = csvToSessions(await file.text());
    if (!list.length) return flash(errors[0] ?? 'No workouts found in that file.');
    const existing = new Set(sessions.map((s) => s.id));
    const dupes = list.filter((s) => existing.has(s.id)).length;
    if (
      !(await confirmDialog({
        title: `Import ${list.length} workouts?`,
        message: `${dupes ? `${dupes} already exist and will be updated.` : ''}${errors.length ? `\n\n${errors.length} warning(s):\n${errors.slice(0, 5).join('\n')}` : ''}`.trim() || undefined,
        confirmLabel: 'Import',
      }))
    )
      return;
    await putSessions(list);
    flash(`Imported ${list.length} workouts.`);
  }

  async function onRestore(file: File) {
    try {
      const b = JSON.parse(await file.text()) as BackupFile;
      if (b.app !== 'gym-diary' || !Array.isArray(b.sessions)) return flash('That is not a Gym Diary backup file.');
      const choice = await choiceDialog({
        title: 'Restore backup?',
        message: `Backup from ${new Date(b.exportedAt).toLocaleString()} with ${b.sessions.length} workouts.`,
        actions: [
          { label: 'Merge with my data', value: 'merge', style: 'primary' },
          { label: 'Replace all my data', value: 'replace', style: 'danger' },
          { label: 'Cancel', value: 'cancel', style: 'cancel' },
        ],
      });
      if (!choice) return;
      const replace = choice === 'replace';
      await importBackup(b, replace ? 'replace' : 'merge');
      flash(`Restored ${b.sessions.length} workouts (${replace ? 'replaced' : 'merged'}).`);
    } catch {
      flash('Could not read that backup file.');
    }
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const themes: { id: ThemePref; label: string; icon: React.ReactNode }[] = [
    { id: 'dark', label: 'Dark', icon: <Moon size={16} weight="bold" /> },
    { id: 'light', label: 'Light', icon: <Sun size={16} weight="bold" /> },
    { id: 'system', label: 'System', icon: <CircleHalf size={16} weight="bold" /> },
  ];

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 pt-6">
        <button
          onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/'))}
          className="grid h-11 w-11 place-items-center rounded-btn border border-line bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h1 className="h-title text-[2.375rem]">Settings</h1>
      </div>

      {msg && (
        <div role="status" className="mt-4 rounded-card border border-str/20 bg-str-soft p-3 text-sm text-str">
          {msg}
        </div>
      )}

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => saveSettings({ ...settings, theme: t.id })}
              aria-pressed={settings.theme === t.id}
              className={`flex h-12 items-center justify-center gap-2 rounded-btn border text-sm transition-colors ${
                settings.theme === t.id ? 'border-primary bg-primary font-medium text-primary-ink' : 'border-line bg-bg hover:bg-raised'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle>Units</SectionTitle>
      <Card className="space-y-3">
        <Row label="Weight">
          {(['kg', 'lb'] as const).map((u) => (
            <Chip key={u} active={settings.weightUnit === u} onClick={() => saveSettings({ ...settings, weightUnit: u })}>
              {u}
            </Chip>
          ))}
        </Row>
        <Row label="Distance">
          {(['km', 'mi'] as const).map((u) => (
            <Chip key={u} active={settings.distanceUnit === u} onClick={() => saveSettings({ ...settings, distanceUnit: u })}>
              {u}
            </Chip>
          ))}
        </Row>
        <Row label="Water">
          <Chip active={settings.volumeUnit === 'ml'} onClick={() => saveSettings({ ...settings, volumeUnit: 'ml' })}>
            ml / L
          </Chip>
          <Chip active={settings.volumeUnit === 'oz'} onClick={() => saveSettings({ ...settings, volumeUnit: 'oz' })}>
            fl oz
          </Chip>
        </Row>
        <Row label="Week starts">
          <Chip active={settings.weekStartsOn === 1} onClick={() => saveSettings({ ...settings, weekStartsOn: 1 })}>
            Mon
          </Chip>
          <Chip active={settings.weekStartsOn === 0} onClick={() => saveSettings({ ...settings, weekStartsOn: 0 })}>
            Sun
          </Chip>
        </Row>
        <p className="text-xs text-muted">
          Weight and distance units are labels only: numbers are stored exactly as you type them. Water is stored in ml and converted for display, so
          switching ml / fl oz is safe at any time.
        </p>
      </Card>

      <SectionTitle>Export</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="From (optional)">
            <input type="date" value={from} max={to || todayKey()} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To (optional)">
            <input type="date" value={to} min={from} max={todayKey()} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={!from && !to} onClick={() => (setFrom(''), setTo(''))}>
            All time
          </Chip>
          <Chip active={from === addDays(todayKey(), -29) && !to} onClick={() => (setFrom(addDays(todayKey(), -29)), setTo(''))}>
            30 days
          </Chip>
          <Chip active={from === `${todayKey().slice(0, 4)}-01-01` && !to} onClick={() => (setFrom(`${todayKey().slice(0, 4)}-01-01`), setTo(''))}>
            This year
          </Chip>
        </div>
        <Button className="w-full justify-start" disabled={!!busy} onClick={() => run('xlsx', async () => {
          const { exportExcel } = await import('../lib/export');
          await exportExcel(exportData(), from || undefined, to || undefined);
        })}>
          <FileXls size={20} weight="bold" className="text-str" /> {busy === 'xlsx' ? 'Preparing Excel…' : 'Export to Excel (.xlsx)'}
        </Button>
        <Button className="w-full justify-start" disabled={!!busy} onClick={() => run('pdf', async () => {
          const { exportPdf } = await import('../lib/export');
          await exportPdf(exportData(), from || undefined, to || undefined);
        })}>
          <FilePdf size={20} weight="bold" className="text-danger" /> {busy === 'pdf' ? 'Preparing PDF…' : 'Export PDF report'}
        </Button>
        <Button
          className="w-full justify-start"
          onClick={() =>
            downloadText(
              `gym-diary-${todayKey()}.csv`,
              sessionsToCsv(sessions.filter((s) => (!from || s.date >= from) && (!to || s.date <= to))),
              'text/csv;charset=utf-8',
            )
          }
        >
          <FileCsv size={20} weight="bold" className="text-muted" /> Export CSV (re-importable)
        </Button>
      </Card>

      <SectionTitle>Backup & restore</SectionTitle>
      <div className="space-y-2">
        <Button
          className="w-full justify-start"
          onClick={async () => downloadText(`gym-diary-backup-${todayKey()}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')}
        >
          <DownloadSimple size={20} weight="bold" className="text-car" /> Full backup (JSON)
        </Button>
        <Button className="w-full justify-start" onClick={() => jsonRef.current?.click()}>
          <Database size={20} weight="bold" className="text-car" /> Restore from backup
        </Button>
        <Button className="w-full justify-start" onClick={() => csvRef.current?.click()}>
          <UploadSimple size={20} weight="bold" className="text-muted" /> Import workouts from CSV
        </Button>
        <p className="px-1 text-xs text-muted">Save a backup to Google Drive or iCloud every few weeks. Your data lives only on this device.</p>
      </div>
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportCsv(f);
          e.target.value = '';
        }}
      />
      <input
        ref={jsonRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onRestore(f);
          e.target.value = '';
        }}
      />

      <SectionTitle>Storage</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} weight="bold" className={persisted ? 'text-str' : 'text-muted'} />
          <span className="flex-1">{persisted ? 'Protected storage is on' : 'The browser may clear storage if space runs low'}</span>
        </div>
        {!persisted && (
          <Button size="sm" onClick={async () => setPersisted(await requestPersistentStorage())}>
            Request protected storage
          </Button>
        )}
        <div className="num text-muted">
          {sessions.length} workouts · {usage}
        </div>
      </Card>

      <SectionTitle>Install as an app</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <DeviceMobile size={18} weight="bold" /> {standalone ? 'Installed' : 'Add to your home screen'}
        </div>
        {isIOS ? (
          <p className="text-muted">
            In Safari tap <b>Share</b>, then <b>Add to Home Screen</b>.
          </p>
        ) : (
          <p className="text-muted">
            In Chrome open the menu, then <b>Install app</b> (or <b>Add to Home screen</b>).
          </p>
        )}
        <p className="text-muted">Once installed it opens full-screen and works with no internet.</p>
      </Card>

      {(customExercises.length > 0 || customCardio.length > 0) && (
        <>
          <SectionTitle>Custom exercises</SectionTitle>
          <Card className="divide-y divide-line p-0">
            {customExercises.map((e) => (
              <div key={e.id} className="flex items-center px-4 py-2">
                <span className="flex-1">
                  {e.name} <span className="text-xs text-muted">· {groupName(e.muscleGroup)}</span>
                </span>
                <button className="hit-44 grid h-10 w-10 place-items-center text-muted" onClick={() => deleteCustomExercise(e.id)} aria-label={`Delete ${e.name}`}>
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            ))}
            {customCardio.map((c) => (
              <div key={c.id} className="flex items-center px-4 py-2">
                <span className="flex-1">
                  {c.name} <span className="text-xs text-muted">· {c.category ?? 'Cardio'}</span>
                </span>
                <button className="hit-44 grid h-10 w-10 place-items-center text-muted" onClick={() => deleteCustomCardio(c.id)} aria-label={`Delete ${c.name}`}>
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            ))}
          </Card>
          <p className="mt-1 px-1 text-xs text-muted">Removing a custom exercise keeps it in past workouts.</p>
        </>
      )}

      <SectionTitle>Data</SectionTitle>
      <div className="space-y-2">
        {sessions.length === 0 && (
          <Button
            className="w-full justify-start"
            onClick={async () => {
              await putSessions(makeDemoSessions());
              await putWaterLogs(makeDemoWater());
              const start = 82;
              for (let i = 10; i >= 0; i--)
                await saveMeasurement({ id: uid(), date: addDays(todayKey(), -i * 7), weight: Math.round((start - (10 - i) * 0.35) * 10) / 10, createdAt: Date.now() + i });
              flash('Sample data loaded. Explore the dashboard, then erase it when you are ready.');
            }}
          >
            <Sparkle size={20} weight="bold" className="text-gold" /> Load sample data (to try the app)
          </Button>
        )}
        <Button
          variant="danger"
          className="w-full justify-start"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Erase all data?',
              message: 'Every workout, water log, weigh-in, goal, template and setting on this phone will be deleted. This can’t be undone, so make a backup first if you are unsure.',
              confirmLabel: 'Erase everything',
              danger: true,
            });
            if (!ok) return;
            await wipeAll();
            flash('All data erased.');
          }}
        >
          <Trash size={20} weight="bold" /> Erase all data
        </Button>
      </div>
      <p className="mt-10 text-center font-mono text-[0.6875rem] text-muted">Gym Diary v2.0 · no account, no cloud, no tracking</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}
