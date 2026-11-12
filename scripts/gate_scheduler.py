"""Dependency-aware parallel scheduler for the gate runner.

Gates run concurrently up to the host's core count; a gate listed in ``after``
waits for those gates to finish first. When a dependency fails, its dependents
are reported BLOCKED instead of running against a known-broken tree — the
overall verdict is already non-zero, and a dependent run would only burn
minutes reproducing the same conclusion.
"""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass

SATISFIED = frozenset({"PASS", "CACHED", "SKIP"})
FINISHED = frozenset({"PASS", "FAIL", "CACHED", "SKIP", "BLOCKED"})


@dataclass(slots=True)
class Unit:
    """One schedulable job: a display name, its dependencies and its action."""

    name: str
    after: tuple[str, ...]
    # Runs once dependencies are satisfied; returns (status, note).
    action: Callable[[], tuple[str, str | None]]
    status: str = "PENDING"


def run_all(
    units: list[Unit], jobs: int, announce=None
) -> dict[str, str]:
    """Run ``units`` in parallel honouring ``after``; returns name → status."""
    by_name = {unit.name: unit for unit in units}
    missing = {dep for unit in units for dep in unit.after} - set(by_name)
    if missing:
        message = f"unknown gate dependencies: {', '.join(sorted(missing))}"
        raise ValueError(message)

    statuses: dict[str, str] = {}
    unsubmitted = list(units)
    futures: dict[Future, Unit] = {}
    with ThreadPoolExecutor(max_workers=jobs) as pool:

        def submit_ready() -> None:
            for unit in list(unsubmitted):
                deps_done = all(by_name[dep].status in FINISHED for dep in unit.after)
                if not deps_done:
                    continue
                unsubmitted.remove(unit)
                if all(by_name[dep].status in SATISFIED for dep in unit.after):
                    futures[pool.submit(unit.action)] = unit
                else:
                    failed = next(
                        dep for dep in unit.after if by_name[dep].status not in SATISFIED
                    )
                    unit.status = statuses[unit.name] = "BLOCKED"
                    if announce is not None:
                        announce(f"  BLOCKED  {unit.name}  (dependency {failed} not satisfied)")

        submit_ready()
        while futures:
            done, _ = wait(tuple(futures), return_when=FIRST_COMPLETED)
            for future in done:
                unit = futures.pop(future)
                try:
                    status, _note = future.result()
                except BaseException as error:  # noqa: BLE001 - one gate's crash
                    status = "FAIL"  # must not take down the others
                    print(f"  ! {unit.name}: gate runner error: {error}", flush=True)
                unit.status = statuses[unit.name] = status
            submit_ready()
        if unsubmitted:
            names = ", ".join(unit.name for unit in unsubmitted)
            message = f"gate dependency cycle involving: {names}"
            raise ValueError(message)
    return statuses
