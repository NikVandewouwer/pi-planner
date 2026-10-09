# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PI Planner is a React 19 + TypeScript + Vite app for planning SAFe Program Increments from real team availability. It has no server code of its own. When a Supabase project is configured, trains are stored there and shared with everyone who opens the app (no sign-in for now), and `localStorage` acts as a cache. Without one, all data lives in the browser's `localStorage`.

## Commands

```sh
npm run dev          # Vite dev server, http://localhost:5173
npm test             # vitest run (domain unit tests)
npx vitest run -t "name"   # run a single test (or describe block) by name
npm run lint         # oxlint
npm run typecheck    # tsc -b
npm run build        # tsc -b && vite build → dist/
```

CI (`.github/workflows/ci.yml`) runs lint, test and build on every push/PR. Vercel deploys production from `main` and a preview per PR (`vercel.json`). Supabase is configured through `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Without them the app runs local-only. `npm run release:patch|minor|major` runs lint + tests, bumps the version, commits "Release vX.Y.Z", tags and pushes (which deploys). It refuses to run with a dirty tree. A breaking change to stored data warrants a major bump.

## Architecture

Three layers under `src/`:

- **`domain/`** is pure, framework-free logic. Keep React and store imports out of it. `domain.test.ts` is the only test file. It runs in Node with no DOM, so there are no component tests. It also tests the `Art`-level platform functions in `state/actions.ts`, which pulls in `store.ts`. The store reads `localStorage` when the module loads, so keep that access inside its `try/catch`.
  - `types.ts` is the data model: `Data` (persisted: `arts`, `avail`, current `artId`/`piId`, `done` flag) and `UI` (view state, also persisted apart from `modal`/`menu`).
  - `model.ts` holds the `Model` class, a read-only view over one ART plus the availability map. It covers availability lookups, planning days, velocity, forecasts and platform/estimate mapping. Construct it with `new Model(art, avail)`; in components use the `useModel()` hook.
  - `plan.ts` has `buildPlan`, a greedy sprint scheduler that places features by status priority (Committed, Uncommitted, New) on per-member, per-sprint capacity.
  - `migrate.ts` upgrades **any** data shape ever stored (including the legacy single-file app in `legacy/`) to the current one. Input is untrusted JSON. When you change `types.ts` in a way that affects stored data, add the upgrade step here. Don't bump `STORAGE_KEY`. `migrate` runs on every load and import, so each step must be idempotent. A conversion that isn't naturally idempotent sets a marker field once it is done (`PI.velUnit = 'md'`, `Feature.wtU = 'pct'`) and skips data that already has it. Add a `migrate` test case for each new step.
  - `sync.ts` splits `Data` into per-train documents (`Art` + its members' `avail`) for the database, hashes them to detect changes, and merges remote ones back. It is pure and tested.
- **`state/`** is one zustand store with immer middleware (`store.ts`). All mutations go through `update(recipe)`, which runs an immer recipe on `{ S, ui }` and then re-applies invariants (`normalize`: an ART always exists after setup, `piId` and `ui.team` stay valid). A store subscription persists every change to `localStorage`. `actions.ts` holds named mutations (modals, painting availability, platform add/rename/link). Some of these are plain functions on an `Art` so tests can call them directly.
  - `cloud.ts` syncs with Supabase and is started from `main.tsx`. Components never talk to Supabase directly: they mutate the store as usual, and `cloud.ts` watches it and pushes each changed train with the row `version` it was based on (optimistic locking). When someone else saved first, their version wins and a notice is shown. Remote changes arrive through realtime and on window focus. Deleting a train deletes the row for everyone. The train in the wizard (`draftId`) isn't pushed until the wizard finishes. Keep `store.ts` free of Supabase imports so tests stay in Node.
- **`supabase/migrations/`** holds the SQL schema: `trains` (one row per train, `art` and `avail` as jsonb), open to anonymous visitors. The first migration also had per-train members and email sharing, which the second one removed until sign-in comes back. Train contents go through `migrate` on read, so `types.ts` changes need no SQL. Only schema changes do, in a new migration file.
- **`components/`** holds the React views. `App.tsx` switches between the first-run `Wizard` (`!S.done` or `ui.wizard`) and the main view (Availability / Planning tabs, the settings modal, and `ModalView`). Modals are driven by the `ui.modal` discriminated union in `types.ts`, not by router state.

### Domain concepts that aren't obvious

- **ART** (Agile Release Train) contains teams, PIs, roles, feature types and platforms. Several ARTs can exist; `S.artId` selects one.
- **Platforms vs. estimates**: each `PlatformDef` has an internal `est` key. Platforms that share an `est` (default: iOS + Android → "Mobile") are estimated together, and each builds the whole ticket in parallel. Feature points (`pts`, `del`) are keyed by estimate and velocities by platform. The UI never shows the `est` key; it shows `estLabel` (e.g. "iOS + Android").
- **Roles** are referenced by **name** from members, not by id, to match the original data format. Only `planned` roles count towards velocity. A role spanning several platforms has its days split evenly across them.
- **Availability** is `avail[memberId][isoDate]`, one of `VALS` (1, .75, .5, .25, 0). A missing entry means 1. Dates are ISO strings interpreted as UTC.
- Velocity is story points per 100 planning days.

## Conventions

- `src/styles.css` is the original stylesheet carried over from the legacy app. Theming uses `data-theme` / `data-palette` attributes on `<html>`.
- `__APP_VERSION__`, `__APP_COMMIT__` and `__APP_REPO__` are build-time globals injected by `vite.config.ts` (declared in `globals.d.ts`).
- Vite `base` is `./` so the build works under any sub-path (GitHub Pages).
- TypeScript runs in strict mode with `noUnusedLocals`/`noUnusedParameters` and `erasableSyntaxOnly`, so don't use enums or parameter properties.

## UI copy

All user-facing text (titles, labels, buttons, tooltips, help, errors, confirmations) follows these rules so the app reads as one professional product. Check new or changed copy against them.

- **Tone**: calm, plain and concise. Use sentence case everywhere. No exclamation marks, no "please", no "you can".
- **Terms**: "train" and "PI" in all UI text. Write out "Agile Release Train" and "Program Increment (PI)" only where the concept is introduced (the first wizard step and the empty PI state). Use "story points" in prose and "SP" next to numbers. Never show the internal estimate key; platforms estimated together are shown as "iOS + Android" or described as "estimated together".
- **Buttons and CTAs**: a single verb, with context coming from the title or section around it. Use Add, Edit, Save, Delete, Remove, Reset, Cancel, Done, Back, Continue, Finish, Skip, Clear, Import, Export or Replace. Don't write "Add member" or "Delete this train". Delete destroys stored data; Remove takes an item out of the current selection (chips, badges). A count may follow the verb when several items are added at once ("Add 3"). Add a short qualifier only when the verb alone would be unclear ("Split evenly").
- **Titles**: "New feature" or "Edit team" for forms, "Delete Vega?" or "Reset Vega?" for confirmations, and short nouns for sections ("Days off", "Velocity").
- **Explanations**: one to three short sentences of prose that say what the feature does. No bullet points or lists. Put details in an info icon tooltip (`<Info text=… />`) next to the label they explain, rather than in always-visible help text. A screen or wizard step gets at most one short `.help` sentence.
- **Confirmations**: one sentence on what else is affected, then "This can't be undone." when it is final (see `askText.ts`).
- **Errors**: a short imperative sentence, such as "Enter a name." or "Pick at least one platform."
- **Empty states**: "No features yet.", optionally followed by a single action button.
- **Placeholders**: an example, written as "e.g. Vega".
- **Icon buttons**: a one-word `title` ("Edit", "Delete", "Reset"). The `aria-label` may name the object ("Delete Vega") for screen readers.
