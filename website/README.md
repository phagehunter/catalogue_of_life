# Catalogue of Life — Static Explorer

A fast, fully-static React site that lets anyone browse and search the
[Catalogue of Life](https://www.catalogueoflife.org/) — every named species
on Earth — straight from a free GitHub Pages deployment.

> **🧭 New here?** Read [`GUIDE.md`](./GUIDE.md). It's a click-by-click
> walk-through that needs zero command-line knowledge.

---

## Architecture

```
   ┌──────────────────────┐    upload via browser
   │  Catalogue of Life   │  ─────────────────────────►  GitHub Release "data-v1"
   │  raw .tsv dump       │                              (NameUsage.tsv,
   └──────────────────────┘                               VernacularName.tsv,
                                                          Distribution.tsv)
                                                                │
                                                                ▼
                                          ┌────────────────────────────────────┐
                                          │  GitHub Actions (build.yml)        │
                                          │   1. gh release download            │
                                          │   2. python scripts/process_data.py │
                                          │      streams TSV → SQLite → JSON    │
                                          │   3. Vite build (React frontend)    │
                                          │   4. actions/deploy-pages           │
                                          └────────────────────────────────────┘
                                                                │
                                                                ▼
                                                  ┌────────────────────────────┐
                                                  │  https://you.github.io/…/  │
                                                  │   ➜ HTML + JS + 1024 shards │
                                                  │   ➜ search index by prefix  │
                                                  └────────────────────────────┘
```

### Why sharded JSON instead of an API?

A 2.4 GB TSV is too big to load in a browser. A traditional API requires a
server — and we want this to be free, immortal, and trivially forkable.
The processor splits all ~5 million records into **1024 hash buckets**.
The browser computes the bucket for any clicked ID using the same
`djb2` hash and fetches a single ~500 KB file. Once cached, that bucket
serves every taxon it contains for the rest of the session.

Search uses the same trick, sharded by the first two characters of the
lowercased name (so `ho.json` holds everything starting with "ho").

Result: cold-start renders in well under a second; subsequent navigation
is essentially instant.

---

## File map

| Path | Purpose |
| --- | --- |
| `frontend/`                       | Vite + React app (HashRouter, no SSR). |
| `frontend/src/api.js`             | Client-side data layer (sharding, search, lineage walk). |
| `frontend/src/pages/*.jsx`        | Home, Explore, Search, Taxon, About. |
| `frontend/src/components/*.jsx`   | Breadcrumbs, taxon cards, global search bar. |
| `scripts/process_data.py`         | Streams the TSVs through SQLite, emits sharded JSON. |
| `.github/workflows/deploy.yml`    | Triggers on Release publish: download → process → build → push to `gh-pages`. |
| `GUIDE.md`                        | Click-by-click setup guide for non-coders. |

---

## Local development (optional, for tinkerers)

You don't need this to deploy — the GitHub Action does everything — but if
you want to preview locally:

```bash
# 1. Generate a small dataset (subset for speed). Run from the repo root.
python3 scripts/process_data.py \
  --input "/path/to/folder/with/the/tsv/files" \
  --output frontend/public/data \
  --limit 50000

# 2. Start the dev server.
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

---

## Tuning knobs

Most decisions live as constants at the top of `scripts/process_data.py`:

```python
NUM_SHARDS = 1024                  # taxa & search shards
INSERT_BATCH = 20000               # SQLite write batching
MAX_VERNACULARS_PER_TAXON = 8      # commons-name cap per record
MAX_DISTRIBUTION_PER_TAXON = 30    # distribution-row cap per record
```

If you change `NUM_SHARDS`, change the matching constant in
`frontend/src/api.js` — the hash must produce the same bucket on both
sides.

---

## Licence

Code: MIT. Data: CC BY 4.0 (Catalogue of Life consortium).
