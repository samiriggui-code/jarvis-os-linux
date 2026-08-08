#!/usr/bin/env python3
"""Répare les phrases vocales enrôlées → challenge canonique."""
from jarvis_core.auth.db import default_data_dir
from jarvis_core.auth.user_manager import UserManager
from jarvis_core.auth.voice_phrase import DEFAULT_CHALLENGE, load_phrase, save_phrase

users_dir = default_data_dir() / "users"
for row in UserManager().list_users():
    if not row.voice_enrolled:
        continue
    old = load_phrase(users_dir, row.id)
    samples = (old or {}).get("samples") or []
    save_phrase(users_dir, row.id, phrase=DEFAULT_CHALLENGE, samples=samples)
    print("fixed", row.username)
