from __future__ import annotations

import argparse
import asyncio
from collections.abc import Sequence

import httpx
from fastapi import HTTPException

from .interview_packets import InterviewPacket, get_interview_packet, list_interview_packets
from .main import get_settings, sync_elevenlabs_agents


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync configured interview packets to their preconfigured ElevenLabs agents.",
    )
    parser.add_argument(
        "packet_ids",
        nargs="*",
        help="Packet IDs to sync. Omit to sync every registered packet.",
    )
    return parser.parse_args()


def select_packets(packet_ids: Sequence[str]) -> tuple[InterviewPacket, ...]:
    if not packet_ids:
        return list_interview_packets()

    try:
        return tuple(get_interview_packet(packet_id) for packet_id in packet_ids)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


async def sync_packets(packets: Sequence[InterviewPacket]) -> None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
        try:
            synced_packets = await sync_elevenlabs_agents(client, settings, tuple(packets))
        except HTTPException as exc:
            raise SystemExit(str(exc.detail)) from exc

        for packet, agent_id in synced_packets:
            print(
                f"Synced {packet.packet_id} to {agent_id} "
                f"(turn timeout: {packet.turn_timeout_seconds}s, eagerness: {packet.turn_eagerness})."
            )


def main() -> None:
    args = parse_args()
    asyncio.run(sync_packets(select_packets(args.packet_ids)))


if __name__ == "__main__":
    main()
