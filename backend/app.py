from __future__ import annotations

import uuid
from dotenv import load_dotenv

load_dotenv()   # must run before importing supabase_client

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from classifier import load_model
from evaluator import evaluate_uploaded_image
from supabase_client import get_supabase

load_model()   # Load ConvNeXt model on startup

app = FastAPI(title="Nana Piyasa — Sinhala Writing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Evaluate + Save ───────────────────────────────────────────────────────────

@app.post("/evaluate")
async def evaluate(
    image: UploadFile = File(...),
    num_letters: int = Form(...),
) -> JSONResponse:
    try:
        image_bytes = await image.read()

        # 1. Run the ML evaluation pipeline
        result = evaluate_uploaded_image(image_bytes, num_letters=num_letters)

        # 2. Upload the original image to Supabase Storage
        sb = get_supabase()
        filename = f"{uuid.uuid4()}.jpg"
        storage_path = f"uploads/{filename}"

        sb.storage.from_("word-images").upload(
            path=storage_path,
            file=image_bytes,
            file_options={"content-type": "image/jpeg"},
        )

        # 3. Build a public URL for the uploaded image
        public_url = (
            sb.storage.from_("word-images").get_public_url(storage_path)
        )

        # 4. Save evaluation record to the `evaluations` table
        sb.table("evaluations").insert({
            "image_url":     public_url,
            "num_letters":   result["num_letters"],
            "overall_score": result["overall_score"],
            "splits":        result["splits"],
            "characters":    result["images"],   # full per-char JSON
        }).execute()

        # 5. Return the evaluation result (also include the image URL)
        result["image_url"] = public_url
        return JSONResponse(result)

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# ── History ───────────────────────────────────────────────────────────────────

@app.get("/history")
def history() -> JSONResponse:
    try:
        sb = get_supabase()
        resp = (
            sb.table("evaluations")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return JSONResponse(resp.data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
