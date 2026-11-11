"""Mesin form: mengevaluasi kondisi tampil, pilihan dinamis, dan memvalidasi isian sesuai app/forms.py.
Logika yang sama dipakai aplikasi HP (apps/web/features/field/engine.ts) agar hasilnya selalu sama."""
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

MAX_TEXT, MAX_LONG, MAX_NUMBER, MAX_PACKS = 200, 1000, 100_000_000, 10_000


def norm(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def title_case(s: str) -> str:
    """Kata yang diketik huruf kecil semua dijadikan Kapital; ejaan seperti "L.A Lights" dibiarkan."""
    return " ".join(w[0].upper() + w[1:] if w and w == w.lower() else w for w in norm(s).split(" "))


def val(o: Any) -> Any:
    return o[0] if isinstance(o, (list, tuple)) else o


def lab(o: Any) -> Any:
    return o[1] if isinstance(o, (list, tuple)) else o


def sum_variants(m: Any) -> float:
    return sum(float(v or 0) for v in (m or {}).values()) if isinstance(m, dict) else 0


def options_of(q: dict, a: dict, variants: list[str]) -> list:
    o = q.get("options")
    if o is None:
        return []
    if isinstance(o, dict) and "by" in o:
        return o["map"].get(str(a.get(o["by"])), [])
    if isinstance(o, dict) and o.get("variants"):
        return list(variants) + list(o.get("extra", []))
    return o


def cond(c: dict | None, a: dict) -> bool:
    if not c:
        return True
    if "all" in c:
        return all(cond(x, a) for x in c["all"])
    if "any" in c:
        return any(cond(x, a) for x in c["any"])
    v = a.get(c["f"])
    if "sum_gt" in c:
        return sum_variants(v) > c["sum_gt"]
    if "sum_eq" in c:
        return sum_variants(v) == c["sum_eq"]
    if "eq" in c:
        return v == c["eq"]
    if "ne" in c:
        return bool(v) and v != c["ne"]
    if "in" in c:
        return v in c["in"]
    return bool(v)


@dataclass
class Ctx:
    variants: list[str]
    kecamatan: Callable[[str], dict | None]  # kode → objek kecamatan resmi atau None
    photo_ok: Callable[[str], bool] = lambda _id: False
    errors: dict = field(default_factory=dict)


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise ValueError("Isi pakai angka ya")
    if n < 0 or n > MAX_NUMBER:
        raise ValueError("Angka tidak wajar")
    return int(n) if n.is_integer() else n


def clean(questions: list[dict], raw: dict | None, ctx: Ctx, strict: bool = True) -> tuple[dict, dict]:
    """Kembalikan (isian bersih, kesalahan). Jawaban pertanyaan yang tidak tampil atau tidak dikenal dibuang."""
    raw = raw if isinstance(raw, dict) else {}
    out: dict = {}
    errs: dict = {}
    for q in questions:
        qid, t = q["id"], q["type"]
        if not cond(q.get("show"), out):  # kondisi dihitung dari jawaban sebelumnya yang sudah bersih
            continue
        v = raw.get(qid)
        try:
            if t in ("single",):
                opts = [val(o) for o in options_of(q, out, ctx.variants)]
                v = v if v in opts else None
            elif t == "multi":
                opts = [val(o) for o in options_of(q, out, ctx.variants)]
                v = [x for x in (v or []) if x in opts] or None
            elif t in ("text", "textarea"):
                v = norm(v)[: MAX_LONG if t == "textarea" else MAX_TEXT] or None
                if v and q.get("titlecase"):
                    v = title_case(v)
            elif t == "number":
                v = _num(v)
            elif t == "variants":
                v = {k: max(0, min(MAX_PACKS, int(_num((v or {}).get(k)) or 0))) for k in ctx.variants} if isinstance(v, dict) else None
            elif t == "stok":
                ok = [val(o) for o in q["options"]]
                v = {k: v[k] for k in ctx.variants if isinstance(v, dict) and v.get(k) in ok} or None
                if strict and q.get("required") and (not v or len(v) < len(ctx.variants)):
                    errs[qid] = "Pilih stok tiap varian dulu ya"
            elif t == "confirm":
                v = True if v is True else None
            elif t == "kecamatan":
                kode = v.get("kode") if isinstance(v, dict) else v
                v = ctx.kecamatan(str(kode)) if kode else None
                if kode and not v:
                    errs[qid] = "Kecamatannya nggak ada di daftar"
            elif t == "photo":
                pid = v.get("id") if isinstance(v, dict) else v
                v = {"id": pid} if pid and ctx.photo_ok(str(pid)) else ({"sample": True} if isinstance(v, dict) and v.get("sample") else None)
                if pid and not v:
                    errs[qid] = "Fotonya nggak ketemu, ambil ulang ya"
            elif t == "brandcounts":
                rows = []
                for r in (v or [])[: q.get("rows", 3)]:
                    m = title_case(r.get("merek", "")) if isinstance(r, dict) else ""
                    if m:
                        rows.append({"merek": m[:MAX_TEXT], "batang": _num(r.get("batang"))})
                v = rows or None
            else:
                v = None
        except ValueError as e:
            errs[qid] = str(e)
            v = None
        if v is not None:
            out[qid] = v
        if strict and q.get("required") and v is None and qid not in errs:
            errs[qid] = {"confirm": "Centang dulu ya", "single": "Pilih salah satu dulu", "kecamatan": "Pilih kecamatannya dari daftar", "photo": "Ambil foto dulu"}.get(t, "Ini belum diisi")
        rules = q.get("rules") or {}
        if v is not None and "min" in rules and isinstance(v, (int, float)) and v < rules["min"]:
            errs[qid] = rules.get("min_message", f"Minimal {rules['min']}")
        if v is not None and "lte_field" in rules and isinstance(out.get(rules["lte_field"]), (int, float)) and v > out[rules["lte_field"]]:
            errs[qid] = rules.get("lte_message", "Terlalu besar")
    return out, errs
