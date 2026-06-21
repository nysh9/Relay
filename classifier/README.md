# RELAY — Urgency Classifier (stretch §9)

A small **TF-IDF + LogisticRegression** model that assigns **P1 / P2 / P3** from
triage text — a *measured* urgency to complement Claude's. The Brain calls this
and takes the **more severe** of (Claude, classifier), the over-escalation bias
of guardrail §2 ("a false alarm is safer than a missed emergency"). If this
service is down, the Brain silently keeps Claude's priority — it's an
enhancement, never a dependency.

## Files
- `generate_data.py` — synthetic labeled data. Offline template synthesizer by
  default (reproducible, no key); `--use-claude` generates via Claude instead.
- `train.py` — trains the pipeline, prints accuracy + confusion matrix, writes
  `model.pkl` and `confusion_matrix.png`.
- `server.py` — FastAPI `/classify` (+ `/health`) on port 8000.
- `data.csv` — committed training data (so `train.py` runs out of the box).
- `confusion_matrix.png` — the demo visual.

## Run
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python generate_data.py     # data.csv (already committed)
python train.py             # model.pkl + confusion_matrix.png
python server.py            # :8000
```

## API
```
POST /classify   {"text": "..."}  ->  {"priority": "P1|P2|P3", "confidence": 0.0-1.0}
GET  /health                      ->  {"ok": true, "model_loaded": true}
```

## The demo story
Held-out accuracy ~0.98 on the synthetic set, **P1 recall 1.0**, and **0 P1→P3
confusions** — the model never downgrades a life-threatening call to
informational. The confusion matrix (`confusion_matrix.png`) is the visual; the
line is *"it never confuses a P1 for a P3."* Data is synthetic (mass-care lane:
shelter / water / supplies / medical-fragility) — say so; it's a prototype.
