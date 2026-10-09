from __future__ import annotations

import http.client
import importlib
import json
import os
import sys
import tempfile
import time
import warnings
from collections.abc import Callable, Generator, Iterator, Sequence
from contextlib import AbstractContextManager
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final, Protocol, TypeAlias
from urllib.parse import urlparse
from uuid import UUID

ROOT: Final = Path(__file__).resolve().parents[1]
API_DIR: Final = ROOT / "apps" / "api"
API_SRC: Final = API_DIR / "src"
DEFAULT_STORAGE_STATE: Final = ROOT / "apps" / "web" / "e2e" / ".auth" / "storageState.json"
DEFAULT_API_URL: Final = "http://localhost:28801/api/v1/athletes/me"
SELECT_ATHLETE_SQL: Final = """
SELECT a.id FROM athletes a LEFT JOIN activity_summary x ON x.athlete_id = a.id GROUP BY a.id ORDER BY count(x.activity_id) DESC, a.id ASC LIMIT 1
""".strip()
COUNT_SQL: Final = {
    "athletes": "SELECT count(*) FROM athletes",
    "login_attempts": "SELECT count(*) FROM login_attempts",
    "revoked_tokens": "SELECT count(*) FROM revoked_tokens",
}
HTTP_TIMEOUT_SECONDS: Final = 10.0
ACCESS_TOKEN_TTL_SECONDS: Final = 15 * 60

class BootstrapError(Exception):
    pass


class NoAthleteSelectedError(BootstrapError):
    pass


class HttpValidationError(BootstrapError):
    pass


@dataclass(frozen=True, slots=True)
class BootstrapConfig:
    validate_only: bool
    storage_state_path: Path
    api_url: str
    database_url: str
    jwt_secret: str


@dataclass(frozen=True, slots=True)
class BootstrapReport:
    athlete_count_before: int
    athlete_count_after: int
    login_attempt_count_before: int
    login_attempt_count_after: int
    revoked_token_count_before: int
    revoked_token_count_after: int
    athlete_selected: bool
    http_status: int
    storage_state_written: bool


StorageState: TypeAlias = dict[str, list[dict[str, str | int | bool]] | list[str]]


class CursorLike(Protocol):
    def execute(self, query: str) -> None: ...
    def fetchone(self) -> tuple[UUID] | tuple[int] | None: ...


class ConnectionLike(Protocol):
    def set_read_only(self, value: bool) -> None: ...
    def transaction(self, *, force_rollback: bool) -> AbstractContextManager[object]: ...
    def cursor(self) -> AbstractContextManager[CursorLike]: ...


@dataclass(frozen=True, slots=True)
class BootstrapDeps:
    connect: Callable[[str], AbstractContextManager[ConnectionLike]]
    mint_token: Callable[[UUID, str], str]
    get_status: Callable[[str, str], int]


def parse_args(argv: Sequence[str]) -> tuple[bool, Path, str]:
    validate_only = False
    storage_state = DEFAULT_STORAGE_STATE
    api_url = DEFAULT_API_URL
    iterator = iter(argv)
    for arg in iterator:
        match arg:
            case "--validate-only":
                validate_only = True
            case "--storage-state":
                storage_state = Path(next_arg(iterator, arg))
            case "--api-url":
                api_url = next_arg(iterator, arg)
            case _:
                raise SystemExit(2)
    return validate_only, storage_state, api_url


def next_arg(iterator: Iterator[str], option: str) -> str:
    try:
        return next(iterator)
    except StopIteration as error:
        raise SystemExit(f"{option} requires a value") from error


@contextmanager
def api_settings_cwd() -> Generator[None, None, None]:
    current = Path.cwd()
    os.chdir(API_DIR)
    try:
        yield
    finally:
        os.chdir(current)


def load_config(argv: Sequence[str]) -> BootstrapConfig:
    validate_only, storage_state, api_url = parse_args(argv)
    with api_settings_cwd():
        sys.path.insert(0, str(API_SRC))
        settings_module = importlib.import_module("infrastructure.auth.settings")
        settings = settings_module.settings

        return BootstrapConfig(
            validate_only=validate_only,
            storage_state_path=storage_state.resolve(),
            api_url=api_url,
            database_url=settings.database_url,
            jwt_secret=settings.jwt_secret,
        )


def default_deps() -> BootstrapDeps:
    sys.path.insert(0, str(API_SRC))
    tokens_module = importlib.import_module("domain.auth.tokens")
    jwt_module = importlib.import_module("jwt")
    psycopg_module = importlib.import_module("psycopg")
    mint_token: Callable[[UUID, str], str] = tokens_module.create_access_token
    insecure_key_warning: type[Warning] = jwt_module.InsecureKeyLengthWarning
    connect: Callable[[str], AbstractContextManager[ConnectionLike]] = psycopg_module.connect

    return BootstrapDeps(
        connect=connect,
        mint_token=lambda athlete_id, secret: mint_access_token_silencing_pyjwt_key_length(
            athlete_id,
            secret,
            mint_token,
            insecure_key_warning,
        ),
        get_status=http_get_status,
    )


def mint_access_token_silencing_pyjwt_key_length(
    athlete_id: UUID,
    secret: str,
    mint_token: Callable[[UUID, str], str],
    warning_class: type[Warning],
) -> str:
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=".*HMAC key is .* bytes long.*",
            category=warning_class,
        )
        return mint_token(athlete_id, secret)


def count_table(cursor: CursorLike, table_name: str) -> int:
    cursor.execute(COUNT_SQL[table_name])
    row = cursor.fetchone()
    if row is None:
        return 0
    return int(row[0])


def select_athlete(cursor: CursorLike) -> UUID:
    cursor.execute(SELECT_ATHLETE_SQL)
    row = cursor.fetchone()
    if row is None:
        raise NoAthleteSelectedError
    return UUID(str(row[0]))


def run_bootstrap(config: BootstrapConfig, deps: BootstrapDeps) -> BootstrapReport:
    with deps.connect(config.database_url) as conn:
        conn.set_read_only(True)
        with conn.transaction(force_rollback=True), conn.cursor() as cursor:
            athlete_count_before = count_table(cursor, "athletes")
            login_attempt_count_before = count_table(cursor, "login_attempts")
            revoked_token_count_before = count_table(cursor, "revoked_tokens")
            athlete_id = select_athlete(cursor)
            access_token = deps.mint_token(athlete_id, config.jwt_secret)
            http_status = deps.get_status(config.api_url, access_token)
            if http_status != 200:
                raise HttpValidationError
            athlete_count_after = count_table(cursor, "athletes")
            login_attempt_count_after = count_table(cursor, "login_attempts")
            revoked_token_count_after = count_table(cursor, "revoked_tokens")
    if not config.validate_only:
        write_storage_state(config.storage_state_path, access_token)
    return BootstrapReport(
        athlete_count_before=athlete_count_before,
        athlete_count_after=athlete_count_after,
        login_attempt_count_before=login_attempt_count_before,
        login_attempt_count_after=login_attempt_count_after,
        revoked_token_count_before=revoked_token_count_before,
        revoked_token_count_after=revoked_token_count_after,
        athlete_selected=True,
        http_status=http_status,
        storage_state_written=not config.validate_only,
    )


def http_get_status(url: str, access_token: str) -> int:
    parsed = urlparse(url)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    connection = http.client.HTTPConnection(
        parsed.hostname or "localhost",
        parsed.port or 80,
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    try:
        connection.request("GET", path, headers={"Cookie": f"access_token={access_token}"})
        response = connection.getresponse()
        _ = response.read()
        return response.status
    finally:
        connection.close()


def storage_state(access_token: str) -> StorageState:
    return {
        "cookies": [
            {
                "name": "access_token",
                "value": access_token,
                "domain": "localhost",
                "path": "/",
                "expires": int(time.time()) + ACCESS_TOKEN_TTL_SECONDS,
                "httpOnly": True,
                "secure": False,
                "sameSite": "Lax",
            }
        ],
        "origins": [],
    }


def write_storage_state(path: Path, access_token: str) -> None:
    if path.parent.exists() and not path.parent.is_dir():
        raise NotADirectoryError(str(path.parent))
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    _ = path.parent.chmod(0o700)
    payload = json.dumps(storage_state(access_token), separators=(",", ":"), sort_keys=True)
    temp_name = ""
    fd, temp_name = tempfile.mkstemp(prefix=".storageState.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            _ = os.fchmod(temp_file.fileno(), 0o600)
            _ = temp_file.write(payload)
            _ = temp_file.write("\n")
        os.replace(temp_name, path)
        _ = path.chmod(0o600)
    finally:
        if temp_name and Path(temp_name).exists():
            Path(temp_name).unlink()


def report_json(report: BootstrapReport) -> str:
    return json.dumps(asdict(report), sort_keys=True)


def main(argv: Sequence[str]) -> int:
    try:
        report = run_bootstrap(load_config(argv), default_deps())
    except (BootstrapError, OSError) as error:
        print(json.dumps({"ok": False, "error": error.__class__.__name__}), file=sys.stderr)
        return 1
    print(report_json(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
