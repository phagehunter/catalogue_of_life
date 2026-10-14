# Data processing: `process_data.py` (schema v2)

Turns a Catalogue of Life ColDP export into the static JSON the site serves.
Everything streams through an on-disk SQLite scratch database; peak Python
memory is a few hundred MB regardless of dataset size.

## Inputs (from the ColDP download, uploaded to a GitHub Release)

| File | Used for |
| --- | --- |
| `NameUsage.tsv` or `NameUsage_part_*` | every name usage (accepted taxa, synonyms, BOLD BINs). Split parts are streamed in order; nothing is reassembled on disk |
| `VernacularName.tsv` | common names, language, preferred flag |
| `Distribution.tsv` | areas (text or `areaID` + gazetteer), establishment means, threat status |
| `metadata.yaml` | dataset title, alias, version, issue date, DOI for the citation |

## Output layout

```
data/
├── meta.json             citation, counts, roots, rank/status tables, link prefixes
├── taxa/<n>.json         4096 shards: core record per ID (name, rank, status, parent, counts)
├── higher/<n>.json       512 shards: accepted supra-specific taxa with full ancestor chain
├── detail/<n>.json       4096 shards: vernaculars + distribution per ID
├── kids/<n>.json         1024 shards hashed on the PARENT id: first page of children
├── kids/p/<id>-c<k>.json overflow pages of accepted children (120 per page)
├── kids/p/<id>-s<k>.json overflow pages of synonyms
├── search/manifest.json  prefix → "f" (full shard) or "s" (summary shard)
└── search/<prefix>.json  entries [id, name, rankCode|lang, kind, matchedWord?]
```

Shard = `djb2(id) mod N` over UTF-16 code units; `frontend/src/data/hash.js`
has the identical function and `tests/test_process_data.py` checks parity
against Node.

Why this shape: a species page needs the core shard of the taxon (one
fetch), the `higher` shard of its genus for the breadcrumb (one fetch),
the `kids` shard for children (one fetch) and `detail` for names and
distribution (one fetch). The previous schema walked the tree and fetched
one ~2 MB shard per ancestor and per child bucket.

Search is an adaptive prefix trie: a prefix with up to 6 000 entries gets
one full shard; a busier prefix gets a summary shard (its top 1 500 entries
by priority, plus every exact-key entry) and is split one character deeper.
Nothing is truncated. Entries exist for scientific names (accepted,
provisional, synonym), species epithets ("tigris" finds *Panthera tigris*),
vernacular names, and the inner words of English vernaculars. BOLD BINs are
excluded unless `--include-bins` is given.

## CLI

```bash
python3 scripts/process_data.py --input <dir> --output frontend/public/data \
    [--limit N]            # first N rows per file: fast smoke test, tree is incomplete
    [--subtree ID,ID]      # keep these taxa + descendants + ancestors: realistic dev subset
    [--exclude-bins]       # drop BOLD barcode clusters entirely
    [--include-bins]       # also index BINs in search
    [--keep-db]            # keep the scratch SQLite file next to the output folder
```

For local development with the full dump in a folder:

```bash
python3 scripts/process_data.py --input /path/to/coldp --output frontend/public/data --subtree 3W7,623RM
```

(`3W7` = Primates, `623RM` = Felidae; about 20 000 name usages with their
full ancestry, built in a few minutes.)

## Tests

```bash
cd scripts && python3 -m unittest tests/test_process_data.py
```

The end-to-end test builds a tiny synthetic ColDP export and checks counts,
chains, child paging, vernacular ordering, distribution fallback, link
dictionary encoding and search ranking.

## Tuning

Constants at the top of the script: `CORE_SHARDS`, `HIGHER_SHARDS`,
`KIDS_SHARDS`, `KIDS_PAGE`, `MAX_VERNACULARS`, `MAX_DISTRIBUTION`,
`SEARCH_SHARD_LIMIT`, `SEARCH_SUMMARY_LIMIT`. Shard counts and the page
size are written into `meta.json` and read by the frontend, so changing them
here is enough.
