from __future__ import annotations

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.segmenter import segment_uploaded_image


app = FastAPI(title="Sinhala Word Segmenter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/segment")
async def segment(
    image: UploadFile = File(...),
    num_letters: int = Form(...),
    crop: bool = Form(True),
) -> JSONResponse:
    try:
        image_bytes = await image.read()
        result = segment_uploaded_image(
            image_bytes,
            num_letters=num_letters,
            crop=crop,
        )
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

