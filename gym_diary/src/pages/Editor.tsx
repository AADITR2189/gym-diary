import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash, CopySimple, NotePencil, Barbell, Heartbeat, BookmarkSimple, ClockCounterClockwise, Check, Trophy, TrendUp, Calculator, LinkSimple, LinkBreak, Play, Stop, PersonSimple, Timer, DotsSixVertical } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Button, Card, Field, IconBadge, NumberInput, Tag, inputCls } from '../components/ui';
import { ExercisePicker, CardioPicker, ExerciseAutocomplete } from '../components/ExercisePicker';
import type { CardioEntry, Level, MuscleGroup, Session, SessionKind, SetEntry, SetType, StrengthEntry, Template } from '../types';
import { LEVEL_RULES, prefsFrom, resolveTemplate } from '../lib/templates';
import { deleteSession, saveSession, saveTemplate, uid } from '../db/db';
import { promptDialog, toast } from '../lib/dialog';
import { formatLong, isValidKey, todayKey } from '../lib/date';
import { entryVolume, fmtNum, fmtSec, fmtSet, isWorkSet, lastEntryFor, lastSetsFor, personalRecords, sessionCardioMin, sessionVolume, fmtMinutes, setLabels } from '../lib/stats';
import { bodyWeightFor } from '../lib/heatmap';
import { haptic, sound } from '../lib/feedback';
import { spring } from '../lib/spring';

import { currentWeight } from '../lib/body';
import { bodyShare, bwPerRep, isBodyweightByDefault, isTimedByDefault, repRange, suggestNext, usesBarbell, type Suggestion } from '../lib/training';
import { PlateSheet, RestTimerSlot, SetTypeSheet, primeSound, savedRestSec, setTypeTone, type RestRun } from '../components/WorkoutTools';
import CountUp from '../components/CountUp';
import { useFlash } from '../lib/anim';
import type { PersonalRecord } from '../types';
import { groupName } from '../data/exercises';

export const DRAFT_KEY = 'gym-diary-draft';

export function readDraft(): Session | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function newSession(date: string, kind: SessionKind): Session {
  const now = Date.now();
  return { id: uid(), date, kind, strength: [], cardio: [], createdAt: now, updatedAt: now };
}

export default function Editor() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { ready, sessions, userTemplates, settings, categoryOf, profile, measurements } = useData();
  // Body weight for body-weight exercises: latest weigh-in, else profile, else an estimate.
  const bodyWeight = bodyWeightFor(measurements, profile, settings);
  const bodyWeightKnown = currentWeight(measurements, profile) !== undefined;
  const bwFor = (exercise: string, group: MuscleGroup) => bwPerRep(bodyWeight, bodyShare(exercise, group));
  const [nextCardio, setNextCardio] = useState<Template['thenCardio']>();
  const [s, setS] = useState<Session | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [picker, setPicker] = useState(false);
  const [cardioPicker, setCardioPicker] = useState(false);
  const [error, setError] = useState('');
  const [celebrate, setCelebrate] = useState<Celebration | null>(null);
  const [rest, setRest] = useState<RestRun | null>(null);
  const [reorder, setReorder] = useState<{ id: string; from: number; target: number; dy: number; height: number } | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const settle = useRef<{ id: string; y: number } | null>(null);
  // After a reorder, spring the dropped card from where the finger left it into its slot.
  useLayoutEffect(() => {
    const st = settle.current;
    if (!st) return;
    settle.current = null;
    const el = itemRefs.current.get(st.id);
    if (!el || Math.abs(st.y) < 1) return;
    el.style.transform = `translate3d(0, ${st.y}px, 0)`;
    spring(st.y, 0, {
      damping: 0.8,
      response: 0.3,
      onUpdate: (v) => (el.style.transform = v ? `translate3d(0, ${v}px, 0)` : ''),
    });
  });
  const [plates, setPlates] = useState<number | null>(null);
  const initialised = useRef(false);
  /** Ids present when the editor opened; anything else was added now and slides in. */
  const initialIds = useRef<Set<string> | null>(null);
  if (s && !initialIds.current) initialIds.current = new Set([...s.strength.map((e) => e.id), ...s.cardio.map((c) => c.id)]);
  const isAdded = (id: string) => !!initialIds.current && !initialIds.current.has(id);

  // Build the session being edited once data is loaded.
  useEffect(() => {
    if (!ready || initialised.current) return;
    initialised.current = true;
    const id = params.get('id');
    if (id) {
      const found = sessions.find((x) => x.id === id);
      if (found) {
        setS(structuredClone(found));
        setIsNew(false);
        return;
      }
    }
    if (params.get('resume')) {
      const d = readDraft();
      if (d) {
        setS(d);
        return;
      }
    }
    const dateParam = params.get('date') ?? '';
    const date = isValidKey(dateParam) ? dateParam : todayKey();
    const prefs = prefsFrom(profile);
    const lvl = params.get('level');
    const level: Level = lvl === 'beginner' || lvl === 'intermediate' || lvl === 'advanced' ? lvl : prefs.level;
    const tpl = resolveTemplate(params.get('template'), level, prefs.goal, userTemplates);
    const kind: SessionKind = tpl?.kind ?? (params.get('kind') === 'cardio' ? 'cardio' : 'strength');
    const ns = newSession(date, kind);
    if (tpl) {
      ns.name = tpl.name;
      ns.strength = tpl.strength.map((t) => {
        const mode = modeFor(t.exercise, t.muscleGroup);
        const prev = lastSetsFor(sessions, t.exercise) ?? [];
        return {
          id: uid(),
          exercise: t.exercise,
          muscleGroup: t.muscleGroup,
          ...mode,
          // Last-used weight; reps from the template when it sets them. Holds keep their last time.
          sets: Array.from({ length: t.sets }, (_, i) => {
            const p = prev[i] ?? prev[prev.length - 1] ?? { reps: 10, weight: 0 };
            return mode.timed ? { reps: 0, weight: p.weight, sec: p.sec || 30 } : { reps: t.reps ?? (p.reps || 10), weight: p.weight };
          }),
        };
      });
      setNextCardio(tpl.thenCardio);
      ns.cardio = tpl.cardio.map((c) => ({ id: uid(), activity: c.activity, category: categoryOf(c.activity), durationMin: c.durationMin }));
    }
    const ex = params.get('exercise');
    const grp = params.get('group') as MuscleGroup | null;
    if (ex && grp) ns.strength.push(makeEntry(ex, grp));
    const act = params.get('activity');
    const dur = Number(params.get('duration'));
    if (act) ns.cardio.push({ id: uid(), activity: act, category: categoryOf(act), durationMin: dur > 0 ? dur : 30 });
    setS(ns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Autosave unsaved new sessions so nothing is lost if the app is closed mid-workout.
  useEffect(() => {
    if (!s || !isNew) return;
    const hasContent = s.strength.length || s.cardio.length || s.notes;
    try {
      if (hasContent) localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable */
    }
  }, [s, isNew]);

  /** Body-weight and timed mode for a new entry: as you logged it last time, else the exercise's default. */
  function modeFor(exercise: string, muscleGroup: MuscleGroup): Pick<StrengthEntry, 'bw' | 'timed'> {
    const last = lastEntryFor(sessions, exercise);
    // Follow your last choice only if it was made with the switches; workouts logged before they
    // existed (e.g. push-ups saved without body weight) get the exercise's defaults instead.
    const chosen = last?.modeSet ? last : null;
    const useBw = chosen ? chosen.bw !== undefined : isBodyweightByDefault(exercise, muscleGroup);
    const timed = chosen ? !!chosen.timed : isTimedByDefault(exercise);
    return { bw: useBw ? bwFor(exercise, muscleGroup) : undefined, timed: timed || undefined };
  }

  function makeEntry(exercise: string, muscleGroup: MuscleGroup): StrengthEntry {
    const mode = modeFor(exercise, muscleGroup);
    const last = lastSetsFor(sessions, exercise);
    // Reshape last time's sets if the mode differs (e.g. an old plank logged as reps becomes a 30 s hold).
    const sets = (last ?? [{ reps: 10, weight: 0 }]).map((x) =>
      // An old hold logged as reps (plank "60 reps") almost always meant seconds.
      mode.timed ? { ...x, reps: 0, sec: x.sec || (x.reps >= 10 ? x.reps : 30) } : x.sec ? { ...x, sec: undefined, reps: 10 } : x,
    );
    return { id: uid(), exercise, muscleGroup, ...mode, sets };
  }

  const stats = useMemo(
    () => (s ? { volume: sessionVolume(s), minutes: sessionCardioMin(s), sets: s.strength.reduce((a, e) => a + e.sets.filter(isWorkSet).length, 0) } : null),
    [s],
  );

  // Personal records from every other session, to spot new PRs while typing.
  const prevBest = useMemo(() => {
    const m = new Map<string, PersonalRecord>();
    for (const pr of personalRecords(sessions.filter((x) => x.id !== s?.id))) m.set(pr.exercise, pr);
    return m;
  }, [sessions, s?.id]);

  if (!s || !stats) return <div className="p-8 text-center text-muted">Loading…</div>;

  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/'));
  const update = (patch: Partial<Session>) => setS({ ...s, ...patch });
  const updEntry = (id: string, fn: (e: StrengthEntry) => StrengthEntry) =>
    update({ strength: s.strength.map((e) => (e.id === id ? fn(e) : e)) });
  const updCardio = (id: string, patch: Partial<CardioEntry>) =>
    update({ cardio: s.cardio.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addExercise = (ex: string, g: MuscleGroup) => {
    update({ strength: [...s.strength, makeEntry(ex, g)] });
    setError('');
  };

  const isCardio = s.kind === 'cardio';
  const prefs = prefsFrom(profile);
  const groups = supersetLetters(s.strength);

  /**
   * Tick a set off. Finishing a set starts the rest timer, except mid-superset where you go straight on.
   * `patch` (e.g. the seconds from the hold timer) is saved with it and always marks the set done.
   */
  function toggleDone(entryId: string, i: number, patch?: Partial<SetEntry>) {
    if (!s) return;
    const idx = s.strength.findIndex((e) => e.id === entryId);
    const e = s.strength[idx];
    const done = patch ? true : !e.sets[i]?.done;
    updEntry(entryId, (x) => ({ ...x, sets: x.sets.map((st, j) => (j === i ? { ...st, ...patch, done } : st)) }));
    if (!done) return;
    primeSound();
    haptic('light');
    const nextInGroup = e.superset && s.strength[idx + 1]?.superset === e.superset ? s.strength[idx + 1] : null;
    if (nextInGroup) {
      setRest(null);
      return;
    }
    const first = e.superset ? s.strength.find((x) => x.superset === e.superset)! : e;
    const pending = (x: StrengthEntry, skip?: number) => x.sets.findIndex((st, j) => j !== skip && !st.done);
    let next: string | undefined;
    if (e.superset && first.id !== e.id && pending(first) >= 0) next = `Next: round ${pending(first) + 1} of the superset, ${first.exercise}`;
    else if (pending(e, i) >= 0) next = `Next: set ${pending(e, i) + 1} of ${e.exercise}`;
    else if (s.strength[idx + 1]) next = `Next: ${s.strength[idx + 1].exercise}`;
    else next = 'Last set done. Save your workout when you are ready.';
    const total = savedRestSec() ?? LEVEL_RULES[prefs.level].restSec;
    setRest({ total, endAt: Date.now() + total * 1000, next });
  }

  /**
   * Drag-to-reorder: the picked-up card follows the finger 1:1 while the others slide out of its way.
   * On release the order is saved and the card springs the last few pixels into its new slot.
   */
  function startReorder(ev: React.PointerEvent, from: number) {
    if (!s) return;
    ev.preventDefault();
    const ids = s.strength.map((x) => x.id);
    const rects = ids.map((id) => itemRefs.current.get(id)!.getBoundingClientRect());
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 12;
    const y0 = ev.clientY;
    const scroll0 = window.scrollY;
    let target = from;
    let dy = 0;
    let raf = 0;
    haptic('light');
    const centre = (i: number) => rects[i].top + rects[i].height / 2;
    const update = (clientY: number) => {
      dy = clientY - y0 + (window.scrollY - scroll0);
      const c = centre(from) + dy;
      let t = 0;
      for (let i = 0; i < rects.length; i++) if (i !== from && centre(i) < c) t++;
      if (t !== target) haptic('light');
      target = t;
      setReorder({ id: ids[from], from, target, dy, height: rects[from].height + gap });
    };
    let lastY = y0;
    const autoScroll = () => {
      // Scroll only once the card is actually being moved and the finger reaches the top edge
      // or the save bar at the bottom.
      const movedEnough = Math.abs(lastY - y0) > 10;
      const speed = !movedEnough ? 0 : lastY > window.innerHeight - 150 ? 10 : lastY < 80 ? -10 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        update(lastY);
      }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    const move = (e: PointerEvent) => {
      lastY = e.clientY;
      update(e.clientY);
    };
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      // Where the card is drawn now vs. where its new slot is: spring the difference away.
      const h = rects[from].height;
      const newTop = target > from ? rects[target].bottom - h : target < from ? rects[target].top : rects[from].top;
      settle.current = { id: ids[from], y: rects[from].top + dy - newTop };
      setReorder(null);
      if (target !== from)
        setS((prev) => {
          if (!prev) return prev;
          const list = [...prev.strength];
          const [item] = list.splice(from, 1);
          list.splice(target, 0, item);
          return { ...prev, strength: normaliseSupersets(list) };
        });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    setReorder({ id: ids[from], from, target, dy: 0, height: rects[from].height + gap });
  }

  function reorderStyle(id: string, idx: number): React.CSSProperties | undefined {
    if (!reorder) return undefined;
    if (id === reorder.id)
      return { transform: `translate3d(0, ${reorder.dy}px, 0) scale(1.02)`, zIndex: 20, filter: 'drop-shadow(0 12px 24px rgb(0 0 0 / 0.25))' };
    const { from, target, height } = reorder;
    let shift = 0;
    if (from < target && idx > from && idx <= target) shift = -height;
    if (target < from && idx >= target && idx < from) shift = height;
    return { transform: shift ? `translate3d(0, ${shift}px, 0)` : undefined, transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)' };
  }

  /** Link an exercise with the next one into a superset, or split them apart. */
  function toggleLink(idx: number) {
    if (!s) return;
    const list = s.strength.map((e) => ({ ...e }));
    const a = list[idx];
    const b = list[idx + 1];
    if (!b) return;
    if (a.superset && a.superset === b.superset) {
      const fresh = uid();
      for (let j = idx + 1; j < list.length && list[j].superset === a.superset; j++) list[j].superset = fresh;
    } else {
      const id = a.superset ?? uid();
      a.superset = id;
      const old = b.superset;
      for (let j = idx + 1; j < list.length && (j === idx + 1 || (old && list[j].superset === old)); j++) list[j].superset = id;
    }
    update({ strength: normaliseSupersets(list) });
  }

  async function onSave() {
    if (!s) return;
    if (!isValidKey(s.date)) return setError('Pick a valid date.');
    if (s.date > todayKey()) return setError('Workouts can’t be logged in the future.');
    if (isCardio) {
      if (!s.cardio.length) return setError('Add at least one cardio activity.');
      if (s.cardio.some((c) => !c.durationMin || c.durationMin <= 0)) return setError('Duration is required for every activity.');
    } else if (!s.strength.length) return setError('Add at least one exercise.');
    const clean: Session = {
      ...s,
      name: s.name?.trim() || undefined,
      notes: s.notes?.trim() || undefined,
      durationMin: s.durationMin && s.durationMin > 0 ? s.durationMin : undefined,
      strength: isCardio
        ? []
        : normaliseSupersets(s.strength).map((e) => ({
            ...e,
            modeSet: true,
            sets: e.sets.map((x) => {
              const out: SetEntry = { reps: e.timed ? 0 : x.reps || 0, weight: x.weight || 0 };
              if (x.type) out.type = x.type;
              if (e.timed) out.sec = x.sec || 0;
              return out;
            }),
          })),
      cardio: isCardio ? s.cardio.map((c) => ({ ...c, category: c.category ?? categoryOf(c.activity) })) : [],
    };
    await saveSession(clean);
    setRest(null);
    if (isNew) clearDraft();
    const prs = clean.strength
      .map((e) => ({ e, best: newPrLabel(e, prevBest.get(e.exercise), settings.weightUnit) }))
      .filter((x) => x.best)
      .map((x) => `${x.e.exercise}: ${x.best}`);
    const c: Celebration = {
      kind: clean.kind,
      sets: clean.strength.reduce((a, e) => a + e.sets.filter(isWorkSet).length, 0),
      volume: sessionVolume(clean),
      minutes: clean.kind === 'cardio' ? sessionCardioMin(clean) : clean.durationMin ?? 0,
      prs,
    };
    // Sound and haptic on the same frame as the confirmation appears.
    sound(prs.length ? 'record' : 'success');
    haptic('success');
    // A new record or a cardio block to continue to gets the full screen, which waits for you.
    // Otherwise a short message confirms the save and you're straight back where you came from.
    if (prs.length || (nextCardio && isNew && !isCardio)) {
      setCelebrate(c);
      return;
    }
    goBack();
    toast(
      c.kind === 'cardio'
        ? `Workout saved · ${fmtMinutes(c.minutes)} of cardio`
        : `Workout saved · ${c.sets} sets · ${fmtNum(Math.round(c.volume))} ${settings.weightUnit}`,
    );
  }

  // Deleting and discarding happen straight away, with Undo instead of an "Are you sure?".
  async function onDelete() {
    if (!s) return;
    const saved = sessions.find((x) => x.id === s.id);
    await deleteSession(s.id);
    goBack();
    if (saved) toast('Workout deleted', { undo: () => saveSession(saved) });
  }

  function onDiscard() {
    const draft = s;
    clearDraft();
    goBack();
    if (draft && (draft.strength.length || draft.cardio.length))
      toast('Workout discarded', {
        undo: () => {
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          } catch {
            /* storage unavailable */
          }
          window.location.hash = '#/log/edit?resume=1';
        },
      });
  }

  async function onSaveTemplate() {
    if (!s) return;
    const name = await promptDialog({
      title: 'Save as template',
      message: 'Start this workout again in one tap from the Log screen.',
      label: 'Template name',
      initial: s.name || (isCardio ? 'My Cardio' : 'My Workout'),
      confirmLabel: 'Save',
    });
    if (!name) return;
    await saveTemplate({
      id: uid(),
      name: name.trim(),
      kind: s.kind,
      strength: s.strength.map((e) => ({ exercise: e.exercise, muscleGroup: e.muscleGroup, sets: Math.max(1, e.sets.length) })),
      cardio: s.cardio.map((c) => ({ activity: c.activity, durationMin: c.durationMin || 30 })),
    });
    toast(`Template “${name.trim()}” saved to the Log screen`);
  }

  return (
    <div className={rest ? 'pb-64' : 'pb-44'}>
      <div className="bar bar-top sticky top-0 z-30 -mx-4 flex items-center gap-1 px-2 pt-safe">
        <button onClick={isNew ? onDiscard : goBack} className="grid h-12 w-12 place-items-center" aria-label="Back">
          <ArrowLeft size={20} weight="bold" />
        </button>
        <div className="h-title flex-1 truncate text-xl">{isNew ? 'New workout' : 'Edit workout'}</div>
        <button onClick={onSaveTemplate} className="grid h-12 w-12 place-items-center text-muted" aria-label="Save as template" title="Save as template">
          <BookmarkSimple size={20} weight="bold" />
        </button>
        {!isNew && (
          <button onClick={onDelete} className="grid h-12 w-12 place-items-center text-danger" aria-label="Delete workout">
            <Trash size={20} weight="bold" />
          </button>
        )}
      </div>

      {/* Session meta */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(['strength', 'cardio'] as const).map((k) => {
          const active = s.kind === k;
          return (
            <button
              key={k}
              onClick={() => update({ kind: k })}
              disabled={!isNew && !active}
              className={`flex h-12 items-center justify-center gap-2 rounded-btn border font-medium transition-colors disabled:opacity-40 ${
                active ? (k === 'strength' ? 'border-str/30 bg-str-soft text-str' : 'border-car/30 bg-car-soft text-car') : 'border-line bg-surface text-muted'
              }`}
            >
              {k === 'strength' ? <Barbell size={18} weight="bold" /> : <Heartbeat size={18} weight="bold" />}
              {k === 'strength' ? 'Strength' : 'Cardio'}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Field label="Workout date">
          <input type="date" value={s.date} max={todayKey()} onChange={(e) => update({ date: e.target.value })} className={inputCls} />
        </Field>
        {!isCardio && (
          <Field label="Duration (min)">
            <NumberInput value={s.durationMin} onChange={(v) => update({ durationMin: v })} placeholder="—" label="Workout duration in minutes" className="w-28" />
          </Field>
        )}
      </div>
      {isValidKey(s.date) && s.date !== todayKey() && (
        <div className="mt-2">
          <Tag tone="gold">Back-dated · {formatLong(s.date)}</Tag>
        </div>
      )}
      <input
        value={s.name ?? ''}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="Session name (optional, e.g. Push Day)"
        className={`${inputCls} mt-3`}
      />

      {/* Strength */}
      {!isCardio && (
        <div className="mt-6 space-y-3">
          {s.strength.map((e, idx) => {
            const lastSets = lastSetsFor(sessions.filter((x) => x.id !== s.id), e.exercise);
            const next = s.strength[idx + 1];
            const linked = !!e.superset && next?.superset === e.superset;
            return (
              <div
                key={e.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(e.id, el);
                  else itemRefs.current.delete(e.id);
                }}
                className="relative"
                style={reorderStyle(e.id, idx)}
              >
                <StrengthCard
                  onDragStart={s.strength.length > 1 ? (ev) => startReorder(ev, idx) : undefined}
                  added={isAdded(e.id)}
                  prev={prevBest.get(e.exercise)}
                  e={e}
                  idx={idx}
                  unit={settings.weightUnit}
                  lastSets={lastSets}
                  group={e.superset ? groups.get(e.superset) : undefined}
                  suggestion={suggestNext(lastSets, repRange(prefs.goal, e.exercise), settings.weightUnit, e.timed)}
                  bwNow={bwFor(e.exercise, e.muscleGroup)}
                  bodyWeight={bodyWeight}
                  bodyWeightKnown={bodyWeightKnown}
                  onPlates={usesBarbell(e.exercise) ? (w) => setPlates(w) : undefined}
                  onDone={(i, patch) => toggleDone(e.id, i, patch)}
                  onChange={(fn) => updEntry(e.id, fn)}
                  onRemove={() => update({ strength: normaliseSupersets(s.strength.filter((x) => x.id !== e.id)) })}
                />
                {next && (
                  <div className={`flex justify-center ${linked ? '-my-1' : 'mt-1'}`}>
                    <button
                      onClick={() => toggleLink(idx)}
                      className={`hit-44 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
                        linked ? 'border border-car/30 bg-car-soft text-car' : 'text-muted hover:bg-raised'
                      }`}
                      aria-label={linked ? `Split ${e.exercise} and ${next.exercise}` : `Superset ${e.exercise} with ${next.exercise}`}
                    >
                      {linked ? <LinkBreak size={14} weight="bold" /> : <LinkSimple size={14} weight="bold" />}
                      {linked ? 'Superset · tap to split' : 'Superset with next'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <ExerciseAutocomplete onPick={addExercise} />
          <Button variant="secondary" size="lg" className="w-full border-dashed" onClick={() => setPicker(true)}>
            <Plus size={18} weight="bold" /> Browse exercises
          </Button>
        </div>
      )}

      {/* Cardio */}
      {isCardio && (
        <div className="mt-6 space-y-3">
          {s.cardio.map((c) => (
            <Card key={c.id} className={isAdded(c.id) ? 'anim-slide-in' : ''}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="h-title truncate text-xl">{c.activity}</div>
                  <Tag tone="car">{c.category ?? categoryOf(c.activity)}</Tag>
                </div>
                <button
                  onClick={() => update({ cardio: s.cardio.filter((x) => x.id !== c.id) })}
                  className="hit-44 grid h-10 w-10 place-items-center text-muted"
                  aria-label="Remove activity"
                >
                  <Trash size={18} weight="bold" />
                </button>
              </div>
              <div className="eyebrow mt-4">Duration (minutes) · required</div>
              <div className="mt-1.5 flex gap-2">
                <NumberInput value={c.durationMin} onChange={(v) => updCardio(c.id, { durationMin: v ?? 0 })} label="Duration minutes" />
                {[5, 10].map((n) => (
                  <Button key={n} className="shrink-0" onClick={() => updCardio(c.id, { durationMin: (c.durationMin || 0) + n })}>
                    +{n}
                  </Button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Field label={`Distance ${settings.distanceUnit}`}>
                  <NumberInput value={c.distance} step={0.1} onChange={(v) => updCardio(c.id, { distance: v })} placeholder="—" label="Distance" />
                </Field>
                <Field label="Calories">
                  <NumberInput value={c.calories} onChange={(v) => updCardio(c.id, { calories: v })} placeholder="—" label="Calories burned" />
                </Field>
                <Field label="Avg HR">
                  <NumberInput value={c.avgHeartRate} onChange={(v) => updCardio(c.id, { avgHeartRate: v })} placeholder="bpm" label="Average heart rate" />
                </Field>
              </div>
              <textarea
                value={c.notes ?? ''}
                onChange={(ev) => updCardio(c.id, { notes: ev.target.value })}
                placeholder="Notes (pace, incline, how it felt)"
                rows={2}
                className={`${inputCls} mt-3 h-auto py-2`}
              />
            </Card>
          ))}
          <Button variant="secondary" size="lg" className="w-full border-dashed" onClick={() => setCardioPicker(true)}>
            <Plus size={18} weight="bold" /> Add cardio activity
          </Button>
        </div>
      )}

      <textarea
        value={s.notes ?? ''}
        onChange={(e) => update({ notes: e.target.value })}
        placeholder="Session notes (energy, sleep, PR attempts)"
        rows={3}
        className={`${inputCls} mt-5 h-auto py-2`}
      />

      {/* Sticky save bar */}
      <div className="bar bar-bottom fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 py-3">
        <div className="mx-auto max-w-lg">
          {!isCardio && <RestTimerSlot run={rest} onChange={setRest} onStop={() => setRest(null)} />}
          {error && <div className="mb-2 text-sm text-danger">{error}</div>}
          <div className="flex items-center gap-3">
            <div className="num min-w-0 flex-1 text-sm text-muted">
              {isCardio ? (
                <>
                  <span className="font-medium text-ink">
                    <CountUp value={stats.minutes} duration={400} />
                  </span>{' '}
                  min total
                </>
              ) : (
                <>
                  <span className="font-medium text-ink">
                    <CountUp value={stats.sets} duration={400} />
                  </span>{' '}
                  sets ·{' '}
                  <span className="font-medium text-ink">
                    <CountUp value={stats.volume} duration={450} format={(n) => fmtNum(Math.round(n))} />
                  </span>{' '}
                  {settings.weightUnit}
                </>
              )}
            </div>
            <Button variant="primary" size="lg" className="min-w-[140px]" onClick={onSave}>
              Save workout
            </Button>
          </div>
        </div>
      </div>

      {celebrate && (
        <SavedOverlay
          c={celebrate}
          unit={settings.weightUnit}
          onDone={goBack}
          next={
            nextCardio && isNew && !isCardio
              ? {
                  label: `${nextCardio.activity} · ${nextCardio.durationMin} min`,
                  go: () =>
                    nav(`/log/edit?${new URLSearchParams({ date: s.date, kind: 'cardio', activity: nextCardio.activity, duration: String(nextCardio.durationMin) })}`, {
                      replace: true,
                    }),
                }
              : undefined
          }
        />
      )}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(ex, g) => {
          addExercise(ex, g);
          setPicker(false);
        }}
      />
      <PlateSheet open={plates !== null} initial={plates ?? 0} unit={settings.weightUnit} onClose={() => setPlates(null)} />
      <CardioPicker
        open={cardioPicker}
        onClose={() => setCardioPicker(false)}
        onPick={(a, category) => {
          update({ cardio: [...s.cardio, { id: uid(), activity: a, category, durationMin: 30 }] });
          setCardioPicker(false);
          setError('');
        }}
      />
    </div>
  );
}

function StrengthCard({
  e,
  idx,
  unit,
  lastSets,
  onChange,
  onRemove,
  onDone,
  onPlates,
  onDragStart,
  suggestion,
  group,
  added,
  prev,
  bwNow,
  bodyWeight,
  bodyWeightKnown,
}: {
  e: StrengthEntry;
  idx: number;
  unit: string;
  added?: boolean;
  prev?: PersonalRecord;
  lastSets: StrengthEntry['sets'] | null;
  suggestion: Suggestion | null;
  /** Superset letter (A, B, …) when this exercise is part of one. */
  group?: string;
  onChange: (fn: (e: StrengthEntry) => StrengthEntry) => void;
  onRemove: () => void;
  onDone: (i: number, patch?: Partial<SetEntry>) => void;
  onPlates?: (weight: number) => void;
  /** Press-and-drag the grip to reorder exercises. */
  onDragStart?: (e: React.PointerEvent) => void;
  /** Body weight counted per rep if body-weight mode were switched on now. */
  bwNow: number;
  bodyWeight: number;
  bodyWeightKnown: boolean;
}) {
  const [showNotes, setShowNotes] = useState(!!e.notes);
  const [typeFor, setTypeFor] = useState<number | null>(null);
  const setSet = (i: number, patch: Partial<StrengthEntry['sets'][number]>) =>
    onChange((x) => ({ ...x, sets: x.sets.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const last = e.sets[e.sets.length - 1];
  const initialSets = useRef(e.sets.length);
  const pr = newPrLabel(e, prev, unit);
  const labels = setLabels(e.sets);
  const working = e.sets.filter(isWorkSet);
  const timed = !!e.timed;
  const usesBw = e.bw !== undefined;
  const topWeight = Math.max(0, ...working.map((x) => x.weight || 0));
  // Only the top sets change, so pyramids and back-off sets keep their own weights.
  const applySuggestion = (sg: Suggestion) =>
    onChange((x) => ({
      ...x,
      sets: x.sets.map((st) =>
        isWorkSet(st) && st.type !== 'drop' && (st.weight || 0) === topWeight ? { ...st, weight: sg.weight, ...(sg.sec ? { sec: sg.sec } : { reps: sg.reps }) } : st,
      ),
    }));
  const alreadyApplied =
    !!suggestion && working.some((st) => st.weight === suggestion.weight && (suggestion.sec ? st.sec === suggestion.sec : st.reps === suggestion.reps));
  const suggestionText = !suggestion
    ? ''
    : suggestion.sec
      ? `${suggestion.weight ? `+${suggestion.weight} ${unit} · ` : ''}hold ${fmtSec(suggestion.sec)}`
      : suggestion.weight > 0
        ? `${usesBw ? `body weight + ${suggestion.weight}` : suggestion.weight} ${unit} × ${suggestion.reps}`
        : `${suggestion.reps} reps`;

  // Hold timer: counts down from the set's target time (or up from 0 when it has none).
  const [run, setRun] = useState<{ i: number; start: number; target: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!run) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [run]);
  const elapsed = run ? Math.floor((now - run.start) / 1000) : 0;
  const finishRun = (secs: number) => {
    if (!run) return;
    const i = run.i;
    setRun(null);
    onDone(i, { sec: Math.max(1, secs) });
  };
  useEffect(() => {
    if (run && run.target > 0 && elapsed >= run.target) {
      sound('rest');
      haptic('warning');
      finishRun(run.target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, run]);

  const toggleTimed = () =>
    onChange((x) => ({
      ...x,
      timed: x.timed ? undefined : true,
      sets: x.sets.map(({ done: _d, ...st }) => (x.timed ? { ...st, sec: undefined, reps: st.reps || 10 } : { ...st, reps: 0, sec: st.sec || 30 })),
    }));
  const toggleBw = () => onChange((x) => ({ ...x, bw: x.bw === undefined ? bwNow : undefined }));
  const share = bodyWeight ? Math.round(((e.bw ?? bwNow) / bodyWeight) * 100) : 0;

  return (
    <Card className={`p-4 ${added ? 'anim-slide-in' : ''} ${group ? 'border-l-4 border-l-car' : ''}`}>
      <div className="flex items-start gap-3">
        {onDragStart && (
          <button
            onPointerDown={onDragStart}
            className="hit-44 -ml-2 -mr-1 grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
            aria-label={`Drag to reorder ${e.exercise}`}
            title="Drag to reorder"
          >
            <DotsSixVertical size={18} weight="bold" />
          </button>
        )}
        <IconBadge tone={group ? 'car' : 'str'} size="sm">
          <span className="num text-sm font-semibold">{group ?? idx + 1}</span>
        </IconBadge>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">{e.exercise}</div>
          <div className="num text-xs text-muted">
            {group ? `Superset ${group} · ` : ''}
            {groupName(e.muscleGroup)}
            {!timed && ` · volume ${fmtNum(entryVolume(e))} ${unit}`}
          </div>
        </div>
        {onPlates && !timed && (
          <button onClick={() => onPlates(topWeight)} className="hit-44 grid h-9 w-9 place-items-center text-muted" aria-label="Plate calculator" title="Plate calculator">
            <Calculator size={18} weight="bold" />
          </button>
        )}
        <button onClick={() => setShowNotes(!showNotes)} className="hit-44 grid h-9 w-9 place-items-center text-muted" aria-label="Exercise notes">
          <NotePencil size={18} weight="bold" />
        </button>
        <button onClick={onRemove} className="hit-44 grid h-9 w-9 place-items-center text-muted" aria-label="Remove exercise">
          <Trash size={18} weight="bold" />
        </button>
      </div>

      {/* Mode switches */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ModeToggle on={usesBw} onClick={toggleBw} icon={<PersonSimple size={14} weight="bold" />}>
          Include body weight
        </ModeToggle>
        <ModeToggle on={timed} onClick={toggleTimed} icon={<Timer size={14} weight="bold" />}>
          Timed (seconds)
        </ModeToggle>
      </div>
      {usesBw && (
        <p className="num mt-1.5 text-xs text-muted">
          Counts {share}% of your body weight: <b className="text-ink">{fmtNum(e.bw!, 1)} {unit}</b>
          {timed ? ' (shown on the muscle map).' : ' per rep.'} Weight below is extra load (vest, belt, dumbbell).
          {!bodyWeightKnown && (
            <>
              {' '}
              Based on an estimated {fmtNum(bodyWeight, 0)} {unit}.{' '}
              <Link to="/profile" className="underline">
                Add your weight
              </Link>
            </>
          )}
        </p>
      )}

      {pr && (
        <div key={pr} className="anim-pop mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold-soft px-2.5 py-1 text-xs font-semibold text-gold">
          <Trophy size={13} weight="fill" /> New PR: {pr}
        </div>
      )}
      {lastSets && (
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[0.6875rem] text-muted">
          <ClockCounterClockwise size={12} weight="bold" /> Last time: {lastSets.map((x) => `${x.type === 'warmup' ? 'W ' : ''}${fmtSet(x, e)}`).join(', ')}
        </div>
      )}
      {suggestion && (
        <div className="mt-2 flex items-center gap-2 rounded-btn border border-str/25 bg-str-soft px-3 py-2">
          <TrendUp size={18} weight="bold" className="shrink-0 text-str" />
          <div className="min-w-0 flex-1">
            <div className="num text-sm font-medium text-str">Try today: {suggestionText}</div>
            <div className="text-xs text-muted">{suggestion.reason}</div>
          </div>
          {!alreadyApplied && (
            <Button size="sm" className="shrink-0" onClick={() => applySuggestion(suggestion)}>
              Use
            </Button>
          )}
        </div>
      )}
      <div className="eyebrow mt-4 grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 text-center">
        <span>Set</span>
        <span>{usesBw ? `+ extra ${unit}` : `Weight ${unit}`}</span>
        <span>{timed ? 'Time m:ss' : 'Reps'}</span>
        <span>{timed ? 'Timer' : 'Done'}</span>
      </div>
      <div className="mt-1.5 space-y-2">
        {e.sets.map((st, i) =>
          timed ? (
            <TimedSetRow
              key={i}
              label={labels[i]}
              type={st.type}
              done={!!st.done}
              weight={st.weight}
              sec={st.sec ?? 0}
              running={run?.i === i}
              shown={run?.i === i ? (run.target ? Math.max(0, run.target - elapsed) : elapsed) : st.sec ?? 0}
              added={i >= initialSets.current}
              onType={() => setTypeFor(i)}
              onWeight={(v) => setSet(i, { weight: v ?? 0 })}
              onSec={(v) => setSet(i, { sec: v })}
              onTimer={() => {
                if (run?.i === i) return finishRun(elapsed);
                if (st.done) return onDone(i); // undo
                primeSound();
                setNow(Date.now());
                setRun({ i, start: Date.now(), target: st.sec ?? 0 });
              }}
            />
          ) : (
            <SetRow
              key={i}
              label={labels[i]}
              type={st.type}
              done={!!st.done}
              weight={st.weight}
              reps={st.reps}
              added={i >= initialSets.current}
              onType={() => setTypeFor(i)}
              onWeight={(v) => setSet(i, { weight: v ?? 0 })}
              onReps={(v) => setSet(i, { reps: v ?? 0 })}
              onDone={() => onDone(i)}
            />
          ),
        )}
      </div>
      <Button
        size="sm"
        className="mt-3 w-full"
        onClick={() =>
          onChange((x) => ({
            ...x,
            sets: [
              ...x.sets,
              last
                ? { reps: last.reps, weight: last.weight, type: last.type === 'warmup' ? undefined : last.type, ...(timed ? { sec: last.sec || 30 } : {}) }
                : timed
                  ? { reps: 0, weight: 0, sec: 30 }
                  : { reps: 10, weight: 0 },
            ],
          }))
        }
      >
        {last ? <CopySimple size={16} weight="bold" /> : <Plus size={16} weight="bold" />} Add set{' '}
        {last && <span className="num text-muted">({fmtSet(last, e)})</span>}
      </Button>
      <p className="mt-2 text-center text-[0.6875rem] text-muted">
        {timed ? 'Tap ▶ to start the hold timer; it beeps at the target time. Tap ■ to stop early. ' : ''}Tap a set number to make it a warm-up, drop set or set to
        failure.
      </p>
      {showNotes && (
        <textarea
          value={e.notes ?? ''}
          onChange={(ev) => onChange((x) => ({ ...x, notes: ev.target.value }))}
          placeholder="Exercise notes (tempo, form cues, RPE)"
          rows={2}
          className={`${inputCls} mt-2 h-auto py-2`}
        />
      )}
      <SetTypeSheet
        open={typeFor !== null}
        label={typeFor !== null ? `Set ${typeFor + 1}` : ''}
        current={typeFor !== null ? e.sets[typeFor]?.type : undefined}
        onClose={() => setTypeFor(null)}
        onPick={(t) => {
          if (typeFor !== null) setSet(typeFor, { type: t });
          setTypeFor(null);
        }}
        onDelete={() => {
          if (typeFor !== null) onChange((x) => ({ ...x, sets: x.sets.filter((_, j) => j !== typeFor) }));
          setTypeFor(null);
        }}
      />
    </Card>
  );
}

function ModeToggle({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`hit-44 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
        on ? 'border-str/40 bg-str-soft text-str' : 'border-line bg-bg text-muted'
      }`}
    >
      {on ? <Check size={14} weight="bold" /> : icon}
      {children}
    </button>
  );
}

/**
 * What to show as a new record, or null. Reps: heavier, or same weight for more reps (body weight
 * counts with no extra load). Holds: longer than your longest hold.
 */
function newPrLabel(e: StrengthEntry, prev: PersonalRecord | undefined, unit: string): string | null {
  if (!prev) return null; // first time doing an exercise isn't treated as a PR
  if (e.timed) {
    const best = Math.max(0, ...e.sets.filter(isWorkSet).map((st) => st.sec || 0));
    return prev.bestTimeSec && best > prev.bestTimeSec ? `${fmtSec(best)} hold` : null;
  }
  let best: { weight: number; reps: number } | null = null;
  for (const st of e.sets) {
    if (!st.reps || !isWorkSet(st) || (!st.weight && e.bw === undefined)) continue;
    const beats = st.weight > prev.maxWeight || (st.weight === prev.maxWeight && st.reps > prev.maxWeightReps);
    if (beats && (!best || st.weight > best.weight || (st.weight === best.weight && st.reps > best.reps))) best = { weight: st.weight, reps: st.reps };
  }
  if (!best) return null;
  return best.weight ? `${e.bw !== undefined ? 'BW + ' : ''}${best.weight} ${unit} × ${best.reps}` : `${best.reps} reps`;
}

/** "90" or "1:30" → 90 seconds. */
function parseTime(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const [a, b] = t.split(':');
  const n = b !== undefined ? Number(a) * 60 + Number(b) : Number(a);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** A timed set: optional extra weight, time held (typed as 90 or 1:30) and a start/stop hold timer. */
function TimedSetRow({
  label,
  type,
  done,
  weight,
  sec,
  running,
  shown,
  added,
  onType,
  onWeight,
  onSec,
  onTimer,
}: {
  label: string;
  type?: SetType;
  done: boolean;
  weight: number;
  sec: number;
  running: boolean;
  shown: number;
  added: boolean;
  onType: () => void;
  onWeight: (v: number | undefined) => void;
  onSec: (v: number | undefined) => void;
  onTimer: () => void;
}) {
  const flash = useFlash(done);
  const [text, setText] = useState(sec ? fmtSec(sec) : '');
  useEffect(() => {
    setText(sec ? fmtSec(sec) : '');
  }, [sec]);
  return (
    <div className={`grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 rounded-btn ${added ? 'anim-slide-in' : ''} ${flash ? 'anim-set-done' : ''}`}>
      <button
        onClick={onType}
        className={`hit-44 num mx-auto grid h-9 w-9 place-items-center rounded-full font-semibold ${setTypeTone(type)}`}
        aria-label={`Set ${label}: change set type or delete`}
      >
        {label}
      </button>
      <NumberInput value={weight} step={0.5} onChange={onWeight} label={`Set ${label} extra weight`} className={done ? 'border-str/40' : ''} />
      {running ? (
        <div className="num grid h-12 place-items-center rounded-btn border border-gold bg-gold-soft text-lg font-semibold text-gold" aria-live="polite">
          {fmtSec(shown)}
        </div>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          value={text}
          placeholder="0:30"
          aria-label={`Set ${label} time held, seconds or minutes:seconds`}
          onFocus={(ev) => ev.target.select()}
          onChange={(ev) => setText(ev.target.value)}
          onBlur={() => {
            const v = parseTime(text);
            onSec(v);
            setText(v ? fmtSec(v) : '');
          }}
          className={`num h-12 w-full rounded-btn border bg-bg px-3 text-center text-lg font-medium outline-none focus:border-ink/40 ${done ? 'border-str/40' : 'border-line'}`}
        />
      )}
      <button
        onClick={onTimer}
        aria-pressed={done}
        aria-label={running ? `Stop timer for set ${label}` : done ? `Set ${label} done. Tap to undo` : `Start hold timer for set ${label}`}
        className={`grid h-11 w-11 place-items-center rounded-btn border transition-colors ${
          running ? 'border-gold bg-gold text-bg' : done ? 'border-str bg-str text-bg' : 'border-line bg-bg text-muted'
        }`}
      >
        {running ? <Stop size={18} weight="fill" /> : done ? <Check size={18} weight="bold" className={flash ? 'anim-pop' : ''} /> : <Play size={18} weight="fill" />}
      </button>
    </div>
  );
}

/** Drop superset ids that only one exercise (or non-adjacent exercises) still carries. */
function normaliseSupersets(list: StrengthEntry[]): StrengthEntry[] {
  return list.map((e, i) => {
    if (!e.superset) return e;
    const linked = list[i - 1]?.superset === e.superset || list[i + 1]?.superset === e.superset;
    return linked ? e : { ...e, superset: undefined };
  });
}

/** A, B, C… for each superset, in the order they appear. */
function supersetLetters(list: StrengthEntry[]) {
  const m = new Map<string, string>();
  for (const e of list) if (e.superset && !m.has(e.superset)) m.set(e.superset, String.fromCharCode(65 + m.size));
  return m;
}

/** One set row. The label opens the set-type menu; the tick marks it done and starts the rest timer. */
function SetRow({
  label,
  type,
  done,
  weight,
  reps,
  added,
  onType,
  onWeight,
  onReps,
  onDone,
}: {
  label: string;
  type?: SetType;
  done: boolean;
  weight: number;
  reps: number;
  added: boolean;
  onType: () => void;
  onWeight: (v: number | undefined) => void;
  onReps: (v: number | undefined) => void;
  onDone: () => void;
}) {
  const flash = useFlash(done);
  return (
    <div className={`grid grid-cols-[2.5rem_1fr_1fr_2.75rem] items-center gap-2 rounded-btn ${added ? 'anim-slide-in' : ''} ${flash ? 'anim-set-done' : ''}`}>
      <button
        onClick={onType}
        className={`hit-44 num mx-auto grid h-9 w-9 place-items-center rounded-full font-semibold ${setTypeTone(type)}`}
        aria-label={`Set ${label}: change set type or delete`}
      >
        {label}
      </button>
      <NumberInput value={weight} step={0.5} onChange={onWeight} label={`Set ${label} weight`} className={done ? 'border-str/40' : ''} />
      <NumberInput value={reps} onChange={onReps} label={`Set ${label} reps`} className={done ? 'border-str/40' : ''} />
      <button
        onClick={onDone}
        aria-pressed={done}
        aria-label={done ? `Set ${label} done. Tap to undo` : `Mark set ${label} done and start rest timer`}
        className={`grid h-11 w-11 place-items-center rounded-btn border transition-colors ${done ? 'border-str bg-str text-bg' : 'border-line bg-bg text-muted'}`}
      >
        <Check size={18} weight="bold" className={done && flash ? 'anim-pop' : ''} />
      </button>
    </div>
  );
}

interface Celebration {
  kind: 'strength' | 'cardio';
  sets: number;
  volume: number;
  minutes: number;
  prs: string[];
}

/** Full-screen "saved" moment: a drawn check mark, counting stats and any new PRs with a sparkle burst. */
function SavedOverlay({ c, unit, onDone, next }: { c: Celebration; unit: string; onDone: () => void; next?: { label: string; go: () => void } }) {
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  // No timer: the screen stays until you tap, so it never moves you on before you've read it.
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const d = 46 + (i % 3) * 14;
    return { dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, delay: `${(i % 4) * 40}ms`, cls: i % 2 ? 'bg-gold' : 'bg-str' };
  });
  return (
    <div className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-bg/85 px-6 backdrop-blur-sm" onClick={finish} role="status">
      <div className="anim-pop w-full max-w-xs rounded-card border border-line bg-surface p-6 text-center">
        <svg width="84" height="84" viewBox="0 0 84 84" className="mx-auto">
          <circle cx="42" cy="42" r="38" fill="none" className="stroke-str anim-draw" strokeWidth="5" style={{ ['--len' as string]: 240 }} />
          <path
            d="M26 43 l11 11 l22 -24"
            fill="none"
            className="stroke-str anim-draw"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ['--len' as string]: 56, animationDelay: '380ms' }}
          />
        </svg>
        <div className="h-title mt-3 text-3xl">Workout saved</div>
        <div className="mt-2 text-sm text-muted">
          {c.kind === 'cardio' ? (
            <>
              <span className="font-medium text-ink">
                <CountUp value={c.minutes} format={(n) => fmtMinutes(n)} />
              </span>{' '}
              of cardio
            </>
          ) : (
            <>
              <span className="font-medium text-ink">
                <CountUp value={c.sets} />
              </span>{' '}
              sets ·{' '}
              <span className="font-medium text-ink">
                <CountUp value={c.volume} format={(n) => fmtNum(Math.round(n))} />
              </span>{' '}
              {unit} lifted
            </>
          )}
        </div>
        {c.prs.length > 0 && (
          <div className="mt-5">
            <div className="relative mx-auto h-14 w-14">
              {sparks.map((p, i) => (
                <span
                  key={i}
                  className={`sparkle ${p.cls}`}
                  style={{ ['--dx' as string]: p.dx, ['--dy' as string]: p.dy, animationDelay: `calc(600ms + ${p.delay})` }}
                />
              ))}
              <span className="anim-pop absolute inset-0 grid place-items-center rounded-full bg-gold-soft text-gold" style={{ animationDelay: '600ms' }}>
                <Trophy size={28} weight="fill" />
              </span>
            </div>
            <div className="h-title mt-2 text-xl text-gold">{c.prs.length > 1 ? `${c.prs.length} new PRs` : 'New PR'}</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {c.prs.map((p) => (
                <li key={p} className="num">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {next ? (
          <div className="mt-5 space-y-2">
            <Button
              variant="primary"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                doneRef.current = true;
                next.go();
              }}
            >
              <Heartbeat size={18} weight="bold" /> Continue to cardio
            </Button>
            <div className="num text-sm">{next.label}</div>
            <div className="text-xs text-muted">or tap anywhere to finish</div>
          </div>
        ) : (
          <Button variant="primary" className="mt-5 w-full" onClick={finish}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
