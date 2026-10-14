# Catalogue of Life Explorer — how it works

A static React site for the Catalogue of Life. Data processing happens once,
in a GitHub Action; the published site is plain files on GitHub Pages.

## Architecture

```
Catalogue of Life ColDP download        (NameUsage, VernacularName, Distribution, metadata.yaml)
        │  upload to a GitHub Release (tag e.g. data-v1)
        ▼
GitHub Action  .github/workflows/deploy.yml
   1. gh release download
   2. python scripts/process_data.py      TSV → SQLite scratch → ~50 000 JSON files
   3. npm ci && npm test && npm run build Vite + React
   4. push website/frontend/dist to gh-pages (orphan commit)
        ▼
https://<user>.github.io/<repo>/          HTML + JS + data/ (about 2 GB, fetched a few files at a time)
```

The data format is documented in `scripts/README.md`. In short: one small
core shard per taxon, a `higher/` shard that carries a taxon's full ancestry,
`detail/` for common names and distribution, `kids/` for paged children and
synonyms, and an adaptive prefix index for search that is never truncated.
A species page costs three or four fetches of 50–350 KB each.

## Frontend

`frontend/src/`

| Path | Purpose |
| --- | --- |
| `data/hash.js` | djb2 shard hash and search-key normaliser, identical to the Python side |
| `data/api.js` | fetch layer with caching and retry; records, lineage, children, search |
| `data/labels.js` | status wording, language names, rank helpers |
| `components/SearchBox.jsx` | ARIA combobox used by the header, home page and Compare |
| `components/*` | cards, pills, breadcrumbs, pager, skeletons, theme toggle, error boundary |
| `pages/Home.jsx` | search, dataset numbers, top-level groups, species-by-kingdom chart |
| `pages/Explore.jsx` | expandable tree from the domains down |
| `pages/Taxon.jsx` | record page: classification, names, distribution, children and synonyms |
| `pages/Compare.jsx` | shared-classification comparison of two to six organisms |
| `pages/SearchResults.jsx`, `About.jsx`, `NotFound.jsx` | |
| `styles/tokens.css` | light and dark design tokens |
| `styles/app.css` | all component styles |

Routing uses clean URLs (`/taxon/4CGXQ`). `scripts/postbuild.mjs` copies
`index.html` to `404.html` so GitHub Pages serves the app for any path, and
`main.jsx` redirects old `#/taxon/…` links.

Accessibility: every text/background pair in the tokens meets WCAG 2.2 AA,
keyboard focus is always visible, the search box follows the combobox
pattern, motion respects `prefers-reduced-motion`, and the theme follows the
OS until the visitor picks one.

## Local development

You need Node 20.19+ (22 recommended) and Python 3.10+.

```bash
# 1. Build a dataset. Either a realistic subset (recommended, a few minutes) …
python3 scripts/process_data.py --input /path/to/coldp --output frontend/public/data --subtree 3W7,623RM
#    … or the full dataset (about 6 minutes and 2 GB on a laptop):
python3 scripts/process_data.py --input /path/to/coldp --output frontend/public/data

# 2. Run the site
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # production build in dist/
```

`/path/to/coldp` is the unzipped Catalogue of Life download, or a folder with
`NameUsage_part_*` split parts (they are streamed, never reassembled).

## Deploying your own copy

1. Fork or push this repository to a public GitHub repo.
2. Settings → Pages → Source: *Deploy from a branch* → `gh-pages` / root
   (the branch appears after the first successful run).
3. Download the ColDP export from https://www.catalogueoflife.org/data/download.
   `NameUsage.tsv` is larger than the 2 GB Release asset limit, so split it:
   `split -b 1500m NameUsage.tsv NameUsage_part_`.
4. Create a Release (tag `data-v1`) and attach `NameUsage_part_aa`,
   `NameUsage_part_ab`, `VernacularName.tsv`, `Distribution.tsv` and
   `metadata.yaml`. Publishing the release starts the build.
5. Watch the Actions tab. A full build takes roughly 20–40 minutes on a
   GitHub runner; frontend-only re-runs (Actions → *Build and deploy site* →
   *Run workflow* with the same tag) reuse the cached data and take 2–3 minutes.

Updating to a newer Catalogue of Life release: repeat step 4 with a new tag.

Troubleshooting:

| Symptom | Cause |
| --- | --- |
| "no NameUsage.tsv or NameUsage_part_* assets" | asset names on the release don't match (case-sensitive) |
| Site shows "The dataset could not be loaded" | the data step failed, or Pages is not set to `gh-pages`; check the Actions log |
| Blank page after deploy | hard-refresh; confirm Pages source |

## Licence

Code: MIT (see `../LICENSE`). Data: Catalogue of Life, CC BY 4.0. Cite the
release shown in the site footer (title, version, DOI).
