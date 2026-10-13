# Gym Diary: Personal Fitness Tracker

Gym Diary is a private gym and cardio diary for one person. It works offline, has no login, and keeps every record on your phone. Strength workouts and cardio are logged separately. You can back-date workouts you forgot to log, browse them on a calendar, and see dashboards, streaks and personal records.

> Built with React, TypeScript, Tailwind CSS, IndexedDB, Recharts, and an installable PWA.
> The full design (architecture, database design, screens, wireframes, data model, components, PWA strategy and roadmap) is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**, and the normalised SQL schema is in **[docs/schema.sql](docs/schema.sql)**.

## Features

- **Fast logging.** Type a few letters to add an exercise, or browse by muscle group. "Add set" copies the previous set, and every exercise pre-fills from last time. You can record workout duration.
- **In-workout tools.** Tick a set off to start a rest timer (it beeps and vibrates when rest is over; ±15 s, remembered). Tap a set number to mark it as a warm-up, drop set or set to failure; warm-ups don't count towards volume, records or weekly sets. A "Try today" suggestion adds a rep or, once you hit the top of your rep range on every set, a little weight. A plate calculator on barbell exercises shows what to load on each side. Link exercises into supersets (no rest between them, rest after the round).
- **Body-weight and timed exercises.** Push-ups, pull-ups, leg raises and other bodyweight moves count your body weight (the share each exercise moves, e.g. 65% for push-ups) in volume, with the weight field used for extra load like a vest. Planks, wall sits, dead hangs and other holds are logged in seconds, with a hold timer that counts down and beeps. Both are switches on every exercise, and the app remembers your choice next time.
- **Back-dating.** Choose any past date on the Log screen, or tap a day on the Calendar.
- **Your exercise library.** 250+ exercises covering every muscle on the heat map (machine, free-weight and bodyweight options), in twelve muscle groups with a combined Legs filter. Add custom exercises and pick exactly which muscles they work (main and helper). Search, filters, favourites, and per-exercise history and records.
- **Cardio.** Forty activities in 11 types (Running, Walking, Cycling, Swimming, HIIT, Sports and more) plus custom ones. Duration is required. Distance, calories and average heart rate are optional.
- **Profile.** Name, height, weight, age, gender, fitness goal and activity level, with BMI and estimated maintenance calories. A body-weight log with a trend chart.
- **Water tracker.** A Water button next to Strength and Cardio: one-tap glass, bottle and large sizes, custom amounts, undo, back-dating, and edit or delete. Your daily target is set in Profile (or suggested from your weight), with extra water added on workout days. An animated ring on Home and a 7/30-day chart, streak and average on Progress.
- **Goals.** Workouts per week, cardio minutes, active days, body weight, lift targets and total volume, each with a live completion %.
- **Dashboard.** Today, week and month, totals, current weight and weight change, average duration, and volume by week, month, day, muscle and year. PRs and weight progression. Cardio by type and activity, distance and calories trends.
- **Progress.** Three tabs. Overview: a year-long activity grid (tap a day to open it), active days, body weight, goals, hydration and annual totals. Strength: weekly sets per muscle against a target for your level, volume charts, consistency streak, body-weight trend, exercise progression, strength improvement, strongest lifts, muscle frequency, personal bests and goal completion.
- **Muscle heat map.** See which muscles you've trained (last workout, 7 days, 30 days or all time) on a front/back body map, with a ranked list of weight and % per muscle. Tap a muscle to see every exercise that trains it (main mover or helper, filter by equipment) and log one in a tap. Tap any past workout for a details screen with its own map.
- **108 one-tap templates.** 36 workouts (classic splits, single, two and three muscle) each in Machine, Free weights and Mixed versions. Sets, reps and rest follow your level and goal from Profile, weights pre-fill from last time, and "Recommended for you" suggests muscles you haven't trained this week. You can still save your own. Full list: [docs/TEMPLATE_CATALOG.md](docs/TEMPLATE_CATALOG.md).
- **Export.** Excel (.xlsx, six sheets), a PDF report and CSV, all with an optional date range. JSON backup and restore.
- **Dark and light themes**, or follow the phone's setting. Works on phone, tablet and desktop.

## Use it on your phone

The app is a website that installs like an app. It must be hosted somewhere once, and after that it runs offline.

**Option A: GitHub Pages (free, automatic)**
1. Merge this branch into `main`.
2. On GitHub, open the repo's **Settings → Pages**, then under *Build and deployment* set **Source = GitHub Actions**.
3. The workflow `.github/workflows/deploy-gym-diary.yml` builds and publishes the app. Your link appears on the Actions run, usually `https://<your-username>.github.io/<repo-name>/`.
   *(GitHub Pages on a private repo needs a paid GitHub plan. If you don't have one, use option B.)*

**Option B: Netlify Drop (free, drag-and-drop)**
1. On a computer: `cd gym_diary && npm install && npm run build`
2. Drag the `dist` folder onto <https://app.netlify.com/drop>. You get a link.

**Then install it:**
- **Android (Chrome):** open the link, tap **⋮ → Install app**.
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.

Want to explore first? Go to **Settings (gear icon on Home) → Load sample data**, look around, then **Erase all data** when you're ready to start for real.

> **Important:** your workouts live only on that phone. Use **Settings → Full backup** every few weeks and save the file to Google Drive or iCloud.

## For developers

```bash
cd gym_diary
npm install
npm run dev        # http://localhost:5173 (also on your LAN for phone testing)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active)
npm run icons      # regenerate PNG icons from public/icons/favicon.svg (needs Playwright)
```
