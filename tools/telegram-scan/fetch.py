"""Dump every message of some forum topics to JSON, one file per topic.

Usage:
  python fetch.py topics <group_id>
  python fetch.py dump <group_id> <topic_id> [<topic_id> ...] --out <dir>

`topics` lists the forum topics of a group. `dump` writes <dir>/<group>-<topic>.json
with every message of the topic (text, date, media and file metadata), oldest first.
"""
import argparse
import asyncio
import json
from pathlib import Path

from telethon.tl.functions.messages import GetForumTopicsRequest

from telegram_client import build_client


def channel_peer(group_id):
    """Bot-API style id (-100...) of a channel given as in its t.me/c links."""
    return int(f"-100{group_id}") if group_id > 0 else group_id


def media_info(msg):
    if msg.media is None:
        return None
    info = {"kind": type(msg.media).__name__}
    if msg.file is not None:
        info.update(
            name=msg.file.name,
            mime=msg.file.mime_type,
            size=msg.file.size,
            duration=getattr(msg.file, "duration", None),
            width=getattr(msg.file, "width", None),
            height=getattr(msg.file, "height", None),
        )
    return info


def message_row(msg):
    return {
        "id": msg.id,
        "date": msg.date.isoformat(),
        "edit_date": msg.edit_date.isoformat() if msg.edit_date else None,
        "text": msg.message or "",
        "grouped_id": msg.grouped_id,
        "reply_to": msg.reply_to.reply_to_msg_id if msg.reply_to else None,
        "media": media_info(msg),
    }


async def list_topics(client, group_id):
    entity = await client.get_entity(group_id)
    result = await client(GetForumTopicsRequest(peer=entity, offset_date=None, offset_id=0, offset_topic=0, limit=100))
    for topic in result.topics:
        print(f"{topic.id}\t{getattr(topic, 'title', '')}")


async def dump(client, group_id, topic_ids, out_dir):
    entity = await client.get_entity(group_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    for topic_id in topic_ids:
        rows = [message_row(msg) async for msg in client.iter_messages(entity, reply_to=topic_id, reverse=True)]
        path = out_dir / f"{group_id}-{topic_id}.json"
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        print(f"{path}: {len(rows)} messages")


async def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    topics = sub.add_parser("topics")
    topics.add_argument("group_id", type=int)
    dump_cmd = sub.add_parser("dump")
    dump_cmd.add_argument("group_id", type=int)
    dump_cmd.add_argument("topic_ids", type=int, nargs="+")
    dump_cmd.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    client = build_client()
    await client.connect()
    if not await client.is_user_authorized():
        raise SystemExit("not logged in: run login.py first")
    try:
        if args.cmd == "topics":
            await list_topics(client, channel_peer(args.group_id))
        else:
            await dump(client, channel_peer(args.group_id), args.topic_ids, args.out)
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
