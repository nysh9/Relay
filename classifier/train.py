"""
RELAY urgency classifier — training + evaluation.

TF-IDF + LogisticRegression (scikit-learn). Trains in seconds. The point isn't a
fancy model — it's a *measured* P1/P2/P3 instead of the LLM's vibes, with an eval
number we can show. The confusion matrix is the demo visual; the story is
"it never confuses a P1 for a P3."

  python train.py            # reads data.csv, writes model.pkl + confusion_matrix.png

Design choice (§2 over-escalation bias): we report P1-recall and the P1↔P3
confusion explicitly, because in a crisis tool a missed P1 is the costly error.
"""

from __future__ import annotations

import sys

import joblib
import matplotlib

matplotlib.use("Agg")  # headless — just write the PNG
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

LABELS = ["P1", "P2", "P3"]


def main() -> None:
    df = pd.read_csv("data.csv")
    if df.empty:
        sys.exit("data.csv is empty — run `python generate_data.py` first.")

    X = df["text"].astype(str)
    y = df["label"].astype(str)

    # Stratified 80/20 split so each tier is represented in the held-out set.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipe = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),  # unigrams + bigrams catch "no water", "running out"
                    min_df=2,
                    sublinear_tf=True,
                    stop_words="english",
                ),
            ),
            (
                "clf",
                # class_weight balanced nudges toward catching the minority/urgent class.
                LogisticRegression(max_iter=1000, class_weight="balanced"),
            ),
        ]
    )

    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    print(f"\nHeld-out accuracy: {acc:.3f}  (n_test={len(y_test)})\n")
    print(classification_report(y_test, y_pred, labels=LABELS, digits=3))

    cm = confusion_matrix(y_test, y_pred, labels=LABELS)
    print("Confusion matrix (rows = true, cols = predicted):")
    print("        " + "  ".join(f"{l:>4}" for l in LABELS))
    for i, l in enumerate(LABELS):
        print(f"  {l:>4}  " + "  ".join(f"{cm[i][j]:>4}" for j in range(len(LABELS))))

    # The safety headline: how often did we call a true P1 a P3 (the worst miss)?
    p1_idx, p3_idx = LABELS.index("P1"), LABELS.index("P3")
    p1_as_p3 = int(cm[p1_idx][p3_idx])
    print(f"\nSafety check — true P1 predicted as P3: {p1_as_p3}  (want 0)")

    # Save the confusion-matrix figure for the demo.
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=LABELS)
    fig, ax = plt.subplots(figsize=(4.5, 4))
    disp.plot(ax=ax, cmap="Blues", colorbar=False)
    ax.set_title(f"RELAY urgency classifier\nheld-out accuracy {acc:.0%}")
    fig.tight_layout()
    fig.savefig("confusion_matrix.png", dpi=150)
    print("Wrote confusion_matrix.png")

    # Persist the whole pipeline (vectorizer + model) so server.py loads one file.
    joblib.dump(pipe, "model.pkl")
    print("Wrote model.pkl")


if __name__ == "__main__":
    main()
