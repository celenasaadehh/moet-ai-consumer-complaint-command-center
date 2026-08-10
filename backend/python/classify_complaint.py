from pathlib import Path
import json
from datetime import datetime

import sys

import joblib
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from train_and_triage import (
    extract_signals,
    calculate_content_score,
    apply_zone_policy,
    build_reasoning,
    recommended_action,
    prepare_establishment_lookup,
    normalize_establishment_name,
)

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "output" / "category_model.joblib"
ESTABLISHMENTS_CSV = BASE_DIR / "establishments(in).csv"
TRIAGED_FILE = BASE_DIR / "output/triaged_complaints.json"

model = joblib.load(MODEL_PATH)

encoder = SentenceTransformer(model["encoder_name"])
classifier = model["classifier"]

establishments_df = pd.read_csv(ESTABLISHMENTS_CSV)
establishment_lookup = prepare_establishment_lookup(establishments_df)


def find_establishment(establishment_name):
    key = normalize_establishment_name(establishment_name)
    establishment = establishment_lookup.get(key)

    if establishment is None:
        return {
            "id": None,
            "name": establishment_name,
            "province": "Unknown",
            "sector": "Unknown",
            "violations": 0,
            "last_inspection": None,
            "zone": "UNKNOWN",
            "open_complaints": 0,
        }

    return establishment


def classify_and_score(text, establishment_name):
    embedding = encoder.encode(
        [text],
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    probabilities = classifier.predict_proba(embedding)[0]
    classes = classifier.classes_

    best_index = int(np.argmax(probabilities))

    predicted_category = str(classes[best_index])
    confidence = float(probabilities[best_index])

    signals = extract_signals(text)

    content_score, score_breakdown = calculate_content_score(
        predicted_category,
        signals
    )

    establishment = find_establishment(establishment_name)

    final_score, priority, final_breakdown = apply_zone_policy(
        content_score=content_score,
        zone=establishment["zone"],
        signals=signals,
        breakdown=score_breakdown
    )

    reasoning_items = build_reasoning(
        predicted_category=predicted_category,
        confidence=confidence,
        signals=signals,
        zone=establishment["zone"],
        violations=establishment["violations"]
    )

    return {
        "category": predicted_category,
        "confidence": round(confidence, 4),
        "signals": signals,
        "content_score": content_score,
        "triage_score": final_score,
        "priority_category": priority,
        "establishment": establishment,
        "zone": establishment["zone"],
        "violations": establishment["violations"],
        "recommended_action": recommended_action(priority, confidence),
        "reasoning": " ".join(reasoning_items),
        "score_breakdown": final_breakdown,
        "requires_manual_review": (
            confidence < 0.50
            or establishment["zone"] == "UNKNOWN"
        ),
    }


def save_triaged_complaint(
    complaint_text,
    establishment_name,
    citizen_priority,
    result
):
    if TRIAGED_FILE.exists():
        with open(TRIAGED_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {
            "metadata": {
                "total_complaints": 0
            },
            "complaints": []
        }

    next_id = len(data["complaints"]) + 1

    complaint_record = {
        "complaint_id": f"TRN-{next_id:04d}",
        "subject": result["category"].replace("_", " ").title(),

        "message": complaint_text,
        "establishment_name": establishment_name,
        "originalPriority": citizen_priority,

        "submission_date": datetime.now().strftime("%Y-%m-%d"),

        "original_category": result["category"],
        "predicted_category": result["category"],
        "category": result["category"],
        "category_confidence": result["confidence"],

        "signals": result["signals"],

        "content_score": result["content_score"],
        "triage_score": result["triage_score"],
        "priority_category": result["priority_category"],

        "zone": result["zone"],
        "violations": result["violations"],

        "recommended_action": result["recommended_action"],
        "reasoning": result["reasoning"],

        "score_breakdown": result["score_breakdown"],

        "requires_manual_review": result["requires_manual_review"],

        "status": "New",
        "cluster_alert": False
    }

    data["complaints"].append(complaint_record)

    data["metadata"]["total_complaints"] = len(
        data["complaints"]
    )

    with open(TRIAGED_FILE, "w", encoding="utf-8") as f:
        json.dump(
            data,
            f,
            indent=2,
            ensure_ascii=False
        )


if __name__ == "__main__":
    complaint = sys.argv[1]
    establishment_name = sys.argv[2]
    citizen_priority = sys.argv[3]

    result = classify_and_score(
        complaint,
        establishment_name
    )

    save_triaged_complaint(
        complaint,
        establishment_name,
        citizen_priority,
        result
    )

    print(
        json.dumps(
            {
                "success": True,
                "category": result["category"],
                "priority": result["priority_category"],
                "score": result["triage_score"]
            }
        )
    )