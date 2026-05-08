"""
Catalogue of Life — Static Data Processor
==========================================

Reads the raw TSV files from the Catalogue of Life data package and emits a
sharded, static, gzippable JSON tree that the React frontend consumes.

Design goals:
  1. Stream every TSV with the stdlib ``csv`` module so memory stays small.
  2. Use an on-disk SQLite database as scratch space (paged, ~tens of MB RAM).
  3. Emit "sharded" JSON files (1024 buckets) so the browser only pulls a
     small slice per click.
  4. Tolerate orphan records (parentID points to nothing) and missing ranks.

CLI:
    python process_data.py --input <raw_tsv_dir> --output <site_data_dir>
                           [--limit N]   # for fast smoke tests
                           [--keep-db]   # keep the scratch SQLite for inspection
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
import sqlite3
import sys
import time
from contextlib import contextmanager
from pathlib import Path

# ---------------------------------------------------------------------------
# CSV is built for ~1KB cells; CoL has long reference fields. Push the limit.
csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Number of shards for taxa / children / search index. 1024 keeps each shard
# file under ~500KB for the full Catalogue of Life (~5M records).
NUM_SHARDS = 1024

# Batch size for SQLite inserts. Larger = faster but more transient memory.
INSERT_BATCH = 20000

# Vernacular names per taxon kept in the static record. Anything beyond this
# is rare and just bloats the file size.
MAX_VERNACULARS_PER_TAXON = 8

# Distribution areas per taxon kept in the static record.
MAX_DISTRIBUTION_PER_TAXON = 30

# Lineage ranks (denormalised in NameUsage.tsv) — promoted to first-class
# fields in each emitted record so the breadcrumb works without a tree walk.
LINEAGE_RANKS = (
    "kingdom", "phylum", "class", "order", "family",
    "genus", "species",
)

# All ranks recognised by Catalogue of Life, ordered from broad to narrow.
RANK_ORDER = [
    "unranked", "domain", "superkingdom", "kingdom", "subkingdom",
    "infrakingdom", "superphylum", "phylum", "subphylum", "infraphylum",
    "parvphylum", "microphylum", "nanophylum", "claudius", "gigaclass",
    "megaclass", "superclass", "class", "subclass", "infraclass",
    "subterclass", "parvclass", "superdivision", "division", "subdivision",
    "infradivision", "superlegion", "legion", "sublegion", "infralegion",
    "supercohort", "cohort", "subcohort", "infracohort", "gigaorder",
    "magnorder", "grandorder", "mirorder", "superorder", "order",
    "nanorder", "hyporder", "minorder", "suborder", "infraorder",
    "parvorder", "supersection", "section", "subsection", "superfamily",
    "epifamily", "family", "subfamily", "infrafamily", "supertribe",
    "tribe", "subtribe", "infratribe", "suprageneric_name", "genus",
    "subgenus", "infragenus", "supersubgenus", "supersection_botany",
    "section_botany", "subsection_botany", "series", "subseries",
    "infrageneric_name", "species_aggregate", "species", "infraspecific_name",
    "grex", "subspecies", "cultivar_group", "convariety", "infrasubspecific_name",
    "proles", "natio", "aberration", "morph", "variety", "subvariety",
    "form", "subform", "pathovar", "biovar", "chemovar", "morphovar",
    "phagovar", "serovar", "chemoform", "forma_specialis", "lusus",
    "cultivar", "mutatio", "strain", "other",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    """Timestamped console log so the GitHub Actions log is readable."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


@contextmanager
def step(label: str):
    log(f">>> {label}")
    t0 = time.time()
    yield
    log(f"<<< {label} ({time.time() - t0:.1f}s)")


def shard_for(record_id: str) -> int:
    """Stable, fast hash → shard bucket. Same algorithm in Python and JS."""
    if not record_id:
        return 0
    h = 5381
    for ch in record_id:
        h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF  # h * 33 + ch
    return h % NUM_SHARDS


def normalise_search(text: str) -> str:
    """Lowercase + strip diacritics-ish + collapse whitespace.

    Pure ASCII only; we avoid the unicodedata import to keep this file lean
    and predictable. Non-ASCII is preserved (dropping diacritics would lose
    important data here)."""
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def search_prefix(text: str) -> str:
    """First two letters used to bucket the search index."""
    norm = normalise_search(text)
    if not norm:
        return "_"
    a = norm[0] if norm[0].isalnum() else "_"
    b = norm[1] if len(norm) > 1 and norm[1].isalnum() else "_"
    return a + b


def write_json(path: Path, data, *, gzip_too: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(payload, encoding="utf-8")
    if gzip_too:
        with gzip.open(path.with_suffix(path.suffix + ".gz"), "wb",
                       compresslevel=6) as gz:
            gz.write(payload.encode("utf-8"))


# ---------------------------------------------------------------------------
# TSV streamers — never load full files into memory.
# ---------------------------------------------------------------------------


def iter_tsv(path: Path, limit: int | None = None):
    """Yield each TSV row as a dict. Handles missing files gracefully."""
    if not path.exists():
        log(f"  ! {path.name} not found; skipping.")
        return
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        try:
            header = next(reader)
        except StopIteration:
            return
        # Strip the "col:" / "clb:" prefixes used in the Catalogue of Life TSVs
        cleaned = [h.split(":", 1)[-1] for h in header]
        for i, row in enumerate(reader):
            if limit is not None and i >= limit:
                return
            # Tolerate ragged rows (some lines have trailing missing columns).
            if len(row) < len(cleaned):
                row = row + [""] * (len(cleaned) - len(row))
            yield dict(zip(cleaned, row))


# ---------------------------------------------------------------------------
# Phase 1 — load TSVs into SQLite scratch DB
# ---------------------------------------------------------------------------


def init_db(db_path: Path) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -65536")  # 64 MB page cache
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE taxa (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            status TEXT,
            scientific_name TEXT,
            authorship TEXT,
            rank TEXT,
            extinct INTEGER,
            environment TEXT,
            link TEXT,
            kingdom TEXT, phylum TEXT, class TEXT, "order" TEXT,
            family TEXT, genus TEXT, species TEXT,
            shard INTEGER
        );
        CREATE TABLE vernacular (
            taxon_id TEXT,
            name TEXT,
            language TEXT,
            preferred INTEGER
        );
        CREATE TABLE distribution (
            taxon_id TEXT,
            area TEXT,
            gazetteer TEXT,
            establishment TEXT,
            threat TEXT
        );
    """)


def truthy(value: str) -> int:
    return 1 if (value or "").strip().lower() in ("true", "1", "yes", "y") else 0


def load_name_usage(conn: sqlite3.Connection, path: Path, limit: int | None) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch: list[tuple] = []
    total = 0
    for row in iter_tsv(path, limit=limit):
        record_id = row.get("ID", "").strip()
        if not record_id:
            continue
        batch.append((
            record_id,
            (row.get("parentID") or "").strip() or None,
            row.get("status") or None,
            row.get("scientificName") or None,
            row.get("authorship") or None,
            row.get("rank") or None,
            truthy(row.get("extinct", "")),
            row.get("environment") or None,
            row.get("link") or None,
            row.get("kingdom") or None,
            row.get("phylum") or None,
            row.get("class") or None,
            row.get("order") or None,
            row.get("family") or None,
            row.get("genus") or None,
            row.get("species") or None,
            shard_for(record_id),
        ))
        if len(batch) >= INSERT_BATCH:
            cur.executemany(
                "INSERT OR IGNORE INTO taxa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                batch,
            )
            total += len(batch)
            batch.clear()
            if total % (INSERT_BATCH * 10) == 0:
                log(f"  loaded {total:,} taxa…")
    if batch:
        cur.executemany(
            "INSERT OR IGNORE INTO taxa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            batch,
        )
        total += len(batch)
    conn.commit()
    return total


def load_vernacular(conn: sqlite3.Connection, path: Path, limit: int | None) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch: list[tuple] = []
    total = 0
    for row in iter_tsv(path, limit=limit):
        taxon_id = (row.get("taxonID") or "").strip()
        name = (row.get("name") or "").strip()
        if not taxon_id or not name:
            continue
        batch.append((
            taxon_id,
            name,
            (row.get("language") or "").strip() or None,
            truthy(row.get("preferred", "")),
        ))
        if len(batch) >= INSERT_BATCH:
            cur.executemany(
                "INSERT INTO vernacular VALUES (?,?,?,?)", batch,
            )
            total += len(batch)
            batch.clear()
    if batch:
        cur.executemany("INSERT INTO vernacular VALUES (?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    return total


def load_distribution(conn: sqlite3.Connection, path: Path, limit: int | None) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch: list[tuple] = []
    total = 0
    for row in iter_tsv(path, limit=limit):
        taxon_id = (row.get("taxonID") or "").strip()
        area = (row.get("area") or "").strip()
        if not taxon_id or not area:
            continue
        batch.append((
            taxon_id,
            area,
            (row.get("gazetteer") or "").strip() or None,
            (row.get("establishmentMeans") or "").strip() or None,
            (row.get("threatStatus") or "").strip() or None,
        ))
        if len(batch) >= INSERT_BATCH:
            cur.executemany(
                "INSERT INTO distribution VALUES (?,?,?,?,?)", batch,
            )
            total += len(batch)
            batch.clear()
    if batch:
        cur.executemany("INSERT INTO distribution VALUES (?,?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    return total


# ---------------------------------------------------------------------------
# Phase 2 — index, then aggregate vernacular + distribution per taxon
# ---------------------------------------------------------------------------


def build_indexes(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE INDEX idx_taxa_shard ON taxa(shard);
        CREATE INDEX idx_taxa_parent ON taxa(parent_id);
        CREATE INDEX idx_taxa_rank ON taxa(rank);
        CREATE INDEX idx_vern_taxon ON vernacular(taxon_id);
        CREATE INDEX idx_dist_taxon ON distribution(taxon_id);
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# Phase 3 — emit sharded taxon JSON files
# ---------------------------------------------------------------------------


def fetch_vernaculars(conn: sqlite3.Connection, taxon_id: str) -> list[dict]:
    cur = conn.execute(
        """SELECT name, language, preferred FROM vernacular
           WHERE taxon_id = ? ORDER BY preferred DESC, language ASC LIMIT ?""",
        (taxon_id, MAX_VERNACULARS_PER_TAXON),
    )
    return [{"n": n, "l": l or "", "p": bool(p)} for n, l, p in cur]


def fetch_distribution(conn: sqlite3.Connection, taxon_id: str) -> list[dict]:
    cur = conn.execute(
        """SELECT area, gazetteer, establishment, threat FROM distribution
           WHERE taxon_id = ? LIMIT ?""",
        (taxon_id, MAX_DISTRIBUTION_PER_TAXON),
    )
    return [
        {"a": a, "g": g or "", "e": e or "", "t": t or ""}
        for a, g, e, t in cur
    ]


def fetch_children_ids(conn: sqlite3.Connection, parent_id: str) -> list[str]:
    cur = conn.execute(
        "SELECT id FROM taxa WHERE parent_id = ? ORDER BY scientific_name",
        (parent_id,),
    )
    return [row[0] for row in cur]


def emit_taxa_shards(conn: sqlite3.Connection, out_dir: Path) -> None:
    """For each shard, write data/taxa/<shard>.json containing every taxon
    whose ID hashes into that shard.

    Per-record schema (compact keys to keep size down — gzip helps further):
        i  ID
        p  parent ID
        n  scientific name
        a  authorship
        r  rank
        s  status
        x  extinct (bool)
        e  environment
        l  link
        L  lineage dict (k, ph, cl, or, fa, ge, sp)
        v  vernacular [{n,l,p}]
        d  distribution [{a,g,e,t}]
        c  children IDs (kept in detail too — small lists fold in cleanly)
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cur = conn.cursor()
    total = conn.execute("SELECT COUNT(*) FROM taxa").fetchone()[0]
    log(f"  emitting {total:,} taxa across {NUM_SHARDS} shards…")
    for shard in range(NUM_SHARDS):
        cur.execute(
            """SELECT id, parent_id, status, scientific_name, authorship,
                      rank, extinct, environment, link,
                      kingdom, phylum, class, "order", family, genus, species
               FROM taxa WHERE shard = ? ORDER BY id""",
            (shard,),
        )
        bucket: dict[str, dict] = {}
        for (rid, pid, status, name, author, rank, extinct, env, link,
             k, ph, cl, ord_, fa, ge, sp) in cur.fetchall():
            lineage = {}
            if k:  lineage["k"]  = k
            if ph: lineage["ph"] = ph
            if cl: lineage["cl"] = cl
            if ord_: lineage["or"] = ord_
            if fa: lineage["fa"] = fa
            if ge: lineage["ge"] = ge
            if sp: lineage["sp"] = sp
            record: dict = {
                "i": rid,
                "n": name or rid,
            }
            if pid:    record["p"] = pid
            if author: record["a"] = author
            if rank:   record["r"] = rank
            if status: record["s"] = status
            if extinct: record["x"] = 1
            if env:    record["e"] = env
            if link:   record["l"] = link
            if lineage: record["L"] = lineage
            verns = fetch_vernaculars(conn, rid)
            if verns: record["v"] = verns
            dist = fetch_distribution(conn, rid)
            if dist: record["d"] = dist
            kids = fetch_children_ids(conn, rid)
            if kids: record["c"] = kids
            bucket[rid] = record
        write_json(out_dir / f"{shard}.json", bucket)
        if shard % 64 == 0:
            log(f"    shard {shard}/{NUM_SHARDS} ({len(bucket)} records)")


# ---------------------------------------------------------------------------
# Phase 4 — search index, sharded by 2-char prefix
# ---------------------------------------------------------------------------


def emit_search_index(conn: sqlite3.Connection, out_dir: Path) -> dict:
    """Sharded autocomplete index. Every entry contains:
        i  ID                  (so the frontend can navigate)
        n  display name        (scientific or vernacular)
        r  rank (optional)
        v  is vernacular (1) vs scientific (0)
    The shards are tiny JSON objects keyed by prefix (e.g. ``ho.json`` for all
    names starting with "ho"), kept under ~1MB each."""
    out_dir.mkdir(parents=True, exist_ok=True)
    buckets: dict[str, list[dict]] = {}

    def add(name: str, rid: str, rank: str | None, is_vern: bool) -> None:
        norm = normalise_search(name)
        if not norm:
            return
        prefix = search_prefix(norm)
        entry: dict = {"i": rid, "n": name}
        if rank:
            entry["r"] = rank
        if is_vern:
            entry["v"] = 1
        buckets.setdefault(prefix, []).append(entry)

    log("  indexing scientific names…")
    for rid, name, rank in conn.execute(
            "SELECT id, scientific_name, rank FROM taxa WHERE scientific_name IS NOT NULL"):
        add(name, rid, rank, is_vern=False)

    log("  indexing vernacular names…")
    for tid, name in conn.execute(
            "SELECT taxon_id, name FROM vernacular"):
        add(name, tid, None, is_vern=True)

    log(f"  writing {len(buckets)} search shards…")
    for prefix, entries in buckets.items():
        # cap each shard at 5000 entries to keep them quick to download;
        # the frontend will live-filter what's returned.
        entries.sort(key=lambda e: (len(e["n"]), e["n"]))
        if len(entries) > 5000:
            entries = entries[:5000]
        write_json(out_dir / f"{prefix}.json", entries)

    manifest = {
        "shards": sorted(buckets.keys()),
        "totalEntries": sum(len(v) for v in buckets.values()),
    }
    write_json(out_dir / "manifest.json", manifest)
    return manifest


# ---------------------------------------------------------------------------
# Phase 5 — manifest, stats, and a "roots" listing for the home page
# ---------------------------------------------------------------------------


def emit_roots(conn: sqlite3.Connection, out_dir: Path) -> list[dict]:
    """Records with no parent (or parent that doesn't resolve) are roots —
    typically the kingdoms. We pre-compute the listing so the home page is
    instant."""
    cur = conn.execute("""
        SELECT t.id, t.scientific_name, t.rank
        FROM taxa t
        LEFT JOIN taxa p ON p.id = t.parent_id
        WHERE t.parent_id IS NULL OR p.id IS NULL
        ORDER BY t.scientific_name
    """)
    roots = [{"i": rid, "n": name, "r": rank}
             for rid, name, rank in cur.fetchall()]
    write_json(out_dir / "roots.json", roots)
    return roots


def emit_stats(conn: sqlite3.Connection, out_dir: Path, roots: list[dict]) -> dict:
    rank_counts = dict(conn.execute(
        "SELECT rank, COUNT(*) FROM taxa GROUP BY rank"
    ).fetchall())
    status_counts = dict(conn.execute(
        "SELECT status, COUNT(*) FROM taxa GROUP BY status"
    ).fetchall())
    extinct_count = conn.execute(
        "SELECT COUNT(*) FROM taxa WHERE extinct = 1"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM taxa").fetchone()[0]
    vern_total = conn.execute("SELECT COUNT(*) FROM vernacular").fetchone()[0]
    dist_total = conn.execute("SELECT COUNT(*) FROM distribution").fetchone()[0]

    stats = {
        "totalTaxa": total,
        "totalVernaculars": vern_total,
        "totalDistributionEntries": dist_total,
        "extinctCount": extinct_count,
        "rootCount": len(roots),
        "rankCounts": rank_counts,
        "statusCounts": status_counts,
        "rankOrder": RANK_ORDER,
        "numShards": NUM_SHARDS,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    write_json(out_dir / "stats.json", stats)
    return stats


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True,
                        help="Folder containing the raw .tsv files.")
    parser.add_argument("--output", required=True,
                        help="Folder to write the static JSON tree into.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Optional: cap rows per TSV (handy for smoke tests).")
    parser.add_argument("--keep-db", action="store_true",
                        help="Don't delete the scratch SQLite DB on exit.")
    args = parser.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    db_path = out_dir / "_scratch.sqlite"

    log("Catalogue of Life — static processor starting")
    log(f"  input : {in_dir}")
    log(f"  output: {out_dir}")
    if args.limit:
        log(f"  LIMIT mode: only first {args.limit:,} rows per file")

    conn = init_db(db_path)
    try:
        with step("create schema"):
            create_schema(conn)
        with step("load NameUsage.tsv"):
            n = load_name_usage(conn, in_dir / "NameUsage.tsv", args.limit)
            log(f"  taxa loaded: {n:,}")
        with step("load VernacularName.tsv"):
            n = load_vernacular(conn, in_dir / "VernacularName.tsv", args.limit)
            log(f"  vernacular rows: {n:,}")
        with step("load Distribution.tsv"):
            n = load_distribution(conn, in_dir / "Distribution.tsv", args.limit)
            log(f"  distribution rows: {n:,}")
        with step("build indexes"):
            build_indexes(conn)
        with step("emit taxa shards"):
            emit_taxa_shards(conn, out_dir / "taxa")
        with step("emit search index"):
            emit_search_index(conn, out_dir / "search")
        with step("emit roots + stats"):
            roots = emit_roots(conn, out_dir)
            stats = emit_stats(conn, out_dir, roots)
            log(f"  total taxa: {stats['totalTaxa']:,}")
            log(f"  roots: {stats['rootCount']}")
    finally:
        conn.close()
        if not args.keep_db and db_path.exists():
            db_path.unlink()

    log("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
