#!/usr/bin/env python3
"""Test ponctuel : pousse un bip vers le Pi salon."""
import asyncio
import base64
import math
import os
import struct
import wave

os.environ.setdefault("JARVIS_SALON_SPEAKER_URL", "http://192.168.1.27:8767")

from jarvis_core.salon_speaker import push_tts_to_salon  # noqa: E402


def main() -> None:
    path = "/tmp/jarvis-beep.wav"
    fr, dur, f = 22050, 0.6, 880
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(fr)
        for i in range(int(fr * dur)):
            val = int(12000 * math.sin(2 * math.pi * f * i / fr))
            w.writeframes(struct.pack("<h", val))
    raw = open(path, "rb").read()
    ok = asyncio.run(
        push_tts_to_salon(
            {
                "type": "tts_audio",
                "audio_b64": base64.b64encode(raw).decode("ascii"),
                "bytes": len(raw),
                "text": "beep test salon",
            }
        )
    )
    print("salon_ok", ok)


if __name__ == "__main__":
    main()
