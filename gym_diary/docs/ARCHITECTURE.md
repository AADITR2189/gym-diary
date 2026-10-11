# Gym Diary: Design & Architecture

Gym Diary is a personal, single-user gym and cardio diary. It has no accounts and no server, and every record stays on the device. Version 2 adds:

- a profile, body measurements and goals
- a normalised database
- light and dark themes
- Excel and PDF export
- exercise search and autocomplete
- a warm, minimalist design with athletic typography

Sections:

1. [Application architecture](#1-application-architecture)
2. [Database design](#2-database-design)
3. [UI design system](#3-ui-design-system)
4. [Screens](#4-screens)
5. [Dashboard wireframe](#5-dashboard-wireframe)
6. [Data model and metrics](#6-data-model-and-metrics)
7. [Component structure](#7-component-structure)
8. [PWA strategy](#8-pwa-strategy)
9. [Source tree](#9-source-tree)
10. [Scaling and future enhancements](#10-scaling-and-future-enhancements)

---

## 1. Application architecture

```
React UI (pages, components, Tailwind tokens)
   │ reads                         ▲ re-render on notify()
   ▼                               │
DataProvider (context) ── loads every store, builds Session aggregates and derived lookups
   │ calls
   ▼
db.ts  ── repository layer: assembles and splits aggregates, materialises PRs, migrations
   ▼
IndexedDB "gym-diary" v2 (normalised stores, persistent-storage requested)

lib/stats.ts   pure analytics: volume, streaks, trends, PRs, improvement, annual
lib/goals.ts   live goal progress and completion %
lib/body.ts    current weight, weight change, BMI, maintenance calories
lib/export.ts  .xlsx workbook + PDF report (lazy-loaded)
lib/csv.ts     CSV export/import (round-trips)
Service worker (Workbox) precaches the app shell, fonts and export libraries for offline use
```

**Key decisions**

| Decision | Why |
|---|---|
| No backend, IndexedDB only | Single user. Works offline, needs no account, costs nothing to run. |
| Normalised stores behind a repository | Matches a relational model (see `schema.sql`), so a sync backend can be added later without reshaping data. The UI still works with a convenient `Session` aggregate. |
| Analytics computed live; only PRs materialised | Nothing goes stale when a past workout is edited. PRs are rebuilt on every save or delete so they can be read directly. |
| Strength and cardio are separate sessions | Cardio never asks for sets, reps or weight. |
| `HashRouter` with `base: './'` | Runs on any static host, at any path, offline. |
| Export libraries loaded on demand | jsPDF and the xlsx writer are about 550 KB. They are never loaded unless you export, but they are precached so exporting works offline. |

---

## 2. Database design

The design is normalised. The same entities exist in two forms:

- **On-device:** IndexedDB, in `src/db/db.ts`
- **Server-ready:** PostgreSQL DDL, in [`docs/schema.sql`](schema.sql)

| Table (SQL) | IndexedDB store | Key / indexes | Purpose |
|---|---|---|---|
| `users` | `users` | `id = "me"` | Profile: name, height, weight, age, gender, fitness goal, activity level |
| `muscle_groups` | `muscleGroups` | `id` | 12 groups with region (Upper Body / Legs / Core / Full Body). Seeded on start-up. |
| `exercises` | `exercises` | `id`; by-group, by-name | About 115 built-ins (stable ids such as `chest:barbell-bench-press`) plus custom exercises |
| `workout_sessions` | `workoutSessions` | `id`; by-date, by-kind | Session header: date, kind, name, notes, duration |
| `workout_exercises` (+ `workout_sets`) | `workoutExercises` | `id`; by-session, by-name | Exercises in a session, in order. Sets are embedded as an array on the device and are a child table in SQL. |
| `cardio_sessions` | `cardioSessions` | `id`; by-session, by-date | Activity, type, duration\*, distance, calories, average heart rate, notes |
| `fitness_goals` | `fitnessGoals` | `id` | Goal type, target, baseline, deadline, achieved and archived flags |
| `body_measurements` | `bodyMeasurements` | `id`; by-date | Weight, body fat %, waist |
| `personal_records` | `personalRecords` | `exercise` | Materialised: heaviest set, best e1RM, best set and session volume |
| `water_logs` | `waterLogs` | `id`; by-date | One row per drink: date, amount (ml), time logged. Added in DB v3. |
| `cardio_activities` | `customCardio` | `id` | Custom activities. Built-ins live in code. |
| `favorites`, `workout_templates` | `favorites`, `templates` | n/a | Quick entry |
| n/a | `kv` | `settings` | Units, week start, theme |

**Hydration (v3).** Database version 3 adds the `waterLogs` store; upgrading from v2 only creates the new store, so existing data is untouched (tested). The daily target is: the profile's own target, or else 35 ml per kg of current body weight, or else 2.5 L, plus 500 ml per hour of exercise logged that day when "extra water on workout days" is on.

**Migrations.** `openDB(..., 2, upgrade)` creates the v2 stores. When it upgrades from v1, it reads the old embedded `sessions` store and splits each session into header, exercise and cardio rows. It moves custom exercises into `exercises`, builds `personalRecords`, then drops the old stores. This has been tested with real v1 data. Backups carry a `version` field, and restore accepts both v1 and v2 files.

---

## 3. UI design system

The primary colours are **teal `#004741` on sand `#F0EDE4`** (light) and **yellow `#FFFE15` on navy `#0C1E29`** (dark). Every other colour is tuned so that all text reaches WCAG AA contrast (at least 4.5:1) on every surface it appears on. Borders are 1px; there are no gradients or heavy shadows.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F0EDE4` | `#0C1E29` | Canvas (primary background) |
| `surface` / `raised` | `#FAF8F2` / `#E5E1D4` | `#112A39` / `#173648` | Cards / hover and inputs |
| `line` | `#D4CFBF` | `#24475C` | Borders and dividers |
| `ink` | `#004741` | `#FFFE15` | Primary text (9.1:1 / 15.8:1 on bg) |
| `muted` | `#4A6763` | `#C9C88A` | Secondary text (at least 4.7:1 everywhere) |
| `primary` | `#004741` on `#F0EDE4` | `#FFFE15` on `#0C1E29` | Primary buttons, active filters |
| `str` (+ soft) | `#2C6B1F` on `#DCEAD3` | `#7EE08A` on `#123A2C` | Strength identity |
| `car` (+ soft) | `#1D5C8C` on `#D9E7F1` | `#6FC7FF` on `#103348` | Cardio identity |
| `gold` (+ soft) | `#8A5300` on `#F4E3C0` | `#FFB44D` on `#3A2C12` | Streaks, PRs, back-dating |
| `danger` (+ soft) | `#A3261F` on `#F6DBD6` | `#FF8F85` on `#3E1F26` | Delete actions, calories series |

- **Type ("Athletic"):** Barlow Condensed Bold for headings and big numbers. Page, section and chart titles are uppercase, like a scoreboard. Barlow for UI text (line-height 1.6). Geist Mono for small uppercase labels and metadata. All fonts are bundled locally, so they work offline.
- **Icons:** Phosphor, in bold weight, or fill for the active state.
- **Shape:** cards use a 12px radius, buttons and inputs 6px, and tags are pills.
- **Motion:** cards fade and rise in on scroll (IntersectionObserver, 600ms, staggered by 80ms), buttons scale to 0.98 when pressed, and a single slow ambient light drifts on a fixed layer. Workout animations (`lib/anim.ts`, keyframes in `index.css`):
  - Completed sets flash green and show a tick.
  - New sets and exercises slide in.
  - The save bar's sets and volume count up live.
  - A gold **New PR** badge pops in when a set beats your record.
  - Saving shows a drawn check mark with the session's stats, plus a sparkle burst for new PRs.
  - Home has a weekly workout-goal ring.
  - Big numbers count up when they come into view, and charts grow in when first scrolled to.
  - The streak flame flickers while a streak is alive.
  - Calendar workout days pop in one after another.
  - Everything is switched off under `prefers-reduced-motion`.
- **Theme:** Dark (default), Light or System. The choice is applied before first paint by an inline script, so there is no flash of the wrong theme.

---

## 4. Screens

The bottom navigation reads **Home · Calendar · [+] · History · Progress**. The Home header links to **Profile** and **Settings**. The Log screen links to the **Exercise library**.

| Screen | Route | Contents |
|---|---|---|
| Dashboard | `#/` | Today, weekly ring, water, **muscle heat map** (Last workout / 7 / 30 days / All time, tap a muscle, ranked list), overview tiles, week and month, the strength and cardio analytics below, recent workouts, goal completion |
| Log | `#/log` | Date (back-dating), Strength / Cardio / Water buttons, **Recommended for you** (under-trained this week, rested 48 h+), favourite or classic templates, my templates, favourites, frequent and recent, draft resume |
| Editor | `#/log/edit` | Date, duration, name. Strength: autocomplete quick-add, browse with filters, sets grid, "last time" hint. Cardio: duration\*, distance, calories, average HR, notes. Save as template, delete. |
| Templates | `#/templates?date=` | 108 one-tap templates: Classic / Single / Two / Three tabs, Favourites, equipment + difficulty filters, search, detail sheet (mini muscle map, primary/secondary, difficulty, duration, sets, rep range, rest, exercise list with last weight) and Start |
| Workout details | `#/session?id=` | Tapping any past workout: stats, PRs, single-colour muscle map + ranked list, expandable exercises with their own map and sets, Edit |
| Calendar | `#/calendar` | Month grid with strength and cardio dots, day detail, backfill buttons |
| History | `#/history` | Search, date presets or a custom range, type and muscle filters |
| Progress | `#/progress` | Streak, days this month, body weight, goal %, active days, body-weight trend, goals, exercise progression, strength improvement, strongest lifts, muscle frequency, personal bests |
| Profile | `#/profile` | Name, height, weight, age, gender, fitness goal, activity level. **Training preferences** (experience level, equipment). BMI and maintenance calories. Weigh-in log with trend. |
| Water | `#/water?date=` | Animated progress ring, three one-tap sizes (set in Profile), custom amount, undo, back-dating, edit and delete entries |
| Goals | `#/goals` | Six goal types, live progress bars, overall %, deadline, archive and restore |
| Exercises | `#/exercises` | Searchable, filterable library (by muscle, Legs, favourites, recent, frequent, custom) with per-exercise muscle map, equipment, history, PR and "Log today" |
| Settings | `#/settings` | Theme, units, Excel/PDF/CSV export with a date range, backup and restore, CSV import, storage, install help, custom exercises, sample data, erase |

---

## 5. Dashboard wireframe

```
FRIDAY, OCTOBER 2, 2026                 [profile] [settings]
Good evening, Aadi
┌───────────────────────────────────────────────┐
│ ○ No workout logged today                [+] │
└───────────────────────────────────────────────┘
OVERVIEW
[Total workouts][Streak      ][Days this month][Avg duration]
[Total volume  ][Current wt  ][Weight change  ][Goals %     ]
[This week: sessions · volume · cardio][This month: ...     ]
STRENGTH                                  (Weekly | Monthly)
[Weekly/Monthly volume   ][Volume lifted by day (30d)]
[Volume by muscle group  ][Weight progression        ]
[Most performed          ][Personal records          ]
[Annual progress: year · workouts · days · volume (+%) · cardio]
CARDIO                                    (Weekly | Monthly)
[Total][This week][This month]
[Weekly/Monthly cardio   ][Cardio by type            ]
[Activity breakdown      ][Distance trend            ]
[Calories burned trend   ]
RECENT WORKOUTS · Goal completion bar
```

On phones each row stacks into a single column. From `md` upwards the charts sit in two columns and the tiles in four.

---

## 6. Data model and metrics

TypeScript types are defined in `src/types.ts`. Metric definitions:

| Metric | Definition |
|---|---|
| Volume | Σ reps × weight. Shown per set, per exercise, per session, per day, week, month and year. |
| Estimated 1RM | Epley formula: `weight × (1 + reps/30)` |
| Average workout duration | Mean of sessions that have a duration. Strength sessions use the entered duration; cardio sessions use summed minutes. |
| Current weight | The latest weigh-in, falling back to the profile weight |
| Weight change | Latest weigh-in minus the profile start weight (or the first weigh-in). The Progress screen also shows the 30-day change. |
| Consistency streak | Consecutive days with a session, ending today or yesterday |
| Strength improvement | First logged e1RM compared with the best e1RM of the last three sessions, per exercise |
| Goal completion % | Per goal: current ÷ target. Body-weight and lift goals measure from their baseline. Overall: the mean across active goals. |
| BMI / maintenance kcal | BMI = kg/m². Mifflin–St Jeor resting energy × activity factor (1.2–1.9). |

**Exports**

- **Excel (.xlsx):** six sheets (Sessions, Strength sets, Cardio, Personal records, Body weight, Goals), with typed dates and numbers and a frozen header row.
- **PDF:** a report with profile, summary, volume by muscle, PRs, goals, body weight and the workout log, with page numbers.
- **CSV:** one row per set or cardio entry, UTF-8 with a BOM. It round-trips through import.

All three accept an optional date range.

---

## 7. Component structure

```
App (IconContext → DataProvider → HashRouter)
├─ pages/  Dashboard · LogHub · Editor · CalendarPage · History · Progress
│          ProfilePage · GoalsPage · ExercisesPage · SettingsPage
├─ components/
│  ├─ ui.tsx            Card (reveal), Stat, Tag, IconBadge, Button, Chip, Sheet, Field, Progress, NumberInput, PageHeader, Empty
│  ├─ charts.tsx        ChartCard, TrendBars, TrendLine, RankBars (theme-aware palette)
│  ├─ ExercisePicker.tsx useExerciseSearch (ranked search + filters), ExercisePicker, ExerciseAutocomplete, CardioPicker, FilterRow, FavStar
│  ├─ SessionCard.tsx
│  └─ BottomNav.tsx
├─ hooks/useData.ts     single source of truth + derived library/cardio groups
└─ lib/                 stats · goals · body · export · csv · date · theme · reveal · demo
```

---

## 8. PWA strategy

| Concern | Implementation |
|---|---|
| Install (Android) | Generated manifest: standalone display, 192/512 and maskable icons, theme colours |
| Install (iPhone) | apple-touch-icon, `apple-mobile-web-app-*` meta tags, safe-area padding |
| Offline | Workbox precaches JS, CSS, HTML, icons and Latin `woff2` fonts. Non-Latin font subsets and `.woff` duplicates are excluded. |
| Updates | `autoUpdate`: the new version applies on next launch |
| Durability | `navigator.storage.persist()` is requested, plus JSON backups |
| Performance | Separate chunks for `react` and `charts`. Exporters are lazy. The theme is applied before first paint. |

---

## 9. Source tree

```
gym_diary/
├─ index.html · vite.config.ts · tailwind.config.js · tsconfig.json · package.json
├─ public/icons/            favicon.svg + PNGs (npm run icons)
├─ scripts/make-icons.mjs
├─ docs/ARCHITECTURE.md · docs/schema.sql
└─ src/
   ├─ main.tsx · App.tsx · index.css · types.ts
   ├─ data/exercises.ts     muscle groups and your exercise library
   ├─ data/cardio.ts        cardio categories and activities
   ├─ data/muscles.ts       18 heat-map regions + muscles/equipment for every exercise
   ├─ data/templateCatalog.ts  exercise pools per equipment + the 36 template definitions
   ├─ db/db.ts              IndexedDB v2 schema, repository, migration, backup
   ├─ hooks/useData.ts
   ├─ lib/                  stats, goals, body, export, csv, date, theme, reveal, demo, water, anim
   ├─ lib/heatmap.ts        muscle load (weight × reps, primary 100 % / secondary 50 %), colour scale
   ├─ lib/templates.ts      template generator (level, goal, equipment) + recommendations
   ├─ components/           ui, charts, ExercisePicker, SessionCard, BottomNav, BodyMap, HeatMapViews, TemplateViews
   └─ pages/                10 screens
```

---

## 9b. Muscle heat map and template library

**Heat map.** Each exercise has primary and secondary muscles (`data/muscles.ts`, 18 regions). A set's load is
`reps × (weight + body weight × factor)`; the factor only applies to bodyweight moves (push-ups 0.65, pull-ups/dips 1,
plank 0.05). Primary muscles get 100 % of the load, secondary 50 %. Intensity = load ÷ the most-loaded region. The
dashboard uses a blue → yellow → orange → red scale (blue rather than green so it works for red-green colour
blindness); workout details use one colour (darker = more involvement). Untrained muscles are grey. If nothing in the
range has a weight (all 0 kg) the map counts sets instead. Tapping a muscle lists every library exercise that trains it
(main mover / also works it, with an equipment filter, exercises you already do first) with a one-tap Log link.

**Custom exercises** store the muscles the user picks (`primary`, `secondary`, `equipment` on the `exercises` row,
included in backups). The data provider registers them with `setCustomMeta`, so `exerciseMeta()` treats them like
built-ins everywhere (heat map, details, exercise library). Older custom exercises without muscles fall back to their
muscle group and can be edited from the Exercise library.

**Templates.** `data/templateCatalog.ts` holds 13 exercise pools (chest, back, rear delts, … core) each in Machine /
Free weights / Mixed order, and 36 definitions (7 classic, 11 single, 10 two-muscle, 8 three-muscle) as weighted
parts. `lib/templates.ts` builds each template on the fly for the chosen level and goal: exercise count (single 3/4/5,
others 4/5/6), seats split by part weight (D'Hondt), sets (first per muscle 3/4/5, then 2/3/4), reps from the goal,
rest 60/90/120 s, duration = sets × (45 s + rest) + 5 min. Templates ending in cardio carry a `thenCardio` block and
the save screen offers "Continue to cardio". Old `tpl-*` ids map to the Mixed classic templates. Nothing is stored:
templates are pure functions of the definition, so changing level or equipment never needs a migration. Favourites
use the key `template:<defId>`. The full list is in [TEMPLATE_CATALOG.md](TEMPLATE_CATALOG.md).

**Recommendations** score single, two-muscle and classic templates by days since each muscle was last trained and
its share of the last 7 days' sets, skipping anything trained in the last 48 h.

---

## 10. Scaling and future enhancements

**Scale.** All data is loaded into memory, which comfortably handles more than 10 years of daily training: about 4,000 sessions, a few MB, with analytics running in milliseconds. Beyond that:

- query by the `by-date` index for range screens
- virtualise long lists
- move analytics into a Web Worker

**Optional sync.** Stand up `schema.sql` on Postgres (for example Supabase). Add `updatedAt`-based last-write-wins sync per store, keeping the device as the source of truth. Ids are already UUIDs, so rows from different devices never collide.

**Done in v4:** rest timer, set types (warm-up / drop / to failure), supersets, progressive-overload
suggestions, plate calculator, weekly sets per muscle, a yearly activity grid, and a shorter Home with
the detailed charts moved into Progress tabs (`lib/training.ts`, `components/WorkoutTools.tsx`,
`components/ProgressViews.tsx`, `components/TrainingCharts.tsx`). Set types and supersets are optional
fields on the stored rows (`sets[].type`, `superset`), so no database migration was needed; CSV gains
`set_type` and `superset` columns and still imports older files.

**Feature ideas**

- RPE per set.
- A PR celebration when a record is beaten during logging.
- Progress photos stored as blobs in IndexedDB.
- Import from Strong or Hevy exports.
- Apple Health and Google Fit through a Capacitor wrapper.
- Unit tests for `lib/` with Vitest, and Playwright smoke tests in CI.
