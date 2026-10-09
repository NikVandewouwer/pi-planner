# PI Planner

Plan SAFe Program Increments with real team availability: who is available on which day, what velocity that gives each team per platform, how many story points you can commit to, and which sprint each feature lands in.

With a Supabase project configured, trains are stored in Supabase and shared with everyone who opens the app: there is no sign-in yet, so don't store anything sensitive. Changes from others show up live. Without Supabase, everything is stored in the browser (`localStorage`). Use **Menu → Data → Export / Import** to back up or move data.

## Develop

```sh
npm install
cp .env.example .env.local   # optional: Supabase project for shared data; leave out to run local-only
npm run dev        # http://localhost:5173
npm test           # unit tests (domain logic)
npm run lint
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

In VS Code, the same commands are available under **Terminal → Run Task** (`build` is the default build task, ⇧⌘B).

## Project layout

```
src/
  domain/        pure, framework-free logic (unit tested)
    types.ts       data model
    util.ts        dates, sprints, number helpers
    model.ts       availability, planning days, velocity, forecast
    plan.ts        sprint board scheduler (buildPlan)
    grid.ts        availability grid filters
    migrate.ts     upgrades any stored data shape to the current one
    sync.ts        splits data into per-train documents for the database
  state/         zustand + immer store, persistence, actions
    cloud.ts       Supabase sync
  components/    React views (Availability, Planning, Wizard, Shell, forms)
  styles.css     the original stylesheet, unchanged apart from one dead rule
legacy/          the original single-file version, kept for reference
supabase/        database schema (migrations)
```

## Deploy

Vercel builds and deploys the app: production from `main`, and a preview for every pull request. GitHub Actions (`.github/workflows/ci.yml`) runs lint, tests and build on every push and pull request.

### One-time setup

**Supabase**

1. Create a project at [supabase.com](https://supabase.com).
2. Run the files in `supabase/migrations/` in order in **SQL Editor** (or `supabase link` + `supabase db push` with the Supabase CLI).
3. **Project Settings → API**: copy the project URL and the publishable key.

**Vercel**

1. **Add New → Project**, import this GitHub repository. `vercel.json` sets the build.
2. **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview, then redeploy.

The publishable key ends up in the browser. With sign-in removed, anyone who has it can read and change every train.

Builds without these variables still work, but stay local-only.

### Changing the schema

Add a new file under `supabase/migrations/` and run it in Supabase. The train contents are jsonb that the app runs through `migrate`, so changes to `src/domain/types.ts` don't need a SQL migration.

## Releasing

The version in `package.json` is shown in the app footer, next to the commit the build came from. Bump it with [SemVer](https://semver.org) when you ship to `main`:

```sh
npm run release:patch   # 1.2.3 -> 1.2.4  bug fixes
npm run release:minor   # 1.2.3 -> 1.3.0  new features, backwards compatible
npm run release:major   # 1.2.3 -> 2.0.0  breaking changes (e.g. data that older versions can't read)
```

Each command runs lint and tests, bumps the version, commits "Release vX.Y.Z", tags it `vX.Y.Z` and pushes to `main`, which deploys. Commit your changes first: it refuses to run with uncommitted changes. In VS Code: **Terminal → Run Task → release …**.

## Moving data from the old single-file version

The old `PI Planner.html` has no export button. Open it in the browser where your data lives, open the developer console and run:

```js
copy(localStorage.getItem("art-pi-planner:v1"))
```

Paste the result into a file such as `pi-planner.json`, then use **Menu → Data → Import** in the new app. Older data formats are upgraded automatically.
