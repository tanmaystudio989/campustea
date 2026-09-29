"""Minimal password hashing.

Uses Python's built-in hashlib (PBKDF2) so there's no extra dependency to
install. Good enough for learning and small real-world use. If you take this
app further, consider switching to a dedicated library like passlib/bcrypt
and always serve the app over HTTPS in production.
"""

import hashlib
import hmac
import secrets

_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest_hex = stored_hash.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)
