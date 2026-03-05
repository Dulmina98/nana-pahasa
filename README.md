# Sinhala Word Segmenter (Frontend + API)

This project includes:

- **Backend API (FastAPI)**: accepts an uploaded image + expected number of letters and returns segmented character images.
- **Frontend (React + Vite)**: simple UI to upload an image and view the segmented outputs.

## Backend (API)

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8000
```

Test (optional): open the API docs at `http://localhost:8000/docs`.

## Frontend (React)

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:5173`.

## How to use

1. Upload an image (PNG/JPG).
2. Set **Number of letters** (e.g. `2` like the notebook example).
3. Click **Segment**.
4. The UI will show `char_1.png`, `char_2.png`, etc.

## Config (optional)

If your API runs on a different host/port, set:

```bash
VITE_API_URL=http://localhost:8000
```

