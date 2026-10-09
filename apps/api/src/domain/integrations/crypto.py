import base64
import json
from itertools import cycle
from typing import cast

from infrastructure.auth.settings import settings


def encrypt(data: dict[str, object]) -> str:
    raw = json.dumps(data, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(_xor(raw)).decode("ascii")


def decrypt(data: str) -> dict[str, object]:
    raw = _xor(base64.urlsafe_b64decode(data.encode("ascii")))
    value = cast(object, json.loads(raw.decode()))
    if not isinstance(value, dict):
        msg = "encrypted credentials must decode to an object"
        raise ValueError(msg)
    return cast(dict[str, object], value)


def _xor(data: bytes) -> bytes:
    key = settings.jwt_secret.encode() or b"change-me-to-a-random-secret"
    return bytes(byte ^ key_byte for byte, key_byte in zip(data, cycle(key), strict=False))
