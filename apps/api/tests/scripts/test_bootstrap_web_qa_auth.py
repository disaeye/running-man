import importlib.util
import json
import re
import stat
import sys
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType, TracebackType
from uuid import UUID

import pytest

ROOT = Path(__file__).parents[4]
SCRIPT = ROOT / "scripts" / "bootstrap_web_qa_auth.py"
SELECTOR_SQL = """
SELECT a.id FROM athletes a LEFT JOIN activity_summary x ON x.athlete_id = a.id GROUP BY a.id ORDER BY count(x.activity_id) DESC, a.id ASC LIMIT 1
""".strip()
JWT_PATTERN = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
UUID_PATTERN = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+")
DB_URL_PATTERN = re.compile(r"postgres(?:ql)?://", re.IGNORECASE)


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("bootstrap_web_qa_auth", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@dataclass(slots=True)
class FakeCursor:
    athlete_id: UUID | None
    queries: list[str] = field(default_factory=list)

    def execute(self, query: str) -> None:
        self.queries.append(" ".join(query.split()))
        first_word = query.strip().split(maxsplit=1)[0].upper()
        assert first_word == "SELECT"
        assert all(term not in query.lower() for term in ("password_hash", "insert", "update", "delete"))

    def fetchone(self) -> tuple[UUID] | tuple[int] | None:
        query = self.queries[-1]
        if "FROM athletes a LEFT JOIN activity_summary" in query:
            return (self.athlete_id,) if self.athlete_id else None
        return (1,)

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None


@dataclass(slots=True)
class FakeTransaction:
    force_rollback: bool

    def __enter__(self) -> "FakeTransaction":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None


@dataclass(slots=True)
class FakeConnection:
    athlete_id: UUID | None
    cursor_obj: FakeCursor = field(init=False)
    read_only: bool = False
    force_rollback: bool = False

    def __post_init__(self) -> None:
        self.cursor_obj = FakeCursor(self.athlete_id)

    def set_read_only(self, value: bool) -> None:
        self.read_only = value

    def transaction(self, *, force_rollback: bool) -> FakeTransaction:
        self.force_rollback = force_rollback
        return FakeTransaction(force_rollback)

    def cursor(self) -> FakeCursor:
        assert self.read_only is True
        return self.cursor_obj

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None


def config(module: ModuleType, tmp_path: Path, *, validate_only: bool, state_path: Path | None = None):
    return module.BootstrapConfig(
        validate_only=validate_only,
        storage_state_path=state_path or tmp_path / "e2e" / ".auth" / "storageState.json",
        api_url="http://localhost:28801/api/v1/athletes/me",
        database_url="postgresql://user:password@localhost/db",
        jwt_secret="super-secret-value",
    )


def deps(module: ModuleType, conn: FakeConnection, status_code: int = 200):
    return module.BootstrapDeps(
        connect=lambda _database_url: conn,
        mint_token=lambda _athlete_id, _secret: "eyJheader.payload.signature",
        get_status=lambda _url, _token: status_code,
    )


def test_selector_uses_exact_read_only_deterministic_query(tmp_path: Path) -> None:
    # Given
    module = load_script()
    athlete_id = UUID("22222222-2222-4222-8222-222222222222")
    conn = FakeConnection(athlete_id)

    # When
    report = module.run_bootstrap(config(module, tmp_path, validate_only=True), deps(module, conn))

    # Then
    assert report.athlete_selected is True
    assert conn.read_only is True
    assert conn.force_rollback is True
    assert SELECTOR_SQL in conn.cursor_obj.queries


def test_empty_athlete_result_fails_before_token_http_or_storage(tmp_path: Path) -> None:
    # Given
    module = load_script()
    conn = FakeConnection(None)
    calls: list[str] = []

    def _mint_token(athlete_id: object, secret: object) -> str:
        calls.append("token")
        return "token"

    def _get_status(url: object, token: object) -> int:
        calls.append("http")
        return 200

    fake_deps = module.BootstrapDeps(
        connect=lambda _database_url: conn,
        mint_token=_mint_token,
        get_status=_get_status,
    )

    # When / Then
    with pytest.raises(module.NoAthleteSelectedError):
        module.run_bootstrap(config(module, tmp_path, validate_only=False), fake_deps)
    assert calls == []
    assert not (tmp_path / "e2e" / ".auth" / "storageState.json").exists()


def test_empty_athlete_result_preserves_existing_storage_state(tmp_path: Path) -> None:
    # Given
    module = load_script()
    state_path = tmp_path / "e2e" / ".auth" / "storageState.json"
    state_path.parent.mkdir(parents=True)
    state_path.write_text("existing-state", encoding="utf-8")

    # When / Then
    with pytest.raises(module.NoAthleteSelectedError):
        module.run_bootstrap(
            config(module, tmp_path, validate_only=False, state_path=state_path),
            deps(module, FakeConnection(None)),
        )
    assert state_path.read_text(encoding="utf-8") == "existing-state"


def test_validate_only_preserves_existing_storage_state(tmp_path: Path) -> None:
    # Given
    module = load_script()
    state_path = tmp_path / "e2e" / ".auth" / "storageState.json"
    cfg = config(module, tmp_path, validate_only=True, state_path=state_path)
    state_path.parent.mkdir(parents=True)
    state_path.write_bytes(b"existing-state")

    # When
    report = module.run_bootstrap(
        cfg,
        deps(module, FakeConnection(UUID("33333333-3333-4333-8333-333333333333"))),
    )

    # Then
    assert report.storage_state_written is False
    assert state_path.read_bytes() == b"existing-state"


def test_default_mode_writes_access_only_state_with_private_modes(tmp_path: Path) -> None:
    # Given
    module = load_script()
    state_path = tmp_path / "e2e" / ".auth" / "storageState.json"
    cfg = config(module, tmp_path, validate_only=False, state_path=state_path)
    state_path.parent.mkdir(parents=True)
    state_path.write_text("old", encoding="utf-8")

    # When
    report = module.run_bootstrap(
        cfg,
        deps(module, FakeConnection(UUID("44444444-4444-4444-8444-444444444444"))),
    )
    state = json.loads(state_path.read_text(encoding="utf-8"))

    # Then
    assert report.storage_state_written is True
    assert stat.S_IMODE(state_path.parent.stat().st_mode) == 0o700
    assert stat.S_IMODE(state_path.stat().st_mode) == 0o600
    assert state["origins"] == []
    assert [cookie["name"] for cookie in state["cookies"]] == ["access_token"]
    assert "refresh_token" not in state_path.read_text(encoding="utf-8")
    assert all(secret not in state_path.read_text(encoding="utf-8") for secret in ("email", "password"))


def test_forbids_password_hash_arbitrary_athlete_and_auth_mutation_paths() -> None:
    # Given
    module = load_script()
    source = SCRIPT.read_text(encoding="utf-8")

    # When / Then
    assert module.SELECT_ATHLETE_SQL == SELECTOR_SQL
    assert "password_hash" not in module.SELECT_ATHLETE_SQL.lower()
    assert "create_refresh_token" not in source
    assert all(path not in source for path in ("/register", "/login", "/refresh", "/logout"))
    with pytest.raises(SystemExit):
        module.parse_args(("--athlete-id", "44444444-4444-4444-8444-444444444444"))


def test_stdout_report_redacts_tokens_identity_secrets_and_database_urls() -> None:
    # Given
    module = load_script()
    report = module.BootstrapReport(
        athlete_count_before=1,
        athlete_count_after=1,
        login_attempt_count_before=1,
        login_attempt_count_after=1,
        revoked_token_count_before=1,
        revoked_token_count_after=1,
        athlete_selected=True,
        http_status=200,
        storage_state_written=False,
    )

    # When
    output = module.report_json(report)

    # Then
    assert not JWT_PATTERN.search(output)
    assert not UUID_PATTERN.search(output)
    assert not EMAIL_PATTERN.search(output)
    assert not DB_URL_PATTERN.search(output)
    assert "secret" not in output.lower()


def test_mint_access_token_suppresses_only_pyjwt_key_length_warning() -> None:
    # Given
    module = load_script()

    class KnownWarning(Warning):
        pass

    class OtherWarning(Warning):
        pass

    def emits_known(_athlete_id: UUID, _secret: str) -> str:
        warnings.warn("The HMAC key is 28 bytes long", KnownWarning, stacklevel=1)
        return "token"

    def emits_other(_athlete_id: UUID, _secret: str) -> str:
        warnings.warn("different warning", OtherWarning, stacklevel=1)
        return "token"

    # When
    token = module.mint_access_token_silencing_pyjwt_key_length(
        UUID("66666666-6666-4666-8666-666666666666"),
        "short-secret",
        emits_known,
        KnownWarning,
    )

    # Then
    assert token == "token"
    with pytest.warns(OtherWarning):
        module.mint_access_token_silencing_pyjwt_key_length(
            UUID("77777777-7777-4777-8777-777777777777"),
            "short-secret",
            emits_other,
            KnownWarning,
        )


def test_bad_storage_parent_keeps_prior_state_unmodified(tmp_path: Path) -> None:
    # Given
    module = load_script()
    blocked_parent = tmp_path / "blocked"
    _ = blocked_parent.write_text("not-a-dir", encoding="utf-8")
    cfg = module.BootstrapConfig(
        validate_only=False,
        storage_state_path=blocked_parent / "storageState.json",
        api_url="http://localhost:28801/api/v1/athletes/me",
        database_url="postgresql://user:password@localhost/db",
        jwt_secret="super-secret-value",
    )

    # When / Then
    with pytest.raises(NotADirectoryError):
        module.run_bootstrap(
            cfg,
            deps(module, FakeConnection(UUID("55555555-5555-4555-8555-555555555555"))),
        )
    assert blocked_parent.read_text(encoding="utf-8") == "not-a-dir"
