#!/usr/bin/env python3
"""
Catalogue of Life — Static Data Processor (schema v2)
=====================================================

Reads a Catalogue of Life ColDP export (NameUsage.tsv, VernacularName.tsv,
Distribution.tsv, metadata.yaml) and emits the static JSON the React
frontend consumes.  Everything streams through an on-disk SQLite scratch
database; nothing large is held in Python memory.

Output layout  (all paths relative to --output)

    meta.json                     dataset citation, counts, roots, shard config
    taxa/<0..CORE_SHARDS-1>.json  core records keyed by ID (name, rank, status,
                                  parent, counts) — small, one fetch per page
    higher/<0..HIGHER_SHARDS-1>.json
                                  supra-specific accepted taxa with their full
                                  ancestor chain inline, so a species page needs
                                  at most one extra fetch for its breadcrumb
    detail/<0..CORE_SHARDS-1>.json
                                  vernacular names + distribution, keyed by ID
    kids/<0..KIDS_SHARDS-1>.json  first page of children per parent (accepted
                                  children and synonyms listed separately)
    kids/p/<parentId>-c<n>.json   overflow pages for parents with many children
    kids/p/<parentId>-s<n>.json   overflow pages for parents with many synonyms
    search/manifest.json          adaptive prefix trie: which shard answers a query
    search/<prefix>.json          search entries [id, name, rank, kind, matched]

CLI
    python process_data.py --input <dir> --output <dir> [--limit N] [--keep-db]
                           [--include-bins]
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import shutil
import sqlite3
import sys
import time
import unicodedata
from contextlib import contextmanager
from pathlib import Path

csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------
# Configuration — the frontend mirrors every constant in src/data/config.js
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 2

CORE_SHARDS = 4096      # taxa/ and detail/
HIGHER_SHARDS = 512     # higher/
KIDS_SHARDS = 1024      # kids/ (hashed on the PARENT id)

KIDS_PAGE = 120         # children per page (inline first page + overflow pages)
MAX_VERNACULARS = 40
MAX_DISTRIBUTION = 100

SEARCH_SHARD_LIMIT = 6000     # a prefix shard larger than this is split further
SEARCH_SUMMARY_LIMIT = 1500   # top entries kept for a prefix that was split
SEARCH_MAX_PREFIX = 8
SEARCH_MIN_TOKEN = 4          # extra index entries for words this long or longer

INSERT_BATCH = 50000

ACCEPTED_STATUSES = ("accepted", "provisionally accepted")

# Every rank Catalogue of Life / ChecklistBank uses, broad → narrow.
RANK_ORDER = [
    "unranked", "domain", "realm", "subrealm", "superkingdom", "kingdom",
    "subkingdom", "infrakingdom", "superphylum", "phylum", "subphylum",
    "infraphylum", "parvphylum", "microphylum", "nanophylum", "claudius",
    "gigaclass", "megaclass", "superclass", "class", "subclass", "infraclass",
    "subterclass", "parvclass", "superdivision", "division", "subdivision",
    "infradivision", "superlegion", "legion", "sublegion", "infralegion",
    "supercohort", "cohort", "subcohort", "infracohort", "gigaorder",
    "magnorder", "grandorder", "mirorder", "superorder", "order", "nanorder",
    "hyporder", "minorder", "suborder", "infraorder", "parvorder",
    "supersection", "section", "subsection", "superfamily", "epifamily",
    "family", "subfamily", "infrafamily", "supertribe", "tribe", "subtribe",
    "infratribe", "suprageneric name", "genus", "subgenus", "infragenus",
    "supersubgenus", "supersection botany", "section botany",
    "subsection botany", "series", "subseries", "infrageneric name",
    "species aggregate", "species", "infraspecific name", "grex",
    "subspecies", "cultivar group", "convariety", "infrasubspecific name",
    "proles", "natio", "aberration", "morph", "variety", "subvariety", "form",
    "subform", "pathovar", "biovar", "chemovar", "morphovar", "phagovar",
    "serovar", "chemoform", "forma specialis", "lusus", "cultivar", "mutatio",
    "strain", "other",
]
RANK_INDEX = {r: i for i, r in enumerate(RANK_ORDER)}
SPECIES_INDEX = RANK_INDEX["species"]

# Status codes used in every emitted record (0 is omitted = accepted).
STATUS_ORDER = ["accepted", "provisionally accepted", "synonym",
                "ambiguous synonym", "misapplied", "bare name"]
STATUS_CODE = {st: i for i, st in enumerate(STATUS_ORDER)}


def rank_code(rank: str) -> int:
    return RANK_INDEX.get(rank, RANK_INDEX["other"])


def status_code(status: str) -> int:
    return STATUS_CODE.get(status, len(STATUS_ORDER) - 1)

# Search ranking: lower is better.  Ranks people actually search for first.
RANK_WEIGHT = {
    "domain": 0, "kingdom": 0, "phylum": 0, "class": 0, "order": 0,
    "family": 0, "genus": 0, "species": 1, "subfamily": 2, "tribe": 2,
    "subgenus": 2, "subspecies": 2, "variety": 2, "form": 2,
}
LINK_PREFIX_MIN = 500   # a URL prefix shared by this many links gets a dictionary slot
KIND_SCI_ACCEPTED = 0
KIND_VERNACULAR = 1
KIND_SCI_PROVISIONAL = 2
KIND_SCI_SYNONYM = 3
KIND_TOKEN = 4          # matched on an inner word (epithet or vernacular word)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


@contextmanager
def step(label: str):
    log(f">>> {label}")
    t0 = time.time()
    try:
        yield
    finally:
        log(f"<<< {label} ({time.time() - t0:.1f}s)")


def djb2(text: str) -> int:
    """djb2 over UTF-16 code units, identical to the JS implementation.
    CoL IDs are ASCII so BMP/UTF-16 subtleties never arise, but we encode
    explicitly so the two sides agree even for exotic ids."""
    h = 5381
    data = text.encode("utf-16-le")
    for i in range(0, len(data), 2):
        unit = data[i] | (data[i + 1] << 8)
        h = ((h << 5) + h + unit) & 0xFFFFFFFF
    return h


def shard_for(record_id: str, shards: int) -> int:
    if not record_id:
        return 0
    return djb2(record_id) % shards


def truthy(value) -> int:
    return 1 if (value or "").strip().lower() in ("true", "1", "yes", "y") else 0


def normalise(text: str) -> str:
    """Lowercase, strip diacritics, keep letters/digits/space/hyphen,
    collapse whitespace.  Used for search keys and query matching
    (mirrored in the frontend)."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.lower()
    t = re.sub(r"[^0-9a-zÀ-\uffff\s-]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def prefix_filename(prefix: str) -> str:
    """Prefix → safe file stem. ASCII alnum stays; anything else is uXXXX."""
    out = []
    for ch in prefix:
        if ch.isascii() and ch.isalnum():
            out.append(ch)
        elif ch == " ":
            out.append("_")
        elif ch == "-":
            out.append("-")
        else:
            out.append("u%04x" % ord(ch))
    return "".join(out)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def link_prefix(link: str) -> str:
    """Everything up to and including the last '=' (query links) or the last
    '/' (path links).  Links sharing a prefix are stored as [index, suffix]."""
    cut = max(link.rfind("="), link.rfind("/"))
    return link[:cut + 1] if cut > 8 else link


def is_bin(name: str) -> bool:
    return bool(name) and name.startswith("BOLD:")


# ---------------------------------------------------------------------------
# Input handling
# ---------------------------------------------------------------------------

class ChainedRaw(io.RawIOBase):
    """Read several files as one byte stream, so a NameUsage.tsv that was
    split with `split -b` can be streamed without writing the 2.6 GB
    reassembled copy to disk."""

    def __init__(self, paths):
        self._paths = list(paths)
        self._idx = 0
        self._fh = open(self._paths[0], "rb") if self._paths else None

    def readable(self):
        return True

    def readinto(self, b):
        while self._fh is not None:
            n = self._fh.readinto(b)
            if n:
                return n
            self._fh.close()
            self._idx += 1
            self._fh = open(self._paths[self._idx], "rb") if self._idx < len(self._paths) else None
        return 0

    def close(self):
        if self._fh is not None:
            self._fh.close()
            self._fh = None
        super().close()


def name_usage_sources(in_dir: Path) -> list[Path]:
    """NameUsage.tsv if present, otherwise the split parts in order."""
    whole = in_dir / "NameUsage.tsv"
    if whole.exists():
        return [whole]
    parts = sorted(in_dir.glob("NameUsage_part_*"))
    if parts:
        log(f"  streaming {len(parts)} split parts: {', '.join(p.name for p in parts)}")
    return parts


def iter_tsv(source, limit: int | None = None):
    """Yield each TSV row as a dict.  `source` is a Path or a list of Paths
    that together form one file."""
    paths = [source] if isinstance(source, Path) else list(source)
    paths = [p for p in paths if p.exists()]
    if not paths:
        name = source.name if isinstance(source, Path) else "NameUsage.tsv"
        log(f"  ! {name} not found; skipping.")
        return
    raw = ChainedRaw(paths)
    with io.TextIOWrapper(io.BufferedReader(raw, 1 << 20), encoding="utf-8",
                          errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        try:
            header = next(reader)
        except StopIteration:
            return
        cleaned = [h.split(":", 1)[-1] for h in header]
        width = len(cleaned)
        for i, row in enumerate(reader):
            if limit is not None and i >= limit:
                return
            if len(row) < width:
                row = row + [""] * (width - len(row))
            yield dict(zip(cleaned, row))


def read_metadata(in_dir: Path) -> dict:
    """Pull citation fields out of metadata.yaml without a YAML dependency.
    Only simple top-level `key: value` lines are needed."""
    meta = {"title": "Catalogue of Life", "alias": None, "version": None,
            "issued": None, "doi": None, "license": None}
    path = in_dir / "metadata.yaml"
    if not path.exists():
        return meta
    wanted = set(meta)
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for _ in range(400):
            line = f.readline()
            if not line:
                break
            m = re.match(r"^([a-zA-Z]+):\s*(.+?)\s*$", line)
            if m and m.group(1) in wanted and meta.get(m.group(1)) in (None, "Catalogue of Life"):
                meta[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return meta


# ---------------------------------------------------------------------------
# Phase 1 — load into SQLite
# ---------------------------------------------------------------------------

def init_db(db_path: Path) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -262144")   # 256 MB page cache
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE taxa (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            status TEXT,
            name TEXT,
            authorship TEXT,
            rank TEXT,
            rank_idx INTEGER,
            extinct INTEGER,
            environment TEXT,
            link TEXT,
            link_prefix TEXT,
            kingdom TEXT,
            merged INTEGER,
            is_bin INTEGER,
            shard INTEGER,
            pshard INTEGER
        );
        CREATE TABLE vernacular (
            taxon_id TEXT, name TEXT, language TEXT, preferred INTEGER,
            prio INTEGER, shard INTEGER, source_id TEXT
        );
        CREATE TABLE distribution (
            taxon_id TEXT, area TEXT, area_id TEXT, gazetteer TEXT,
            establishment TEXT, threat TEXT, shard INTEGER
        );
    """)


def load_name_usage(conn, path: Path, limit) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch, total = [], 0
    for row in iter_tsv(path, limit=limit):
        rid = (row.get("ID") or "").strip()
        if not rid:
            continue
        pid = (row.get("parentID") or "").strip() or None
        rank = (row.get("rank") or "").strip().lower() or "unranked"
        name = (row.get("scientificName") or "").strip() or rid
        status = (row.get("status") or "").strip().lower() or "accepted"
        link = (row.get("link") or "").strip()
        if not link.startswith(("http://", "https://")):
            link = ""
        batch.append((
            rid, pid, status, name,
            (row.get("authorship") or "").strip() or None,
            rank, RANK_INDEX.get(rank, RANK_INDEX["other"]),
            truthy(row.get("extinct")),
            (row.get("environment") or "").strip() or None,
            link or None,
            link_prefix(link) if link else None,
            (row.get("kingdom") or "").strip() or None,
            truthy(row.get("merged")),
            1 if is_bin(name) else 0,
            shard_for(rid, CORE_SHARDS),
            shard_for(pid, KIDS_SHARDS) if pid else None,
        ))
        if len(batch) >= INSERT_BATCH:
            cur.executemany("INSERT OR IGNORE INTO taxa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
            total += len(batch)
            batch.clear()
            if total % (INSERT_BATCH * 20) == 0:
                log(f"  loaded {total:,} name usages…")
    if batch:
        cur.executemany("INSERT OR IGNORE INTO taxa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    inserted = conn.execute("SELECT COUNT(*) FROM taxa").fetchone()[0]
    if inserted != total:
        log(f"  ! {total - inserted:,} duplicate IDs were ignored")
    return inserted


def vern_priority(language: str, preferred: int) -> int:
    if language == "eng":
        return 0 if preferred else 1
    return 2 if preferred else 3


def load_vernacular(conn, path: Path, limit) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch, total = [], 0
    for row in iter_tsv(path, limit=limit):
        tid = (row.get("taxonID") or "").strip()
        name = (row.get("name") or "").strip().strip('"').strip()   # some sources wrap names in quotes
        if not tid or not name:
            continue
        lang = (row.get("language") or "").strip().lower() or None
        pref = truthy(row.get("preferred"))
        batch.append((tid, name, lang, pref, vern_priority(lang, pref),
                      shard_for(tid, CORE_SHARDS), (row.get("sourceID") or "").strip() or None))
        if len(batch) >= INSERT_BATCH:
            cur.executemany("INSERT INTO vernacular VALUES (?,?,?,?,?,?,?)", batch)
            total += len(batch)
            batch.clear()
    if batch:
        cur.executemany("INSERT INTO vernacular VALUES (?,?,?,?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    return total


def load_distribution(conn, path: Path, limit) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch, total, skipped = [], 0, 0
    for row in iter_tsv(path, limit=limit):
        tid = (row.get("taxonID") or "").strip()
        area = (row.get("area") or "").strip()
        area_id = (row.get("areaID") or "").strip()
        if not tid or not (area or area_id):
            skipped += 1
            continue
        batch.append((
            tid, area or None, area_id or None,
            (row.get("gazetteer") or "").strip() or None,
            (row.get("establishmentMeans") or "").strip() or None,
            (row.get("threatStatus") or "").strip() or None,
            shard_for(tid, CORE_SHARDS),
        ))
        if len(batch) >= INSERT_BATCH:
            cur.executemany("INSERT INTO distribution VALUES (?,?,?,?,?,?,?)", batch)
            total += len(batch)
            batch.clear()
    if batch:
        cur.executemany("INSERT INTO distribution VALUES (?,?,?,?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    if skipped:
        log(f"  ! {skipped:,} distribution rows had neither area nor areaID")
    return total


# ---------------------------------------------------------------------------
# Phase 2 — indexes and derived tables
# ---------------------------------------------------------------------------

def build_indexes(conn) -> None:
    conn.executescript("""
        CREATE INDEX idx_taxa_shard   ON taxa(shard);
        CREATE INDEX idx_taxa_pshard  ON taxa(pshard);
        CREATE INDEX idx_taxa_parent  ON taxa(parent_id);
        CREATE INDEX idx_vern_shard   ON vernacular(shard, taxon_id, prio);
        CREATE INDEX idx_dist_shard   ON distribution(shard, taxon_id);
    """)
    conn.commit()


def restrict_subtree(conn, root_ids: list[str]) -> None:
    conn.executescript("CREATE TABLE keep (id TEXT PRIMARY KEY);")
    for rid in root_ids:
        conn.execute("""
            WITH RECURSIVE sub(id) AS (
                SELECT ?
                UNION
                SELECT t.id FROM taxa t JOIN sub ON t.parent_id = sub.id
            )
            INSERT OR IGNORE INTO keep SELECT id FROM sub""", (rid,))
        conn.execute("""
            WITH RECURSIVE up(id) AS (
                SELECT parent_id FROM taxa WHERE id = ?
                UNION
                SELECT t.parent_id FROM taxa t JOIN up ON t.id = up.id WHERE t.parent_id IS NOT NULL
            )
            INSERT OR IGNORE INTO keep SELECT id FROM up WHERE id IS NOT NULL""", (rid,))
    before = conn.execute("SELECT COUNT(*) FROM taxa").fetchone()[0]
    conn.executescript("""
        DELETE FROM taxa WHERE id NOT IN (SELECT id FROM keep);
        DELETE FROM vernacular WHERE taxon_id NOT IN (SELECT id FROM keep);
        DELETE FROM distribution WHERE taxon_id NOT IN (SELECT id FROM keep);
        DROP TABLE keep;
    """)
    conn.commit()
    after = conn.execute("SELECT COUNT(*) FROM taxa").fetchone()[0]
    log(f"  kept {after:,} of {before:,} name usages")


def build_counts(conn) -> None:
    """Per-parent counts of accepted children and synonyms, per-taxon counts
    of vernaculars and distribution rows.  One aggregate each — no N+1."""
    conn.executescript(f"""
        CREATE TABLE counts AS
        SELECT parent_id AS id,
               SUM(CASE WHEN status IN ('accepted','provisionally accepted') THEN 1 ELSE 0 END) AS nc,
               SUM(CASE WHEN status NOT IN ('accepted','provisionally accepted') THEN 1 ELSE 0 END) AS ns,
               SUM(CASE WHEN is_bin = 1 THEN 1 ELSE 0 END) AS nb
        FROM taxa WHERE parent_id IS NOT NULL GROUP BY parent_id;
        CREATE UNIQUE INDEX idx_counts ON counts(id);

        -- Source coverage: how many vernacular rows each source contributes.
        -- Used to break ties between equally-ranked common names, so a name
        -- from a broad source (e.g. a global checklist) outranks a one-off.
        CREATE TABLE vsrc AS
        SELECT source_id, COUNT(*) AS n FROM vernacular GROUP BY source_id;
        CREATE UNIQUE INDEX idx_vsrc ON vsrc(source_id);

        CREATE TABLE vcounts AS
        SELECT taxon_id AS id, COUNT(DISTINCT name || '|' || COALESCE(language, '')) AS nv
        FROM vernacular GROUP BY taxon_id;
        CREATE UNIQUE INDEX idx_vcounts ON vcounts(id);

        CREATE TABLE dcounts AS
        SELECT taxon_id AS id, COUNT(*) AS nd FROM distribution GROUP BY taxon_id;
        CREATE UNIQUE INDEX idx_dcounts ON dcounts(id);
    """)
    # Mark "higher" nodes: accepted, above species rank, not a BIN, and —
    # for unranked nodes — only if they actually have children.
    conn.executescript(f"""
        ALTER TABLE taxa ADD COLUMN higher INTEGER DEFAULT 0;
        UPDATE taxa SET higher = 1
        WHERE status IN ('accepted','provisionally accepted')
          AND is_bin = 0
          AND rank_idx < {SPECIES_INDEX}
          AND (rank != 'unranked'
               OR id IN (SELECT id FROM counts WHERE nc > 0));
        CREATE INDEX idx_taxa_higher ON taxa(higher);
    """)
    conn.executescript(f"""
        CREATE TABLE linkprefix AS
        SELECT link_prefix AS prefix, COUNT(*) AS n FROM taxa
        WHERE link_prefix IS NOT NULL GROUP BY link_prefix HAVING COUNT(*) >= {LINK_PREFIX_MIN};
    """)
    conn.commit()


def link_dictionary(conn) -> list[str]:
    return [row[0] for row in conn.execute("SELECT prefix FROM linkprefix ORDER BY n DESC, prefix")]


# ---------------------------------------------------------------------------
# Phase 3 — higher taxa with inline ancestor chains
# ---------------------------------------------------------------------------

def emit_higher(conn, out_dir: Path) -> tuple[list, int]:
    """Returns (roots, orphan_count).  A root is a higher node whose parent is
    missing or unresolvable.  Chains are built from an in-memory map of the
    higher nodes only (hundreds of thousands, not millions)."""
    nodes: dict[str, tuple] = {}
    for rid, pid, name, rank in conn.execute(
            "SELECT id, parent_id, name, rank FROM taxa WHERE higher = 1"):
        nodes[rid] = (pid, name, rank)
    log(f"  {len(nodes):,} higher taxa")

    chain_cache: dict[str, list] = {}

    def chain_of(rid: str) -> list:
        """Ancestor chain [[id, name, rank], …] root → parent of rid."""
        if rid in chain_cache:
            return chain_cache[rid]
        path, cur, seen = [], rid, set()
        while True:
            pid = nodes[cur][0]
            if not pid or pid not in nodes or pid in seen:
                break
            seen.add(pid)
            if pid in chain_cache:
                path = chain_cache[pid] + [[pid, nodes[pid][1], rank_code(nodes[pid][2])]] + path
                break
            path.insert(0, [pid, nodes[pid][1], rank_code(nodes[pid][2])])
            cur = pid
        chain_cache[rid] = path
        return path

    roots, orphans = [], 0
    buckets: list[dict] = [dict() for _ in range(HIGHER_SHARDS)]
    counts = {rid: (nc, ns) for rid, nc, ns in conn.execute("SELECT id, nc, ns FROM counts")}
    for rid, (pid, name, rank) in nodes.items():
        chain = chain_of(rid)
        rec = {"i": rid, "n": name, "r": rank_code(rank), "A": chain}
        nc, ns = counts.get(rid, (0, 0))
        if nc:
            rec["nc"] = nc
        if ns:
            rec["ns"] = ns
        if not pid:
            roots.append({"i": rid, "n": name, "r": rank_code(rank), "nc": nc})
        elif pid not in nodes:
            orphans += 1
            rec["orphan"] = 1
        buckets[shard_for(rid, HIGHER_SHARDS)][rid] = rec
    for i, bucket in enumerate(buckets):
        write_json(out_dir / f"{i}.json", bucket)
    roots.sort(key=lambda r: (r["r"] != RANK_INDEX["domain"], r["n"]))
    log(f"  roots: {[r['n'] for r in roots]}; orphan higher nodes: {orphans:,}")
    return roots, orphans


# ---------------------------------------------------------------------------
# Phase 4 — core records, details, children pages
# ---------------------------------------------------------------------------

def emit_core(conn, out_dir: Path, link_dict: list[str]) -> None:
    """taxa/<shard>.json — compact keys:
        i id   n name   a authorship   r rank code (meta.ranks)   s status code
        (meta.statuses; omitted when accepted)
        p parent id   x extinct   e environment   l external link
        h 1 if this record has an entry in higher/   b 1 if BOLD BIN
        m 1 if added by the eXtended Release merge
        nc accepted children   ns synonyms   nv vernaculars   nd distributions
        l  is either a full URL or [prefixIndex, suffix] (see meta.linkPrefixes)
    """
    prefix_idx = {pfx: i for i, pfx in enumerate(link_dict)}
    total = 0
    for shard in range(CORE_SHARDS):
        bucket = {}
        for (rid, pid, status, name, author, rank, extinct, env, link, merged,
             bin_, higher, nc, ns, nv, nd) in conn.execute(
                """SELECT t.id, t.parent_id, t.status, t.name, t.authorship, t.rank,
                          t.extinct, t.environment, t.link, t.merged, t.is_bin, t.higher,
                          c.nc, c.ns, v.nv, d.nd
                   FROM taxa t
                   LEFT JOIN counts  c ON c.id = t.id
                   LEFT JOIN vcounts v ON v.id = t.id
                   LEFT JOIN dcounts d ON d.id = t.id
                   WHERE t.shard = ? ORDER BY t.id""", (shard,)):
            rec = {"i": rid, "n": name}
            if author: rec["a"] = author
            if rank and rank != "unranked": rec["r"] = rank_code(rank)
            if status != "accepted": rec["s"] = status_code(status)
            if pid: rec["p"] = pid
            if extinct: rec["x"] = 1
            if env: rec["e"] = env
            if link:
                pfx = link_prefix(link)
                rec["l"] = [prefix_idx[pfx], link[len(pfx):]] if pfx in prefix_idx else link
            if merged: rec["m"] = 1
            if bin_: rec["b"] = 1
            if higher: rec["h"] = 1
            if nc: rec["nc"] = nc
            if ns: rec["ns"] = ns
            if nv: rec["nv"] = nv
            if nd: rec["nd"] = nd
            bucket[rid] = rec
        write_json(out_dir / f"{shard}.json", bucket)
        total += len(bucket)
        if shard % 512 == 0:
            log(f"    core shard {shard}/{CORE_SHARDS} ({len(bucket)} records)")
    log(f"  {total:,} core records written")


def emit_detail(conn, out_dir: Path) -> None:
    """detail/<shard>.json — {id: {v: [[name, lang, preferred]…],
                                   d: [[area, areaId, gazetteer, establishment, threat]…]}}"""
    for shard in range(CORE_SHARDS):
        bucket: dict[str, dict] = {}
        # One row per distinct (name, language); the number of sources that
        # list a name ranks it, so "Tiger" beats a one-off "Bagh" among the
        # preferred English names.
        last, n = None, 0
        for tid, name, lang, pref, sources in conn.execute(
                """SELECT v.taxon_id, v.name, v.language, MAX(v.preferred), COUNT(*) AS sources
                   FROM vernacular v LEFT JOIN vsrc s ON s.source_id = v.source_id
                   WHERE v.shard = ?
                   GROUP BY v.taxon_id, v.name, v.language
                   ORDER BY v.taxon_id, MIN(v.prio), sources DESC, MAX(COALESCE(s.n, 0)) DESC, v.name""", (shard,)):
            if tid != last:
                last, n = tid, 0
            n += 1
            if n > MAX_VERNACULARS:
                continue
            bucket.setdefault(tid, {}).setdefault("v", []).append([name, lang or "", 1 if pref else 0])
        last, n = None, 0
        for tid, area, area_id, gaz, est, threat in conn.execute(
                """SELECT taxon_id, area, area_id, gazetteer, establishment, threat
                   FROM distribution WHERE shard = ? ORDER BY taxon_id, gazetteer, COALESCE(area, area_id)""", (shard,)):
            if tid != last:
                last, n = tid, 0
            n += 1
            if n > MAX_DISTRIBUTION:
                continue
            bucket.setdefault(tid, {}).setdefault("d", []).append(
                [area or "", area_id or "", gaz or "", est or "", threat or ""])
        write_json(out_dir / f"{shard}.json", bucket)
        if shard % 512 == 0:
            log(f"    detail shard {shard}/{CORE_SHARDS}")


def child_summary(row) -> list:
    """[id, name, rankCode, statusCode, extinct, nc, flags]  (flags bit0 = BIN)"""
    rid, name, rank, status, extinct, bin_, nc = row
    return [rid, name, rank_code(rank), status_code(status), 1 if extinct else 0,
            nc or 0, 1 if bin_ else 0]


def emit_kids(conn, out_dir: Path) -> int:
    """kids/<shard>.json — {parentId: {c: [...first page...], s: [...]}}
    plus overflow pages kids/p/<parentId>-c<n>.json / -s<n>.json."""
    pages_dir = out_dir / "p"
    overflow_pages = 0
    for shard in range(KIDS_SHARDS):
        bucket: dict[str, dict] = {}
        cur_parent, acc, syn = None, [], []

        def flush():
            nonlocal overflow_pages
            if cur_parent is None:
                return
            entry = {}
            for key, items in (("c", acc), ("s", syn)):
                if not items:
                    continue
                entry[key] = items[:KIDS_PAGE]
                for page_no, start in enumerate(range(KIDS_PAGE, len(items), KIDS_PAGE), start=1):
                    write_json(pages_dir / f"{cur_parent}-{key}{page_no}.json",
                               items[start:start + KIDS_PAGE])
                    overflow_pages += 1
            bucket[cur_parent] = entry

        for row in conn.execute(
                """SELECT t.parent_id, t.id, t.name, t.rank, t.status, t.extinct, t.is_bin, c.nc
                   FROM taxa t LEFT JOIN counts c ON c.id = t.id
                   WHERE t.pshard = ?
                   ORDER BY t.parent_id,
                            CASE WHEN t.status IN ('accepted','provisionally accepted') THEN 0 ELSE 1 END,
                            t.is_bin, t.rank_idx, t.name""", (shard,)):
            pid = row[0]
            if pid != cur_parent:
                flush()
                cur_parent, acc, syn = pid, [], []
            summary = child_summary(row[1:])
            (acc if row[4] in ACCEPTED_STATUSES else syn).append(summary)
        flush()
        write_json(out_dir / f"{shard}.json", bucket)
        if shard % 256 == 0:
            log(f"    kids shard {shard}/{KIDS_SHARDS} ({len(bucket)} parents)")
    log(f"  {overflow_pages:,} overflow child pages written")
    return overflow_pages


# ---------------------------------------------------------------------------
# Phase 5 — search index (adaptive prefix trie, built inside SQLite)
# ---------------------------------------------------------------------------

def build_search_table(conn, include_bins: bool) -> int:
    conn.executescript("""
        CREATE TABLE search (
            key TEXT, id TEXT, name TEXT, rank, kind INTEGER, prio INTEGER, extra TEXT
        );
    """)
    cur = conn.cursor()
    cur.execute("BEGIN")
    batch, total = [], 0

    def add(key, rid, name, rank, kind, rank_weight, extra=None):
        nonlocal total
        if not key:
            return
        prio = kind * 10 + rank_weight
        batch.append((key, rid, name, rank, kind, prio, extra))
        if len(batch) >= INSERT_BATCH:
            cur.executemany("INSERT INTO search VALUES (?,?,?,?,?,?,?)", batch)
            total += len(batch)
            batch.clear()

    log("  indexing scientific names…")
    bin_filter = "" if include_bins else " AND is_bin = 0"
    for rid, name, rank, status, rank_idx in conn.execute(
            f"SELECT id, name, rank, status, rank_idx FROM taxa WHERE name IS NOT NULL{bin_filter}"):
        key = normalise(name)
        if status == "accepted":
            kind = KIND_SCI_ACCEPTED
        elif status == "provisionally accepted":
            kind = KIND_SCI_PROVISIONAL
        else:
            kind = KIND_SCI_SYNONYM
        rw = RANK_WEIGHT.get(rank, 3)
        add(key, rid, name, rank_code(rank), kind, rw)
        # Epithet tokens for accepted species/genera-level names so that
        # "tigris" finds Panthera tigris.
        if kind == KIND_SCI_ACCEPTED and rank == "species":
            words = key.split(" ")
            for w in words[1:]:
                if len(w) >= SEARCH_MIN_TOKEN and w != words[0]:
                    add(w, rid, name, rank_code(rank), KIND_TOKEN, rw, w)

    log("  indexing vernacular names…")
    for tid, name, lang, sci in conn.execute(
            """SELECT v.taxon_id, v.name, v.language, t.name FROM vernacular v
               JOIN taxa t ON t.id = v.taxon_id ORDER BY v.taxon_id, v.prio"""):
        key = normalise(name)
        rw = 0 if lang == "eng" else 1
        add(key, tid, name, lang or "", KIND_VERNACULAR, rw, sci)
        if lang == "eng":
            words = key.split(" ")
            for w in words[1:]:
                if len(w) >= SEARCH_MIN_TOKEN:
                    add(w, tid, name, lang, KIND_TOKEN, rw + 1, sci)
    if batch:
        cur.executemany("INSERT INTO search VALUES (?,?,?,?,?,?,?)", batch)
        total += len(batch)
    conn.commit()
    log(f"  {total:,} search entries; indexing…")
    conn.execute("CREATE INDEX idx_search_key ON search(key, prio, length(name))")
    conn.commit()
    return total


def emit_search(conn, out_dir: Path) -> dict:
    """Adaptive prefix sharding.  Walk prefixes of increasing length; a prefix
    whose entry count fits in SEARCH_SHARD_LIMIT gets a full shard, otherwise
    a summary shard (top entries by priority) and its children are visited.
    manifest.json maps each emitted prefix to 'f' (full) or 's' (summary)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    stats = {"full": 0, "summary": 0, "entries": 0}

    def count(prefix: str) -> int:
        return conn.execute(
            "SELECT COUNT(*) FROM search WHERE key >= ? AND key < ?",
            (prefix, prefix + "\uffff")).fetchone()[0]

    def rows(prefix: str, limit: int | None):
        order = " ORDER BY prio, length(name), name"
        if limit is None:
            return conn.execute(
                "SELECT id, name, rank, kind, key, extra FROM search WHERE key >= ? AND key < ?" + order,
                (prefix, prefix + "\uffff"))
        # Summary: every exact-key entry (they have no longer prefix to live
        # under) followed by the top entries of the whole range.
        exact = conn.execute(
            "SELECT id, name, rank, kind, key, extra FROM search WHERE key = ?" + order, (prefix,)).fetchall()
        top = conn.execute(
            "SELECT id, name, rank, kind, key, extra FROM search WHERE key > ? AND key < ?" + order
            + f" LIMIT {int(limit)}", (prefix, prefix + "\uffff")).fetchall()
        return exact + top

    def entry(row) -> list:
        """[id, display, rankCode|language, kind, extra] — extra is the matched
        word for epithet tokens and the scientific name for vernacular hits."""
        rid, name, rank, kind, key, extra = row
        e = [rid, name, rank, kind]
        if extra:
            e.append(extra)
        return e

    def visit(prefix: str):
        n = count(prefix)
        if n == 0:
            return
        if n <= SEARCH_SHARD_LIMIT or len(prefix) >= SEARCH_MAX_PREFIX:
            write_json(out_dir / f"{prefix_filename(prefix)}.json",
                       [entry(r) for r in rows(prefix, None)])
            manifest[prefix] = "f"
            stats["full"] += 1
            stats["entries"] += n
            return
        write_json(out_dir / f"{prefix_filename(prefix)}.json",
                   [entry(r) for r in rows(prefix, SEARCH_SUMMARY_LIMIT)])
        manifest[prefix] = "s"
        stats["summary"] += 1
        nxt = conn.execute(
            "SELECT DISTINCT substr(key, ?, 1) FROM search WHERE key >= ? AND key < ?",
            (len(prefix) + 1, prefix, prefix + "\uffff")).fetchall()
        for (ch,) in nxt:
            if ch:
                visit(prefix + ch)

    first = conn.execute("SELECT DISTINCT substr(key, 1, 1) FROM search").fetchall()
    for (ch,) in sorted(first):
        if ch:
            visit(ch)
    manifest_doc = {"maxPrefix": SEARCH_MAX_PREFIX, "shards": manifest}
    write_json(out_dir / "manifest.json", manifest_doc)
    log(f"  search shards: {stats['full']:,} full, {stats['summary']:,} summary; "
        f"{stats['entries']:,} entries in full shards")
    return manifest_doc


# ---------------------------------------------------------------------------
# Phase 6 — meta.json
# ---------------------------------------------------------------------------

def emit_meta(conn, out_dir: Path, roots: list, orphans: int, metadata: dict,
              include_bins: bool, link_dict: list[str]) -> dict:
    q = lambda sql, *a: conn.execute(sql, a).fetchone()[0]
    status_counts = dict(conn.execute("SELECT status, COUNT(*) FROM taxa GROUP BY status"))
    rank_counts = dict(conn.execute(
        "SELECT rank, COUNT(*) FROM taxa WHERE status IN ('accepted','provisionally accepted') GROUP BY rank"))
    accepted_species = q(
        "SELECT COUNT(*) FROM taxa WHERE rank='species' AND status IN ('accepted','provisionally accepted') AND is_bin=0")
    kingdom_counts = {}
    for kingdom, rank, n in conn.execute(
            """SELECT COALESCE(kingdom,''), rank, COUNT(*) FROM taxa
               WHERE status IN ('accepted','provisionally accepted') AND is_bin = 0
                 AND rank IN ('species','genus','family')
               GROUP BY kingdom, rank"""):
        kingdom_counts.setdefault(kingdom or "(no kingdom)", {})[rank] = n
    languages = [{"l": l or "", "n": n} for l, n in conn.execute(
        "SELECT language, COUNT(*) FROM vernacular GROUP BY language ORDER BY COUNT(*) DESC LIMIT 25")]
    meta = {
        "schema": SCHEMA_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset": metadata,
        "ranks": RANK_ORDER,
        "statuses": STATUS_ORDER,
        "shards": {"core": CORE_SHARDS, "higher": HIGHER_SHARDS, "kids": KIDS_SHARDS,
                   "kidsPage": KIDS_PAGE, "searchMaxPrefix": SEARCH_MAX_PREFIX},
        "counts": {
            "nameUsages": q("SELECT COUNT(*) FROM taxa"),
            "accepted": status_counts.get("accepted", 0) + status_counts.get("provisionally accepted", 0),
            "acceptedSpecies": accepted_species,
            "synonyms": sum(v for k, v in status_counts.items() if k not in ACCEPTED_STATUSES),
            "bins": q("SELECT COUNT(*) FROM taxa WHERE is_bin = 1"),
            "extinct": q("SELECT COUNT(*) FROM taxa WHERE extinct = 1 AND status IN ('accepted','provisionally accepted')"),
            "xrAdded": q("SELECT COUNT(*) FROM taxa WHERE merged = 1"),
            "vernaculars": q("SELECT COUNT(*) FROM vernacular"),
            "taxaWithVernaculars": q("SELECT COUNT(*) FROM vcounts"),
            "distributions": q("SELECT COUNT(*) FROM distribution"),
            "taxaWithDistributions": q("SELECT COUNT(*) FROM dcounts"),
            "higherTaxa": q("SELECT COUNT(*) FROM taxa WHERE higher = 1"),
            "orphanHigherTaxa": orphans,
            "byStatus": status_counts,
            "byRank": rank_counts,
            "byKingdom": kingdom_counts,
            "vernacularLanguages": languages,
        },
        "search": {"includesBins": include_bins},
        "kidsFields": ["id", "name", "rank", "status", "extinct", "nc", "flags"],
        "searchFields": ["id", "name", "rankOrLang", "kind", "extra (matched word | scientific name)"],
        "searchKinds": ["accepted", "vernacular", "provisional", "synonym", "token"],
        "linkPrefixes": link_dict,
        "roots": roots,
    }
    write_json(out_dir / "meta.json", meta)
    return meta


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="Folder with the ColDP .tsv files")
    parser.add_argument("--output", required=True, help="Folder to write the static data into")
    parser.add_argument("--limit", type=int, default=None, help="Cap rows per TSV (smoke tests)")
    parser.add_argument("--keep-db", action="store_true", help="Keep the scratch SQLite database")
    parser.add_argument("--include-bins", action="store_true",
                        help="Index BOLD barcode clusters (BOLD:…) in search as well")
    parser.add_argument("--exclude-bins", action="store_true",
                        help="Drop BOLD barcode clusters from the output entirely (smaller site)")
    parser.add_argument("--subtree", default=None,
                        help="Comma-separated taxon IDs: keep only these, their descendants "
                             "and their ancestors (realistic local dev subset)")
    args = parser.parse_args(argv)

    in_dir, out_dir = Path(args.input), Path(args.output)
    if out_dir.exists():
        # Only ever clear a folder we previously generated.
        marker = out_dir / "meta.json"
        if any(out_dir.iterdir()) and not marker.exists():
            log(f"! refusing to write into non-empty folder without meta.json: {out_dir}")
            return 2
        for child in out_dir.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)
    db_path = out_dir.parent / f"_scratch_{out_dir.name}.sqlite"

    log("Catalogue of Life — static processor v2")
    log(f"  input : {in_dir}")
    log(f"  output: {out_dir}")
    if args.limit:
        log(f"  LIMIT mode: first {args.limit:,} rows per file")

    conn = init_db(db_path)
    try:
        with step("schema"):
            create_schema(conn)
        with step("read metadata.yaml"):
            metadata = read_metadata(in_dir)
            log(f"  {metadata}")
        with step("locate NameUsage.tsv"):
            nu = name_usage_sources(in_dir)
        with step("load NameUsage.tsv"):
            log(f"  {load_name_usage(conn, nu, args.limit):,} name usages")
        with step("load VernacularName.tsv"):
            log(f"  {load_vernacular(conn, in_dir / 'VernacularName.tsv', args.limit):,} vernacular rows")
        with step("load Distribution.tsv"):
            log(f"  {load_distribution(conn, in_dir / 'Distribution.tsv', args.limit):,} distribution rows")
        if args.exclude_bins:
            with step("drop BOLD BINs"):
                conn.execute("DELETE FROM taxa WHERE is_bin = 1")
                conn.commit()
        with step("indexes"):
            build_indexes(conn)
        if args.subtree:
            with step(f"restrict to subtree(s) {args.subtree}"):
                restrict_subtree(conn, [t.strip() for t in args.subtree.split(",") if t.strip()])
        with step("derived counts + higher-taxa flags"):
            build_counts(conn)
        with step("emit higher/"):
            roots, orphans = emit_higher(conn, out_dir / "higher")
        with step("emit taxa/"):
            link_dict = link_dictionary(conn)
            log(f"  {len(link_dict)} shared link prefixes")
            emit_core(conn, out_dir / "taxa", link_dict)
        with step("emit detail/"):
            emit_detail(conn, out_dir / "detail")
        with step("emit kids/"):
            emit_kids(conn, out_dir / "kids")
        with step("build search table"):
            build_search_table(conn, args.include_bins)
        with step("emit search/"):
            emit_search(conn, out_dir / "search")
        with step("emit meta.json"):
            meta = emit_meta(conn, out_dir, roots, orphans, metadata, args.include_bins, link_dict)
            log(f"  name usages: {meta['counts']['nameUsages']:,}; "
                f"accepted species: {meta['counts']['acceptedSpecies']:,}")
    finally:
        conn.close()
        if not args.keep_db and db_path.exists():
            db_path.unlink()
    log("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
