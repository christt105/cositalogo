"""Interactive login with a Telegram user account; asks for phone, code and 2FA password."""
import asyncio

from telegram_client import build_client, session_path


async def main():
    client = build_client()
    await client.start()
    me = await client.get_me()
    await client.disconnect()
    print(f"logged in as {me.first_name} ({me.id}), session saved to {session_path()}.session")


if __name__ == "__main__":
    asyncio.run(main())
