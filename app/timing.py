"""Per-request timings for the dashboard API.

A request stores one mutable record in a context variable. SQLite calls add
their wait (including the pipeline lock) to that record, and handlers add
named stages. The timing middleware reads the same object when the response
starts. Outside a request the record is missing and recording is a no-op.
"""

import contextvars
import logging
import threading
import time
from contextlib import contextmanager
from typing import Iterator, List, Optional, Tuple

# Uvicorn leaves the root logger at WARNING, which drops these lines.
# A dedicated handler keeps one timing line visible under uvicorn and the CLI.
log = logging.getLogger("app.timing")
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

_current: contextvars.ContextVar[Optional["RequestTiming"]] = contextvars.ContextVar(
    "jobspy_request_timing", default=None
)


class RequestTiming:
    """Database time and named stages for the request that created it."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.db_ms = 0.0
        self.queries = 0
        self.stages: List[Tuple[str, float]] = []

    def add_db(self, milliseconds: float) -> None:
        with self._lock:
            self.db_ms += milliseconds
            self.queries += 1

    def add_stage(self, name: str, milliseconds: float) -> None:
        with self._lock:
            self.stages.append((name, milliseconds))

    def snapshot(self) -> Tuple[float, int, List[Tuple[str, float]]]:
        with self._lock:
            return self.db_ms, self.queries, list(self.stages)


def begin_request() -> RequestTiming:
    """Start a timing record for the current request and return it."""
    timing = RequestTiming()
    _current.set(timing)
    return timing


def record_db(milliseconds: float) -> None:
    """Add one SQLite call, including time spent waiting for the lock."""
    timing = _current.get()
    if timing is not None:
        timing.add_db(milliseconds)


@contextmanager
def stage(name: str) -> Iterator[None]:
    """Record wall time for one named step of the current request."""
    started = time.perf_counter()
    try:
        yield
    finally:
        timing = _current.get()
        if timing is not None:
            timing.add_stage(name, (time.perf_counter() - started) * 1000)


def server_timing_header(timing: RequestTiming, total_ms: float) -> str:
    """Server-Timing value. Durations are milliseconds, per the header spec."""
    db_ms, _queries, stages = timing.snapshot()
    parts = [f"total;dur={total_ms:.1f}", f"db;dur={db_ms:.1f}"]
    for name, milliseconds in stages:
        parts.append(f"{name};dur={milliseconds:.1f}")
    return ", ".join(parts)
