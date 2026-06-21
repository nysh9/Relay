"""
RELAY urgency classifier — FastAPI serving layer (port 8000).

Wraps the trained TF-IDF + LogisticRegression pipeline behind POST /classify so
the Brain (Node) can get a *measured* priority to compare against Claude's.

  uvicorn server:app --port 8000     # or: python server.py

POST /classify  { "text": "..." }  ->  { "priority": "P1|P2|P3", "confidence": 0.0-1.0 }
GET  /health                       ->  { "ok": true, "model_loaded": bool }

Port 8000 (NOT 3002 — that's the Matchmaker).
"""

from __future__ import annotations

import os

import joblib
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_PATH = os.environ.get("CLASSIFIER_MODEL", "model.pkl")

app = FastAPI(title="RELAY urgency classifier")

# Load the pipeline once at import time. If the model file is missing, we keep
# serving /health (model_loaded=false) so the Brain's graceful fallback kicks in
# rather than the whole service refusing to start.
try:
    _model = joblib.load(MODEL_PATH)
except Exception as e:  # noqa: BLE001
    print(f"[classifier] could not load {MODEL_PATH}: {e} — run train.py")
    _model = None


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    priority: str
    confidence: float


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model_loaded": _model is not None}


@app.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    if _model is None:
        # No model — return a safe, low-confidence default. The Brain treats low
        # confidence / errors as "keep Claude's priority" (graceful fallback).
        return ClassifyResponse(priority="P2", confidence=0.0)

    pred = _model.predict([req.text])[0]
    # Confidence = probability mass on the predicted class.
    try:
        proba = _model.predict_proba([req.text])[0]
        classes = list(_model.named_steps["clf"].classes_)
        confidence = float(proba[classes.index(pred)])
    except Exception:  # noqa: BLE001
        confidence = 1.0
    return ClassifyResponse(priority=str(pred), confidence=confidence)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("CLASSIFIER_PORT", "8000")))
