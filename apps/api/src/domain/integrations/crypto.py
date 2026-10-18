"""Encryption for credentials stored in `user_integrations.credentials`.

The key is derived from `JWT_SECRET`, so rotating that secret invalidates every
stored integration credential and the athlete has to enter the API key again.
That coupling is deliberate — one secret to manage — but a rotation without
re-entry breaks sync silently, which is why it is written down here.

AES-GCM with a random 12-byte nonce. `decrypt` raises `InvalidTag` on a wrong
key or a modified ciphertext; there is no fallback to a weaker format.
"""

from __future__ import annotations

import json
import os
from base64 import b64decode, b64encode
from hashlib import sha256
from typing import cast

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from infrastructure.auth.settings import settings

NONCE_BYTES = 12


def _aead() -> AESGCM:
    """Derive the 32-byte key from the whole secret, not a prefix of it."""
    return AESGCM(sha256(settings.jwt_secret.encode()).digest())


def encrypt(data: dict[str, object]) -> str:
    nonce = os.urandom(NONCE_BYTES)
    plaintext = json.dumps(data, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
    return b64encode(nonce + _aead().encrypt(nonce, plaintext, None)).decode("ascii")


def decrypt(data: str) -> dict[str, object]:
    raw = b64decode(data.encode("ascii"))
    nonce, ciphertext = raw[:NONCE_BYTES], raw[NONCE_BYTES:]
    value = cast(object, json.loads(_aead().decrypt(nonce, ciphertext, None).decode()))
    if not isinstance(value, dict):
        msg = "encrypted credentials must decode to an object"
        raise ValueError(msg)
    return cast("dict[str, object]", value)
