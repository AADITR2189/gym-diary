import type { BodyMeasurement, FitnessGoal, PersonalRecord, Profile, Session, Settings, WaterLog } from '../types';
import { baseTargetMl, fmtVolume, targetForDate, totalsByDate } from './water';
import { ACTIVITY_LEVELS } from '../types';
import { groupName } from '../data/exercises';
import { formatLong, todayKey } from './date';
import { e1rm, fmtBest, fmtMinutes, fmtNum, fmtSet, sessionDuration, sessionVolume, SET_TYPES, setVolume, streaks, summarize, volumeByMuscle, workSets } from './stats';
import { goalProgress } from './goals';
import { currentWeight } from './body';

export interface ExportData {
  sessions: Session[];
  records: PersonalRecord[];
  measurements: BodyMeasurement[];
  goals: FitnessGoal[];
  profile: Profile | null;
  settings: Settings;
  water: WaterLog[];
}

const byDateAsc = (a: Session, b: Session) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);

/** Real .xlsx workbook with one sheet per table. The library is loaded only when exporting. */
export async function exportExcel(d: ExportData, from?: string, to?: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const wu = d.settings.weightUnit;
  const du = d.settings.distanceUnit;
  const list = d.sessions.filter((s) => (!from || s.date >= from) && (!to || s.date <= to)).sort(byDateAsc);
  const H = (v: string) => ({ value: v, fontWeight: 'bold' as const });
  const dt = (k: string) => ({ value: new Date(`${k}T00:00:00`), type: Date, format: 'yyyy-mm-dd' });

  const sessionsSheet = [
    ['Date', 'Type', 'Name', 'Exercises / activities', 'Sets', `Volume (${wu})`, 'Cardio min', `Distance (${du})`, 'Calories', 'Duration min', 'Notes'].map(H),
    ...list.map((s) => [
      dt(s.date),
      s.kind,
      s.name ?? '',
      s.kind === 'cardio' ? s.cardio.map((c) => c.activity).join(', ') : s.strength.map((e) => e.exercise).join(', '),
      s.strength.reduce((a, e) => a + workSets(e.sets).length, 0),
      Math.round(sessionVolume(s)),
      s.cardio.reduce((a, c) => a + (c.durationMin || 0), 0),
      s.cardio.reduce((a, c) => a + (c.distance || 0), 0) || null,
      s.cardio.reduce((a, c) => a + (c.calories || 0), 0) || null,
      sessionDuration(s) ?? null,
      s.notes ?? '',
    ]),
  ];

  const setsSheet = [
    ['Date', 'Session', 'Exercise', 'Muscle group', 'Set', 'Set type', 'Reps', 'Time (s)', `Weight (${wu})`, `Body weight counted (${wu})`, `Volume (${wu})`, 'Est. 1RM', 'Notes'].map(H),
    ...list.flatMap((s) =>
      s.strength.flatMap((e) =>
        e.sets.map((set, i) => [
          dt(s.date),
          s.name ?? '',
          e.exercise,
          groupName(e.muscleGroup),
          i + 1,
          SET_TYPES.find((t) => t.id === set.type)?.label ?? 'Normal set',
          e.timed ? null : set.reps,
          set.sec ?? null,
          set.weight,
          e.bw ?? null,
          setVolume(set, e.bw),
          set.type === 'warmup' || e.timed ? null : Math.round(e1rm(set) * 10) / 10,
          i === 0 ? e.notes ?? '' : '',
        ]),
      ),
    ),
  ];

  const cardioSheet = [
    ['Date', 'Activity', 'Type', 'Duration min', `Distance (${du})`, 'Calories', 'Avg heart rate', 'Notes'].map(H),
    ...list.flatMap((s) =>
      s.cardio.map((c) => [dt(s.date), c.activity, c.category ?? '', c.durationMin, c.distance ?? null, c.calories ?? null, c.avgHeartRate ?? null, c.notes ?? '']),
    ),
  ];

  const prSheet = [
    ['Exercise', 'Muscle group', `Heaviest (${wu})`, 'Reps', 'Date', 'Est. 1RM', 'Date', `Best set volume`, `Best session volume`, 'Longest hold (s)'].map(H),
    ...[...d.records]
      .sort((a, b) => b.best1rm - a.best1rm)
      .map((p) => [
        p.exercise,
        groupName(p.muscleGroup),
        p.maxWeight,
        p.maxWeightReps,
        dt(p.maxWeightDate),
        Math.round(p.best1rm * 10) / 10,
        dt(p.best1rmDate),
        p.bestSetVolume,
        p.bestSessionVolume,
        p.bestTimeSec ?? null,
      ]),
  ];

  const bodySheet = [
    ['Date', `Weight (${wu})`, 'Body fat %', 'Waist cm', 'Notes'].map(H),
    ...d.measurements.map((m) => [dt(m.date), m.weight, m.bodyFatPct ?? null, m.waistCm ?? null, m.notes ?? '']),
  ];

  const goalSheet = [
    ['Goal', 'Target', 'Current', 'Completion %', 'Deadline', 'Status'].map(H),
    ...d.goals.map((g) => {
      const p = goalProgress(g, d.sessions, d.measurements, d.profile, d.settings, d.water);
      return [g.title, g.target, Math.round(p.current * 10) / 10, p.pct, g.deadline ? dt(g.deadline) : '', g.archived ? 'Archived' : p.done ? 'Achieved' : 'Active'];
    }),
  ];

  const base = baseTargetMl(d.profile, d.measurements, d.settings);
  const waterDays = [...totalsByDate(d.water.filter((x) => (!from || x.date >= from) && (!to || x.date <= to))).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const waterSheet = [
    ['Date', 'Total (ml)', 'Target (ml)', 'Target met', 'Entries'].map(H),
    ...waterDays.map(([date, ml]) => {
      const target = targetForDate(date, base, d.sessions, d.profile);
      return [dt(date), ml, target, ml >= target ? 'Yes' : 'No', d.water.filter((x) => x.date === date).length];
    }),
  ];

  const w = (...n: number[]) => n.map((width) => ({ width }));
  await writeXlsxFile([
    { sheet: 'Sessions', data: sessionsSheet, columns: w(12, 10, 16, 40, 6, 12, 10, 12, 10, 12, 30), stickyRowsCount: 1 },
    { sheet: 'Strength sets', data: setsSheet, columns: w(12, 16, 26, 14, 5, 6, 12, 12, 10, 30), stickyRowsCount: 1 },
    { sheet: 'Cardio', data: cardioSheet, columns: w(12, 22, 14, 12, 12, 10, 14, 30), stickyRowsCount: 1 },
    { sheet: 'Personal records', data: prSheet, columns: w(26, 14, 12, 6, 12, 10, 12, 16, 18), stickyRowsCount: 1 },
    { sheet: 'Body weight', data: bodySheet, columns: w(12, 12, 10, 10, 30), stickyRowsCount: 1 },
    { sheet: 'Goals', data: goalSheet, columns: w(36, 10, 10, 14, 12, 10), stickyRowsCount: 1 },
    { sheet: 'Water', data: waterSheet, columns: w(12, 12, 12, 11, 9), stickyRowsCount: 1 },
  ] as never).toFile(`gym-diary-${todayKey()}.xlsx`);
}

/** Printable PDF report: profile, summary, PRs, goals, body weight and the workout log. */
export async function exportPdf(d: ExportData, from?: string, to?: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const wu = d.settings.weightUnit;
  const du = d.settings.distanceUnit;
  const list = d.sessions.filter((s) => (!from || s.date >= from) && (!to || s.date <= to)).sort(byDateAsc);
  const sum = summarize(list);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  const ink: [number, number, number] = [47, 52, 55];
  const muted: [number, number, number] = [120, 119, 116];
  const line: [number, number, number] = [234, 234, 234];
  let y = M;

  const h1 = (t: string) => {
    doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(...ink).text(t, M, y);
    y += 12;
  };
  const h2 = (t: string) => {
    if (y > 720) {
      doc.addPage();
      y = M;
    }
    y += 22;
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted).text(t.toUpperCase(), M, y, { charSpace: 0.8 });
    y += 8;
  };
  const table = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, textColor: ink, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, lineColor: line, lineWidth: { bottom: 0.5 } },
      headStyles: { fontStyle: 'bold', textColor: muted, fontSize: 7.5 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  h1('GYM DIARY REPORT');
  y += 10;
  doc
    .setFont('helvetica', 'normal')
    .setFontSize(10)
    .setTextColor(...muted)
    .text(
      `${d.profile?.name ? d.profile.name + '  ·  ' : ''}${from || to ? `${from ? formatLong(from) : 'Start'} – ${to ? formatLong(to) : 'Today'}` : 'All time'}  ·  Generated ${formatLong(todayKey())}`,
      M,
      y,
    );
  y += 6;
  doc.setDrawColor(...line).line(M, y + 6, W - M, y + 6);
  y += 6;

  if (d.profile) {
    const p = d.profile;
    const cw = currentWeight(d.measurements, p);
    h2('Profile');
    table(
      ['Height', 'Weight', 'Age', 'Gender', 'Goal', 'Activity level'],
      [
        [
          p.heightCm ? `${p.heightCm} cm` : '—',
          cw ? `${fmtNum(cw, 1)} ${wu}` : '—',
          p.age ?? '—',
          p.gender ?? '—',
          p.goal ?? '—',
          ACTIVITY_LEVELS.find((a) => a.id === p.activityLevel)?.label ?? '—',
        ],
      ],
    );
  }

  h2('Summary');
  const st = streaks(d.sessions);
  table(
    ['Workouts', 'Strength', 'Cardio', 'Active days', `Volume (${wu})`, 'Cardio time', `Distance (${du})`, 'Avg duration', 'Longest streak'],
    [
      [
        sum.sessions,
        sum.strength,
        sum.cardio,
        sum.days,
        fmtNum(sum.volume),
        fmtMinutes(sum.cardioMin),
        fmtNum(sum.distance, 1),
        sum.avgDuration ? fmtMinutes(sum.avgDuration) : '—',
        `${st.longest} days`,
      ],
    ],
  );

  const muscles = volumeByMuscle(list);
  if (muscles.length) {
    h2('Volume by muscle group');
    table(['Muscle group', 'Sessions', 'Sets', `Volume (${wu})`], muscles.map((m) => [groupName(m.group), m.sessions, m.sets, fmtNum(m.volume)]));
  }

  if (d.records.length) {
    h2('Personal records');
    table(
      ['Exercise', 'Heaviest set', 'Date', 'Est. 1RM'],
      [...d.records].sort((a, b) => b.best1rm - a.best1rm).map((p) => [p.exercise, fmtBest(p, wu), p.maxWeightDate || p.bestTimeDate || '', p.best1rm ? fmtNum(p.best1rm, 1) : '—']),
    );
  }

  const active = d.goals.filter((g) => !g.archived);
  if (active.length) {
    h2('Goals');
    table(
      ['Goal', 'Progress', 'Completion'],
      active.map((g) => {
        const p = goalProgress(g, d.sessions, d.measurements, d.profile, d.settings, d.water);
        return [g.title, p.label, `${p.pct}%`];
      }),
    );
  }

  const wd = [...totalsByDate(d.water.filter((x) => (!from || x.date >= from) && (!to || x.date <= to))).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (wd.length) {
    const wBase = baseTargetMl(d.profile, d.measurements, d.settings);
    const rows = wd.map(([date, ml]) => {
      const t = targetForDate(date, wBase, d.sessions, d.profile);
      return [date, fmtVolume(ml, d.settings.volumeUnit), fmtVolume(t, d.settings.volumeUnit), ml >= t ? 'Yes' : 'No'];
    });
    const met = rows.filter((r) => r[3] === 'Yes').length;
    h2(`Hydration (target met ${met} of ${rows.length} logged days)`);
    table(['Date', 'Drank', 'Target', 'Met'], rows);
  }

  if (d.measurements.length) {
    h2('Body weight');
    table(['Date', `Weight (${wu})`, 'Body fat %', 'Waist cm'], d.measurements.map((m) => [m.date, fmtNum(m.weight, 1), m.bodyFatPct ?? '—', m.waistCm ?? '—']));
  }

  if (list.length) {
    h2('Workout log');
    table(
      ['Date', 'Type', 'Details', 'Volume / time'],
      list.map((s) => [
        s.date,
        s.kind === 'cardio' ? 'Cardio' : 'Strength',
        s.kind === 'cardio'
          ? s.cardio.map((c) => `${c.activity} ${c.durationMin}m${c.distance ? ` ${c.distance}${du}` : ''}`).join('; ')
          : s.strength.map((e) => `${e.exercise} ${e.sets.map((x) => fmtSet(x, e)).join(',')}`).join('; '),
        s.kind === 'cardio' ? fmtMinutes(s.cardio.reduce((a, c) => a + c.durationMin, 0)) : `${fmtNum(sessionVolume(s))} ${wu}`,
      ]),
    );
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted).text(`Gym Diary  ·  ${i} / ${pages}`, W - M, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
  }
  doc.save(`gym-diary-report-${todayKey()}.pdf`);
}
