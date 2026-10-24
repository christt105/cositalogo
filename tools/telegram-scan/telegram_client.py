import os
from pathlib import Path

from telethon import TelegramClient

DEFAULT_SESSION = Path.home() / ".cositalogo-telegram"


def session_path():
    """Telethon session file (without the .session suffix), from COSITALOGO_TG_SESSION."""
    return os.environ.get("COSITALOGO_TG_SESSION", str(DEFAULT_SESSION))


def _env(key):
    return os.environ[key].strip().strip("'\"")


def build_client():
    return TelegramClient(session_path(), int(_env("TELEGRAM_API_ID")), _env("TELEGRAM_API_HASH"))
