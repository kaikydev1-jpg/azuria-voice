"""A local fake of the Ignis engine API (tests only).

Speaks the routes `docs/IGNIS_PARA_AZURIA.md` (Ignis 0.3.0) defines on
127.0.0.1 with an ephemeral port, records every request and lets a test
inject errors. No real model, no network beyond loopback.
"""
from __future__ import annotations

import io
import json
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def tiny_wav(seconds: float = 0.05, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\x00\x01" * int(seconds * rate))
    return buf.getvalue()


class FakeIgnis:
    def __init__(self) -> None:
        self.models = ["omnivoice", "whisper-1", "qwen3-4b"]
        self.voices: dict[str, dict] = {}
        self.requests: list[tuple[str, str, Any]] = []
        # Queue of (status, code, message) answered by the next speech calls.
        self.speech_errors: list[tuple[int, str, str]] = []
        self.voice_ready = True
        self.transcription_ready = True
        self.gpu = "AMD Radeon RX 580"
        self._server: ThreadingHTTPServer | None = None

    # ── lifecycle ────────────────────────────────────────────────────────
    def start(self) -> "FakeIgnis":
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):  # keep pytest output clean
                pass

            def _send(self, status: int, body: Any, ctype: str = "application/json") -> None:
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _error(self, status: int, code: str, message: str) -> None:
                self._send(status, {"error": {"message": message, "code": code}})

            def _body(self) -> Any:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                try:
                    return json.loads(raw or b"null")
                except ValueError:
                    return raw

            def do_GET(self):  # noqa: N802 - http.server API
                fake.requests.append(("GET", self.path, None))
                if self.path == "/motor/versao":
                    return self._send(200, {"nome": "Ignis", "api": 1, "versao": "0.3.0"})
                if self.path == "/v1/models":
                    return self._send(200, {"object": "list", "data": [{"id": m} for m in fake.models]})
                if self.path == "/motor/estado":
                    return self._send(200, {
                        "placa": {"nome": fake.gpu},
                        "motor": {"nome": "Vulkan"},
                        "audio": {
                            "voz": {"preparado": fake.voice_ready, "rodando": False},
                            "transcricao": {"preparado": fake.transcription_ready, "rodando": False},
                        },
                    })
                if self.path == "/motor/audio":
                    return self._send(200, {
                        "voz": {
                            "preparado": fake.voice_ready,
                            "falta_baixar": 0 if fake.voice_ready else 1_200_000_000,
                            "modelo": {"nome": "OmniVoice", "licenca": "CC BY-NC 4.0",
                                       "uso_comercial": False, "tamanho": 1_200_000_000},
                            "rodando": {"backend": "vulkan"} if fake.voice_ready else None,
                        },
                        "transcricao": {
                            "preparado": fake.transcription_ready,
                            "falta_baixar": 0 if fake.transcription_ready else 600_000_000,
                            "modelo": {"nome": "whisper large-v3-turbo", "licenca": "MIT",
                                       "uso_comercial": True, "tamanho": 600_000_000},
                            "rodando": None,
                        },
                        "vozes": sorted(fake.voices),
                    })
                if self.path == "/v1/audio/voices":
                    return self._send(200, {"object": "list", "data": [
                        {"name": name, "ref_text": v.get("ref_text", "")}
                        for name, v in sorted(fake.voices.items())
                    ]})
                return self._error(404, "nao_encontrado", "rota desconhecida")

            def do_POST(self):  # noqa: N802 - http.server API
                body = self._body()
                fake.requests.append(("POST", self.path, body))
                if self.path == "/v1/audio/voices":
                    fake.voices[body["name"]] = body
                    return self._send(200, {"ok": True})
                if self.path == "/v1/audio/speech":
                    if fake.speech_errors:
                        status, code, message = fake.speech_errors.pop(0)
                        return self._error(status, code, message)
                    if not fake.voice_ready:
                        return self._error(503, "audio_nao_preparado", "Prepare a voz no Ignis.")
                    voice = body.get("voice")
                    if voice and voice not in fake.voices:
                        return self._error(400, "voz_desconhecida", f"A voz {voice} não existe.")
                    return self._send(200, tiny_wav(), "audio/wav")
                if self.path == "/motor/audio/preparar":
                    return self._send(200, {"ok": True, "familias": body.get("familias", [])})
                if self.path == "/motor/audio/descarregar":
                    return self._send(200, {"ok": True})
                return self._error(404, "nao_encontrado", "rota desconhecida")

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    @property
    def port(self) -> int:
        assert self._server is not None
        return self._server.server_address[1]

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def calls(self, method: str, path: str) -> list[Any]:
        return [body for m, p, body in self.requests if m == method and p == path]
