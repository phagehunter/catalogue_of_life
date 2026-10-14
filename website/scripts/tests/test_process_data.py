"""Unit tests for process_data.py.  Run:  python3 -m unittest discover -s scripts/tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import process_data as pd  # noqa: E402

NAME_USAGE = [
    ("col:ID", "col:parentID", "col:status", "col:scientificName", "col:authorship", "col:rank",
     "col:extinct", "col:environment", "col:kingdom", "col:link", "clb:merged"),
    ("D1", "", "accepted", "Eukaryota", "", "domain", "", "", "", "", "false"),
    ("K1", "D1", "accepted", "Animalia", "", "kingdom", "", "", "Animalia", "", "false"),
    ("F1", "K1", "accepted", "Felidae", "Fischer, 1817", "family", "", "", "Animalia", "https://x.org/a?id=1", "false"),
    ("G1", "F1", "accepted", "Panthera", "Oken, 1816", "genus", "", "", "Animalia", "https://x.org/a?id=2", "false"),
    ("S1", "G1", "accepted", "Panthera tigris", "(Linnaeus, 1758)", "species", "false", "terrestrial", "Animalia", "https://x.org/a?id=3", "false"),
    ("S2", "G1", "accepted", "Panthera leo", "(Linnaeus, 1758)", "species", "", "", "Animalia", "https://x.org/a?id=4", "false"),
    ("S3", "G1", "accepted", "Panthera atrox", "", "species", "true", "", "Animalia", "", "false"),
    ("Y1", "S1", "synonym", "Felis tigris", "Linnaeus, 1758", "species", "", "", "Animalia", "", "false"),
    ("B1", "S1", "accepted", "BOLD:AAA0001", "", "unranked", "", "", "Animalia", "https://bold.org/x?c=AAA0001", "true"),
    ("U1", "S1", "accepted", "Panthera tigris altaica", "Temminck, 1844", "subspecies", "", "", "Animalia", "", "false"),
    ("O1", "NOPE", "accepted", "Orphanus", "", "genus", "", "", "", "", "false"),
]
VERNACULAR = [
    ("col:taxonID", "col:sourceID", "col:name", "col:language", "col:preferred"),
    ("S1", "big", "Tigre", "fra", "true"),
    ("S1", "small", "Bagh", "eng", ""),          # one-off regional source
    ("S1", "big", "Tiger", "eng", ""),           # broad source wins the tie
    ("S1", "big", "Bengal tiger", "eng", "false"),
    ("S1", "big", "Tiger", "eng", "false"),      # duplicate row: collapsed
    ("S1", "big", "虎", "zho", "false"),
    ("G1", "big", "Big cats", "eng", "true"),
    ("S2", "big", "Lion", "eng", "true"),
    ("S3", "big", "American lion", "eng", "true"),
]
DISTRIBUTION = [
    ("col:taxonID", "col:areaID", "col:area", "col:gazetteer", "col:establishmentMeans", "col:threatStatus"),
    ("S1", "IN", "India", "iso", "native", "endangered"),
    ("S1", "RU", "", "iso", "", ""),          # area text missing: must still be kept
    ("S2", "", "", "", "", ""),               # nothing usable: dropped
]


def write_tsv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        for r in rows:
            f.write("\t".join(r) + "\n")


class HashAndNormaliseTests(unittest.TestCase):
    def test_djb2_matches_js(self):
        js = ("function d(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))>>>0}return h}"
              "console.log(['4CGXQ','6MB3T','S','𝔘x','ñ'].map(d).join(','))")
        try:
            out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
        except (FileNotFoundError, subprocess.CalledProcessError):
            self.skipTest("node not available")
        expected = [int(x) for x in out.strip().split(",")]
        self.assertEqual([pd.djb2(s) for s in ["4CGXQ", "6MB3T", "S", "𝔘x", "ñ"]], expected)

    def test_normalise(self):
        self.assertEqual(pd.normalise("Panthéra  Tígris"), "panthera tigris")
        self.assertEqual(pd.normalise("Zoe's Imperial-Pigeon"), "zoe s imperial-pigeon")
        self.assertEqual(pd.normalise(""), "")

    def test_prefix_filename(self):
        self.assertEqual(pd.prefix_filename("pa n"), "pa_n")
        self.assertEqual(pd.prefix_filename("ほ"), "u307b")

    def test_link_prefix(self):
        self.assertEqual(pd.link_prefix("https://x.org/a?id=12"), "https://x.org/a?id=")
        self.assertEqual(pd.link_prefix("https://x.org/taxon/12"), "https://x.org/taxon/")


class EndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.inp, cls.out = root / "in", root / "out"
        cls.inp.mkdir()
        write_tsv(cls.inp / "NameUsage.tsv", NAME_USAGE)
        write_tsv(cls.inp / "VernacularName.tsv", VERNACULAR)
        write_tsv(cls.inp / "Distribution.tsv", DISTRIBUTION)
        (cls.inp / "metadata.yaml").write_text("---\ntitle: Catalogue of Life\nalias: TEST\nversion: 2026-01-01 XR\ndoi: 10.1/abc\n")
        pd.LINK_PREFIX_MIN = 2
        rc = pd.main(["--input", str(cls.inp), "--output", str(cls.out)])
        assert rc == 0

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def load(self, rel):
        return json.loads((self.out / rel).read_text(encoding="utf-8"))

    def core(self, rid):
        return self.load(f"taxa/{pd.shard_for(rid, pd.CORE_SHARDS)}.json")[rid]

    def test_meta(self):
        meta = self.load("meta.json")
        self.assertEqual(meta["schema"], 2)
        self.assertEqual(meta["dataset"]["alias"], "TEST")
        self.assertEqual(meta["counts"]["nameUsages"], 11)
        self.assertEqual(meta["counts"]["acceptedSpecies"], 3)   # BIN and synonym excluded
        self.assertEqual(meta["counts"]["synonyms"], 1)
        self.assertEqual(meta["counts"]["bins"], 1)
        self.assertEqual([r["n"] for r in meta["roots"]], ["Eukaryota"])
        self.assertEqual(meta["counts"]["orphanHigherTaxa"], 1)
        self.assertEqual(meta["counts"]["distributions"], 2)
        self.assertIn("https://x.org/a?id=", meta["linkPrefixes"])

    def test_core_record(self):
        s1 = self.core("S1")
        meta = self.load("meta.json")
        self.assertEqual(meta["ranks"][s1["r"]], "species")
        self.assertNotIn("s", s1)                 # accepted → status omitted
        self.assertEqual(s1["p"], "G1")
        self.assertEqual(s1["nc"], 2)             # BIN + subspecies are accepted children
        self.assertEqual(s1["ns"], 1)             # Felis tigris
        self.assertEqual(s1["nv"], 5)             # distinct names, duplicate collapsed
        self.assertEqual(s1["nd"], 2)
        self.assertEqual(s1["l"], [0, "3"])       # dictionary-encoded link
        self.assertNotIn("x", s1)
        self.assertEqual(self.core("S3")["x"], 1)
        y1 = self.core("Y1")
        self.assertEqual(meta["statuses"][y1["s"]], "synonym")
        self.assertEqual(self.core("B1")["b"], 1)
        self.assertEqual(self.core("B1")["m"], 1)

    def test_higher_chain(self):
        g1 = self.load(f"higher/{pd.shard_for('G1', pd.HIGHER_SHARDS)}.json")["G1"]
        self.assertEqual([a[1] for a in g1["A"]], ["Eukaryota", "Animalia", "Felidae"])
        self.assertEqual(g1["nc"], 3)
        self.assertEqual(self.core("G1")["h"], 1)
        self.assertNotIn("h", self.core("S1"))    # species are never "higher"

    def test_kids(self):
        kids = self.load(f"kids/{pd.shard_for('G1', pd.KIDS_SHARDS)}.json")["G1"]
        self.assertEqual([k[1] for k in kids["c"]], ["Panthera atrox", "Panthera leo", "Panthera tigris"])
        s1 = self.load(f"kids/{pd.shard_for('S1', pd.KIDS_SHARDS)}.json")["S1"]
        self.assertEqual([k[1] for k in s1["c"]], ["Panthera tigris altaica", "BOLD:AAA0001"])  # BIN last
        self.assertEqual([k[1] for k in s1["s"]], ["Felis tigris"])

    def test_detail(self):
        d = self.load(f"detail/{pd.shard_for('S1', pd.CORE_SHARDS)}.json")["S1"]
        self.assertEqual([v[0] for v in d["v"]], ["Tiger", "Bengal tiger", "Bagh", "Tigre", "虎"])  # eng first; broad source outranks one-off
        self.assertEqual(len(d["d"]), 2)
        self.assertEqual(d["d"][1][1], "RU")      # kept via areaID

    def test_search(self):
        manifest = self.load("search/manifest.json")["shards"]
        self.assertIn("p", manifest)
        p = self.load("search/p.json")
        names = [e[1] for e in p]
        self.assertIn("Panthera tigris", names)
        self.assertNotIn("BOLD:AAA0001", names)
        self.assertEqual(names[0], "Panthera")    # genus outranks species
        t = self.load("search/t.json")
        tokens = [e for e in t if e[3] == pd.KIND_TOKEN]
        self.assertTrue(any(e[1] == "Panthera tigris" and e[4] == "tigris" for e in tokens))
        self.assertTrue(any(e[1] == "Tiger" and e[3] == pd.KIND_VERNACULAR and e[4] == "Panthera tigris" for e in t))


if __name__ == "__main__":
    unittest.main()
