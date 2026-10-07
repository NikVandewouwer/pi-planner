# PI Planner

Plan SAFe Program Increments with real team availability: who is available on which day, what velocity that gives each team per platform, how many story points you can commit to, and which sprint each feature lands in.

Everything is stored in the browser (`localStorage`). Use **Menu → Data → Export / Import** to back up or move data.

## Develop

```sh
npm install
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
  state/         zustand + immer store, persistence, actions
  components/    React views (Availability, Planning, Wizard, Shell, forms)
  styles.css     the original stylesheet, unchanged apart from one dead rule
legacy/          the original single-file version, kept for reference
```

## Deploy

Every push to `main` runs lint, tests and build in GitHub Actions and publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`). Pull requests run the same checks without deploying.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

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
