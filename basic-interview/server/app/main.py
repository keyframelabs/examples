from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

ROOT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT_DIR / "server"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
DEFAULT_CLIENT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
records: dict[str, dict[str, Any]] = {}


def load_env() -> None:
    for env_path in [ROOT_DIR / ".env", SERVER_DIR / ".env"]:
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_env()


def client_origins() -> list[str]:
    raw = os.environ.get("CLIENT_ORIGIN")
    if not raw:
        return DEFAULT_CLIENT_ORIGINS

    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="KFL Interview Demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=client_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BridgeError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


@app.exception_handler(BridgeError)
async def bridge_error_handler(_request: Request, exc: BridgeError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc)})


@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def generic_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/health")
async def health() -> dict[str, Any]:
    return await run_bridge("health", {})


@app.post("/api/interviews", status_code=201)
async def create_interview(
    candidateName: str = Form(""),
    jobDescriptionText: str = Form(""),
    resumeFile: Optional[UploadFile] = File(None),
) -> dict[str, Any]:
    upload = await read_upload(resumeFile)
    payload = {
        "candidateName": candidateName,
        "jobDescriptionText": jobDescriptionText,
        "resumeUpload": upload,
    }
    result = await run_bridge("create-interview", payload)
    record = result["record"]
    records[record["id"]] = record
    return result["response"]


@app.post("/api/interviews/{interview_id}/session")
async def start_session(interview_id: str) -> dict[str, Any]:
    record = get_record(interview_id)
    result = await run_bridge("start-session", {"record": record})
    record.update(result.get("recordPatch", {}))
    return result["response"]


@app.post("/api/interviews/{interview_id}/end")
async def end_interview(interview_id: str, request: Request) -> dict[str, Any]:
    record = get_record(interview_id)
    body = await safe_json(request)
    result = await run_bridge(
        "end-interview",
        {
            "record": record,
            "conversationId": body.get("conversationId") if isinstance(body, dict) else None,
        },
    )
    record.update(result.get("recordPatch", {}))
    return {"feedbackArtifact": result["feedbackArtifact"]}


@app.get("/api/interviews/{interview_id}/artifact")
async def get_artifact(interview_id: str) -> dict[str, Any]:
    record = get_record(interview_id)
    artifact = record.get("feedbackArtifact")
    if not artifact:
        raise HTTPException(status_code=404, detail="Feedback artifact has not been generated yet.")

    return {"feedbackArtifact": artifact}


@app.get("/api/interviews/{interview_id}/artifact.pdf")
async def get_artifact_pdf(interview_id: str) -> Response:
    record = get_record(interview_id)
    artifact = record.get("feedbackArtifact")
    if not artifact:
        raise HTTPException(status_code=404, detail="Feedback artifact has not been generated yet.")

    result = await run_bridge("render-pdf", {"artifact": artifact})
    pdf = base64.b64decode(result["pdfBase64"])
    filename = result["filename"]
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def get_record(interview_id: str) -> dict[str, Any]:
    record = records.get(interview_id)
    if not record:
        raise HTTPException(status_code=404, detail="Interview not found. Start a new interview.")

    return record


async def read_upload(upload: Optional[UploadFile]) -> Optional[dict[str, Any]]:
    if upload is None or not upload.filename:
        return None

    content = await upload.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is too large.")

    return {
        "filename": upload.filename,
        "contentType": upload.content_type or "application/octet-stream",
        "size": len(content),
        "contentBase64": base64.b64encode(content).decode("ascii"),
    }


async def safe_json(request: Request) -> Any:
    try:
        return await request.json()
    except Exception:
        return {}


async def run_bridge(command: str, payload: dict[str, Any]) -> Any:
    process = await asyncio.create_subprocess_exec(
        *bridge_command(command),
        cwd=SERVER_DIR,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(json.dumps(payload).encode("utf-8")),
            timeout=180,
        )
    except asyncio.TimeoutError as exc:
        process.kill()
        await process.wait()
        raise BridgeError("Backend operation timed out.", 504) from exc

    parsed = parse_bridge_output(stdout)
    if process.returncode != 0 or not parsed.get("ok"):
        message = parsed.get("error") if isinstance(parsed.get("error"), str) else ""
        if not message:
            message = stderr.decode("utf-8", errors="replace").strip() or "Backend operation failed."
        status = parsed.get("status")
        raise BridgeError(message, status if isinstance(status, int) else 500)

    return parsed.get("result")


def bridge_command(command: str) -> list[str]:
    tsx = SERVER_DIR / "node_modules" / ".bin" / "tsx"
    if tsx.exists():
        return [str(tsx), "src/bridge.ts", command]

    return ["pnpm", "exec", "tsx", "src/bridge.ts", command]


def parse_bridge_output(stdout: bytes) -> dict[str, Any]:
    text = stdout.decode("utf-8", errors="replace")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return {}

    try:
        parsed = json.loads(lines[-1])
    except json.JSONDecodeError:
        return {}

    return parsed if isinstance(parsed, dict) else {}
