# housesteady-builder

The binder builder. Turns a HouseSteady Field visit into the Home Binder and its reports.

**Read `CLAUDE.md` first** — it explains what this is for and what the rules are. The
current task lives in a dated build spec under `/docs`.

## Running it

You need [Node](https://nodejs.org) 20 or newer. Once, to install:

```
npm install
```

Then, every time:

```
npm run dev
```

That starts both halves — the part that stores things and the part you look at. Open
**http://localhost:5173** in a browser.

To check everything still works:

```
npm test
```

## What you can do today (Increment 1 — import)

1. **Add a property.** A house. Give it a label and, ideally, its address.
2. **Add a visit** to that property — baseline, monthly, or other.
3. **Import the export** from the field app. Either pick a `manifest.json` file, or click
   *Import the reference export* to load the sample in `/fixtures/reference` straight from
   disk.
4. **Read the import report.** What arrived, what is odd about it, and what the builder
   checked.

Photos are not handled yet, so an import today is manifest-only: every file is listed and
accounted for, but the images themselves are not copied and no checksum is verified. The
report says so plainly rather than implying a complete import.

## Where things are

```
/server     the API, the database, and the importer
/web        the screens
/docs       the specs, the manifest contract, the design decisions
/fixtures   the real reference export from the field app
/prompts    versioned prompt config (empty — no AI yet, by design)
/data       your actual data. Gitignored. Never committed.
```

Everything lives in `/data` — one SQLite file and a folder per property. **Back it up.**
That is an operating discipline, not an optional extra: there is no server holding a copy.
