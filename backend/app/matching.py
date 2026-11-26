"""Match extracted certificate details against the customer register."""

from rapidfuzz import fuzz, process, utils
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Customer

NAME_CUTOFF = 60


def name_similarity(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return max(
        fuzz.token_sort_ratio(a, b, processor=utils.default_process),
        fuzz.token_set_ratio(a, b, processor=utils.default_process) * 0.95,
    )


def _scorer(a, b, **kwargs):
    return max(fuzz.token_sort_ratio(a, b, **kwargs), fuzz.token_set_ratio(a, b, **kwargs) * 0.95)


def find_candidates(db: Session, emirates_id: str | None, name: str | None, limit: int = 5) -> list[dict]:
    found: dict[int, dict] = {}

    if emirates_id:
        c = db.scalar(select(Customer).where(Customer.emirates_id == emirates_id))
        if c:
            ns = name_similarity(name, c.full_name) if name else None
            if ns is None or ns >= 80:
                score, note = 100.0, "Emirates ID and name match" if ns is not None else "Emirates ID match"
            else:
                score, note = 90.0, f"Emirates ID match, name differs ({ns:.0f}% similar)"
            found[c.id] = {"customer": c, "score": score, "method": "emirates_id", "name_score": ns, "note": note}

    if name:
        rows = db.execute(select(Customer.id, Customer.full_name)).all()
        choices = {r.id: r.full_name for r in rows}
        for _, score, cid in process.extract(
            name, choices, scorer=_scorer, processor=utils.default_process, limit=limit + 1, score_cutoff=NAME_CUTOFF
        ):
            if cid in found:
                continue
            c = db.get(Customer, cid)
            note = "Name match" if score >= 92 else f"Similar name ({score:.0f}%)"
            if emirates_id and c.emirates_id != emirates_id:
                note += ", Emirates ID differs"
                score = min(score, 85.0)
            found[cid] = {"customer": c, "score": round(float(score), 1), "method": "name", "name_score": score, "note": note}

    return sorted(found.values(), key=lambda x: x["score"], reverse=True)[:limit]


def pick_auto_match(candidates: list[dict], emirates_id: str | None) -> dict | None:
    if not candidates:
        return None
    best = candidates[0]
    if best["method"] == "emirates_id":
        return best
    # Name only match is accepted automatically when it is strong and unambiguous
    # and the certificate carries no conflicting Emirates ID.
    if emirates_id is None and best["score"] >= 92:
        runner_up = candidates[1]["score"] if len(candidates) > 1 else 0
        if best["score"] - runner_up >= 8:
            return best
    return None
