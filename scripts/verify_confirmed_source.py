from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import cast

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "docs" / "confirmed-source-ledger.json"
DESIGN = ROOT / "docs" / "confirmed-source-design.txt"
CONFIRMATION = ROOT / "docs" / "confirmed-source-confirmation.txt"
EXAMPLES = ROOT / "docs" / "run-session-examples.md"
SESSION = Path(
    "/home/ubuntu/.pi/agent/sessions/"
    "--home-ubuntu-workspace-code-running-man--/"
    "2026-11-09T15-29-59-469Z_01a1c0ee-36ad-727d-8e4d-fbf40ea497d9.jsonl"
)


class SourceVerificationError(RuntimeError):
    pass


def _decode(text: str) -> dict[str, object]:
    value = json.JSONDecoder().decode(text)
    if not isinstance(value, dict):
        raise SourceVerificationError("expected a JSON object")
    return cast(dict[str, object], value)


def _object(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise SourceVerificationError("expected an object")
    return cast(dict[str, object], value)


def _number(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SourceVerificationError("expected an integer")
    return value


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _prefix_lines(path: Path, count: int) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return text.splitlines(keepends=True)[:count]


def main() -> int:
    ledger = _decode(LEDGER.read_text(encoding="utf-8"))
    design = _object(ledger["design"])
    confirmation = _object(ledger["confirmation"])
    session_path = Path(str(ledger["session_path"]))
    assert session_path == SESSION
    design_number = _number(design["jsonl_line"])
    confirmation_number = _number(confirmation["jsonl_line"])
    last_line = max(design_number, confirmation_number)
    assert _number(ledger["session_prefix_last_line"]) == last_line

    design_text = DESIGN.read_text(encoding="utf-8")
    confirmation_text = CONFIRMATION.read_text(encoding="utf-8")
    assert confirmation_text == confirmation["text"]
    assert _sha256(design_text) == design["text_sha256"]
    assert len(design_text) == _number(design["text_length"])
    assert _sha256(confirmation_text) == confirmation["text_sha256"]
    assert len(confirmation_text) == _number(confirmation["text_length"])
    assert confirmation["parent_id"] == design["message_id"]
    assert ledger["parent_chain"] == [design["message_id"], confirmation["message_id"]]

    document = EXAMPLES.read_text(encoding="utf-8")
    source_examples = ledger["source_examples"]
    assert isinstance(source_examples, list)
    for item in source_examples:
        row = _object(item)
        example = str(row["text"])
        offset = _number(row["offset"])
        assert design_text.find(example) == offset
        assert example in document

    session_checked = False
    if SESSION.is_file():
        lines = _prefix_lines(SESSION, last_line)
        assert len(lines) == last_line
        prefix = hashlib.sha256()
        for raw_line in lines:
            prefix.update(raw_line.encode("utf-8"))
        assert prefix.hexdigest() == ledger["session_prefix_through_confirmation_sha256"]
        design_line = lines[design_number - 1]
        confirmation_line = lines[confirmation_number - 1]
        assert _sha256(design_line) == design["raw_line_sha256"]
        assert _sha256(confirmation_line) == confirmation["raw_line_sha256"]
        design_entry = _decode(design_line)
        confirmation_entry = _decode(confirmation_line)
        assert str(confirmation_entry["parentId"]) == str(design_entry["id"])
        assert ledger["parent_chain"] == [design_entry["id"], confirmation_entry["id"]]
        design_message = _object(design_entry["message"])
        confirmation_message = _object(confirmation_entry["message"])
        assert design_message["role"] == design["role"] == "assistant"
        assert confirmation_message["role"] == confirmation["role"] == "user"
        confirmation_content = confirmation_message["content"]
        assert isinstance(confirmation_content, list)
        confirmation_first = _object(confirmation_content[0])
        assert confirmation_first["text"] == confirmation_text
        session_checked = True

    print(
        json.dumps(
            {
                "status": "ok",
                "design_message": design["message_id"],
                "confirmation_message": confirmation["message_id"],
                "source_examples": len(source_examples),
                "session_record_checked": session_checked,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
