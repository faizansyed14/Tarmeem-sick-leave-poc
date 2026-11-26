"""Self hosted SVG captcha. Single use, short lived, stored in process memory."""

import secrets
import threading
import time

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TTL_SECONDS = 180

_store: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def _purge(now: float) -> None:
    for key in [k for k, (_, exp) in _store.items() if exp < now]:
        _store.pop(key, None)


def _rand(a: float, b: float) -> float:
    return a + (b - a) * secrets.randbelow(10_000) / 10_000


def _render(text: str) -> str:
    width, height = 180, 56
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#F4F3EF"/>',
    ]
    for _ in range(6):
        parts.append(
            f'<path d="M{_rand(0, 40):.1f} {_rand(5, 50):.1f} Q {_rand(50, 130):.1f} {_rand(0, 56):.1f} '
            f'{_rand(140, 180):.1f} {_rand(5, 50):.1f}" stroke="#{secrets.choice(["9CA3AF", "A8A29E", "7C9A94"])}" '
            f'stroke-width="{_rand(0.8, 1.8):.1f}" fill="none" opacity="0.7"/>'
        )
    for _ in range(30):
        parts.append(f'<circle cx="{_rand(0, width):.1f}" cy="{_rand(0, height):.1f}" r="{_rand(0.5, 1.4):.1f}" fill="#A8A29E"/>')
    step = (width - 30) / len(text)
    for i, ch in enumerate(text):
        x = 18 + i * step + _rand(-3, 3)
        y = 38 + _rand(-5, 5)
        rot = _rand(-22, 22)
        color = secrets.choice(["1F2937", "134E4A", "3F3F46", "0F5C55"])
        size = _rand(24, 30)
        parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="Georgia, serif" font-size="{size:.0f}" font-weight="600" '
            f'fill="#{color}" transform="rotate({rot:.1f} {x:.1f} {y:.1f})">{ch}</text>'
        )
    parts.append(
        f'<path d="M5 {_rand(20, 40):.1f} C 60 {_rand(0, 56):.1f}, 120 {_rand(0, 56):.1f}, 175 {_rand(20, 40):.1f}" '
        'stroke="#475569" stroke-width="1.4" fill="none" opacity="0.55"/>'
    )
    parts.append("</svg>")
    return "".join(parts)


def create() -> tuple[str, str]:
    text = "".join(secrets.choice(ALPHABET) for _ in range(5))
    cid = secrets.token_urlsafe(16)
    now = time.time()
    with _lock:
        _purge(now)
        _store[cid] = (text, now + TTL_SECONDS)
    return cid, _render(text)


def verify(cid: str, answer: str) -> bool:
    with _lock:
        entry = _store.pop(cid, None)
    if not entry:
        return False
    text, exp = entry
    if exp < time.time():
        return False
    return secrets.compare_digest(text, (answer or "").strip().upper())
