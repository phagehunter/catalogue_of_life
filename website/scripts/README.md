# Data processing script

`process_data.py` reads the Catalogue of Life TSV dump and emits the static
JSON tree the React frontend consumes.

It is invoked automatically by `.github/workflows/build.yml` — you should
never need to run it locally unless you're debugging.

## What it produces

```
frontend/public/data/
├── stats.json              # totals, rank breakdown, generation timestamp
├── roots.json              # the small list of top-level groups (kingdoms)
├── taxa/
│   ├── 0.json              # all taxa whose ID hashes to bucket 0
│   ├── 1.json
│   ├── ... (1024 files)
│   └── 1023.json
└── search/
    ├── manifest.json       # list of available 2-char prefix shards
    ├── aa.json
    ├── ab.json
    └── ...                 # one shard per 2-char prefix that exists
```

## CLI

```bash
python process_data.py \
  --input /path/to/folder/with/tsv/files \
  --output frontend/public/data \
  [--limit 50000]    # cap rows per file for fast iteration
  [--keep-db]        # keep the scratch SQLite DB after a run
```

## Memory

Peak RAM during the full Catalogue of Life build is roughly:

- ~120 MB Python heap (mostly the CSV reader + small temporary lists)
- ~80 MB SQLite page cache (configurable via `PRAGMA cache_size`)

The whole pipeline finishes well within the 7 GB allowance of a standard
GitHub-hosted Linux runner.
