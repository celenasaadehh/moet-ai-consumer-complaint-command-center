"""
AI-Powered Complaint Triage Training Pipeline
----------------------------------------------
This script:

1. Loads the provided complaints and establishments CSV files.
2. Trains a TF-IDF + SGD Logistic Classifier category classifier.
3. Evaluates the classifier.
4. Saves the trained model.
5. Extracts explainable risk signals from every complaint.
6. Calculates a content severity score.
7. Matches each complaint to its establishment.
8. Applies the mandatory GREEN/YELLOW/RED zone rules.
9. Produces dashboard-ready JSON.

Run:
    pip install -r requirements.txt
    python train_and_triage.py

Expected input files:
    consumer_complaints(in).csv
    establishments(in).csv

Outputs:
    output/category_model.joblib
    output/model_metrics.json
    output/triaged_complaints.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression

EMBEDDING_MODEL_NAME = (
    "paraphrase-multilingual-MiniLM-L12-v2"
)

SENTENCE_ENCODER = SentenceTransformer(
    EMBEDDING_MODEL_NAME
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

COMPLAINTS_CSV = BASE_DIR / "consumer_complaints_cleaned.csv"
ESTABLISHMENTS_CSV = BASE_DIR / "establishments(in).csv"

OUTPUT_DIR = BASE_DIR / "output"
MODEL_PATH = OUTPUT_DIR / "category_model.joblib"
METRICS_PATH = OUTPUT_DIR / "model_metrics.json"
RESULTS_PATH = OUTPUT_DIR / "triaged_complaints.json"

RANDOM_STATE = 42
TEST_SIZE = 0.20



VALID_CATEGORIES = {
    "food_safety",
    "service_quality",
    "price_fraud",
    "hygiene",
    "licensing",
}

PRIORITY_RANK = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}


# ---------------------------------------------------------------------------
# Risk-signal phrase dictionaries
# Add Arabic or French phrases here later if your dataset expands.
# ---------------------------------------------------------------------------

RISK_PATTERNS: dict[str, list[str]] = {
    "health_symptoms": [
        "vomit",
        "vomiting",
        "diarrhea",
        "nausea",
        "stomach pain",
        "stomach cramps",
        "abdominal pain",
        "fever",
        "rash",
        "eye irritation",
        "food poisoning",
        "became sick",
        "became ill",
        "felt sick",
        "difficulty breathing",
        "allergic reaction",
        "fainted",
        "dizziness",
    ],
    "medical_attention": [
        "hospital",
        "emergency room",
        "emergency department",
        "medical center",
        "doctor",
        "physician",
        "clinic",
        "ambulance",
        "medical report",
        "treated",
        "prescribed",
    ],
    "multiple_people_affected": [
        "my wife",
        "my husband",
        "my family",
        "my children",
        "my son",
        "my daughter",
        "two people",
        "three people",
        "several people",
        "multiple people",
        "other customers",
        "other guests",
        "all of us",
        "same symptoms",
        "similar symptoms",
    ],
    "vulnerable_person": [
        "child",
        "children",
        "baby",
        "infant",
        "elderly",
        "pregnant",
        "senior citizen",
        "disabled",
        "chronic illness",
    ],
    "dangerous_product_or_condition": [
        "electric shock",
        "electrical fire",
        "caught fire",
        "fire hazard",
        "exploded",
        "explosion",
        "chemical smell",
        "toxic",
        "poison",
        "contaminated",
        "rusted metal",
        "broken glass",
        "sharp metal",
        "unsafe",
        "raw chicken",
        "pink chicken",
        "no lifeguard",
        "gas leak",
    ],
    "expired_or_spoiled": [
        "expired",
        "expiry date",
        "past expiry",
        "spoiled",
        "rotten",
        "rancid",
        "mold",
        "mould",
        "sour smell",
        "bad smell",
        "bloated",
        "grey streaks",
        "insect",
        "flies",
        "worm",
        "worms",
    ],
    "hygiene_violation": [
        "dirty",
        "filthy",
        "cockroach",
        "cockroaches",
        "rat",
        "rats",
        "mouse",
        "mice",
        "insect",
        "flies",
        "uncovered food",
        "no gloves",
        "grease",
        "algae",
        "murky water",
        "broken filter",
        "no refrigeration",
        "raw meat",
        "bad hygiene",
    ],
    "fraud_or_financial_harm": [
        "wrong price",
        "higher price",
        "overcharged",
        "overcharge",
        "price mismatch",
        "underweight",
        "short weight",
        "false advertisement",
        "misleading",
        "counterfeit",
        "fake product",
        "no receipt",
        "no invoice",
        "hidden fee",
        "fraud",
        "scam",
    ],
    "licensing_or_regulatory": [
        "no license",
        "without a license",
        "unlicensed",
        "no permit",
        "without a permit",
        "health permit",
        "operating illegally",
        "illegal operation",
        "no certificate",
        "missing certificate",
    ],
    "refusal_or_obstruction": [
        "refused a refund",
        "refused refund",
        "refused to help",
        "dismissed",
        "became aggressive",
        "threatened",
        "laughed",
        "ignored",
        "would not cooperate",
        "refused to show",
        "denied responsibility",
    ],
    "evidence_available": [
        "photo",
        "photos",
        "video",
        "receipt",
        "invoice",
        "medical report",
        "kept the product",
        "kept the leftover",
        "leftover container",
        "as evidence",
        "witness",
    ],
    "ongoing_public_exposure": [
        "still selling",
        "remained open",
        "continues to sell",
        "still on the shelf",
        "other patients",
        "other customers",
        "other guests",
        "same batch",
        "open to paying guests",
        "displayed for sale",
    ],
}


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def normalize_text(value: Any) -> str:
    """Normalize text while preserving useful words for classification."""
    text = str(value or "").lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_establishment_name(value: Any) -> str:
    """Normalize an establishment name for reliable joins."""
    text = normalize_text(value)
    text = re.sub(r"[^a-z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


from rapidfuzz import fuzz

def contains_phrase(text: str, phrase: str) -> bool:
    phrase = normalize_text(phrase)

    if phrase in text:
        return True

    words = text.split()

    if " " not in phrase:
        for word in words:
            if fuzz.ratio(word, phrase) >= 75:
                return True

    else:
        text_words = text.split()

        phrase_len = len(phrase.split())

        for i in range(len(text_words) - phrase_len + 1):
            chunk = " ".join(text_words[i:i+phrase_len])

            if fuzz.ratio(chunk, phrase) >= 85:
                return True

    return False


def extract_signals(message: str) -> dict[str, bool]:
    """Extract explainable binary risk signals from a complaint message."""
    text = normalize_text(message)

    return {
        signal: any(contains_phrase(text, phrase) for phrase in phrases)
        for signal, phrases in RISK_PATTERNS.items()
    }


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

def validate_complaints_dataframe(df: pd.DataFrame) -> None:
    required_columns = {
        "complaint_id",
        "province",
        "establishment_name",
        "message",
        "submission_date",
        "category",
    }

    missing = required_columns.difference(df.columns)

    if missing:
        raise ValueError(
            f"Complaints CSV is missing required columns: {sorted(missing)}"
        )

    unknown_categories = set(df["category"].dropna().unique()) - VALID_CATEGORIES

    if unknown_categories:
        print(
            "Warning: unexpected categories found:",
            sorted(unknown_categories),
        )


def build_embeddings(messages):
    encoder = SentenceTransformer(
        EMBEDDING_MODEL_NAME
    )

    embeddings = encoder.encode(
        messages.tolist(),
        convert_to_numpy=True,
        show_progress_bar=True,
        normalize_embeddings=True
    )

    return encoder, embeddings



def train_and_evaluate(
    complaints_df: pd.DataFrame,
):
    X = complaints_df["message"].fillna("").astype(str)
    y = complaints_df["category"].astype(str)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    print("\nGenerating embeddings...")

    encoder, train_embeddings = build_embeddings(X_train)

    test_embeddings = encoder.encode(
        X_test.tolist(),
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    classifier = LogisticRegression(
        max_iter=5000,
        class_weight="balanced",
        random_state=RANDOM_STATE,
    )

    classifier.fit(
        train_embeddings,
        y_train
    )

    predictions = classifier.predict(
        test_embeddings
    )

    accuracy = float(
        accuracy_score(y_test, predictions)
    )

    macro_f1 = float(
        f1_score(
            y_test,
            predictions,
            average="macro"
        )
    )

    weighted_f1 = float(
        f1_score(
            y_test,
            predictions,
            average="weighted"
        )
    )

    labels = sorted(y.unique())

    report = classification_report(
        y_test,
        predictions,
        labels=labels,
        output_dict=True,
        zero_division=0,
    )

    matrix = confusion_matrix(
        y_test,
        predictions,
        labels=labels,
    ).tolist()

    metrics = {
        "dataset_rows": int(len(complaints_df)),
        "training_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "labels": labels,
        "classification_report": report,
        "confusion_matrix": matrix,
    }

    print(f"Accuracy: {accuracy:.4f}")
    print(f"Macro F1: {macro_f1:.4f}")

    full_embeddings = encoder.encode(
        X.tolist(),
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    final_classifier = LogisticRegression(
        max_iter=5000,
        class_weight="balanced",
        random_state=RANDOM_STATE,
    )

    final_classifier.fit(
        full_embeddings,
        y
    )

    final_model = {
        "encoder_name":
            EMBEDDING_MODEL_NAME,
        "classifier":
            final_classifier,
        "classes":
            list(final_classifier.classes_)
    }

    return final_model, metrics


# ---------------------------------------------------------------------------
# Severity scoring
# ---------------------------------------------------------------------------

CATEGORY_BASE_SCORE = {
    "food_safety": 30,
    "hygiene": 25,
    "price_fraud": 20,
    "licensing": 20,
    "service_quality": 8,
}

SIGNAL_WEIGHTS = {
    "health_symptoms": 18,
    "medical_attention": 18,
    "multiple_people_affected": 12,
    "vulnerable_person": 8,
    "dangerous_product_or_condition": 18,
    "expired_or_spoiled": 10,
    "hygiene_violation": 8,
    "fraud_or_financial_harm": 10,
    "licensing_or_regulatory": 8,
    "refusal_or_obstruction": 4,
    "evidence_available": 2,
    "ongoing_public_exposure": 10,
}


def calculate_content_score(
    predicted_category: str,
    signals: dict[str, bool],
) -> tuple[int, list[dict[str, Any]]]:
    """Calculate content urgency independently of establishment zone."""
    score = CATEGORY_BASE_SCORE.get(predicted_category, 10)

    breakdown: list[dict[str, Any]] = [
        {
            "label": f"Base score for {predicted_category}",
            "points": score,
        }
    ]

    for signal, detected in signals.items():
        if not detected:
            continue

        points = SIGNAL_WEIGHTS.get(signal, 0)
        score += points

        breakdown.append(
            {
                "label": signal.replace("_", " ").title(),
                "points": points,
            }
        )

    return min(int(score), 100), breakdown


def is_serious_content(signals: dict[str, bool]) -> bool:
    """Signals that make a RED-zone complaint CRITICAL."""
    serious_signals = {
        "health_symptoms",
        "medical_attention",
        "multiple_people_affected",
        "vulnerable_person",
        "dangerous_product_or_condition",
        "ongoing_public_exposure",
    }

    return any(signals.get(signal, False) for signal in serious_signals)


def apply_zone_policy(
    content_score: int,
    zone: str,
    signals: dict[str, bool],
    breakdown: list[dict[str, Any]],
) -> tuple[int, str, list[dict[str, Any]]]:
    """
    Apply the mandatory project rules.

    GREEN:
        LOW or MEDIUM based on complaint content.
    YELLOW:
        Minimum MEDIUM.
    RED:
        Minimum HIGH.
        Serious content becomes CRITICAL.
    """
    zone = str(zone or "UNKNOWN").upper()
    final_score = content_score
    updated_breakdown = list(breakdown)

    if zone == "GREEN":
        # The guide explicitly limits GREEN establishments to LOW or MEDIUM.
        final_score = min(final_score, 59)

        if content_score > 59:
            updated_breakdown.append(
                {
                    "label": "GREEN-zone policy cap",
                    "points": final_score - content_score,
                }
            )

    elif zone == "YELLOW":
        if final_score < 30:
            increase = 30 - final_score
            final_score = 30
            updated_breakdown.append(
                {
                    "label": "YELLOW-zone minimum escalation",
                    "points": increase,
                }
            )

    elif zone == "RED":
        required_minimum = 80 if is_serious_content(signals) else 60

        if final_score < required_minimum:
            increase = required_minimum - final_score
            final_score = required_minimum
            updated_breakdown.append(
                {
                    "label": (
                        "RED-zone serious-content escalation"
                        if required_minimum == 80
                        else "RED-zone minimum escalation"
                    ),
                    "points": increase,
                }
            )

    final_score = max(0, min(int(final_score), 100))

    if final_score >= 80:
        priority = "CRITICAL"
    elif final_score >= 60:
        priority = "HIGH"
    elif final_score >= 30:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return final_score, priority, updated_breakdown


# ---------------------------------------------------------------------------
# Explanation and action generation
# ---------------------------------------------------------------------------

SIGNAL_REASONING = {
    "health_symptoms": "The message reports health symptoms.",
    "medical_attention": "Medical attention or a healthcare provider is mentioned.",
    "multiple_people_affected": "More than one person may be affected.",
    "vulnerable_person": "A child or another vulnerable person may be involved.",
    "dangerous_product_or_condition": "A potentially dangerous product or physical condition is described.",
    "expired_or_spoiled": "The complaint mentions expired, spoiled, or contaminated goods.",
    "hygiene_violation": "The message describes a hygiene or sanitation problem.",
    "fraud_or_financial_harm": "The complaint contains a pricing or fraud-related signal.",
    "licensing_or_regulatory": "A possible licensing or regulatory violation is mentioned.",
    "refusal_or_obstruction": "The establishment may have refused to cooperate or address the issue.",
    "evidence_available": "The complainant mentions supporting evidence.",
    "ongoing_public_exposure": "The reported risk may still be exposing other consumers.",
}


def build_reasoning(
    predicted_category: str,
    confidence: float,
    signals: dict[str, bool],
    zone: str,
    violations: int,
) -> list[str]:
    reasons = [
        (
            f"The text model classified the complaint as "
            f"{predicted_category.replace('_', ' ')} "
            f"with {confidence:.0%} confidence."
        )
    ]

    for signal, detected in signals.items():
        if detected:
            reasons.append(SIGNAL_REASONING[signal])

    zone = str(zone or "UNKNOWN").upper()

    if zone == "RED":
        reasons.append(
            f"The establishment is in the RED zone with {violations} recorded violations."
        )
    elif zone == "YELLOW":
        reasons.append(
            f"The establishment is in the YELLOW zone with {violations} recorded violations."
        )
    elif zone == "GREEN":
        reasons.append(
            "The establishment is in the GREEN zone with no recorded violations."
        )
    else:
        reasons.append(
            "The establishment zone could not be confirmed."
        )

    return reasons


def recommended_action(priority: str, confidence: float) -> str:
    if priority == "CRITICAL":
        return "Immediate on-site inspection and supervisor notification"
    if priority == "HIGH":
        return "Assign to an inspector within 24 hours"
    if priority == "MEDIUM":
        return "Review evidence and schedule follow-up"
    if confidence < 0.50:
        return "Manual review required because model confidence is low"
    return "Acknowledge complaint and monitor for repeated reports"


# ---------------------------------------------------------------------------
# Establishment matching
# ---------------------------------------------------------------------------

def prepare_establishment_lookup(
    establishments_df: pd.DataFrame,
) -> dict[str, dict[str, Any]]:
    required_columns = {
        "id",
        "name",
        "province",
        "sector",
        "violations",
        "last_inspection",
        "zone",
        "open_complaints",
    }

    missing = required_columns.difference(establishments_df.columns)

    if missing:
        raise ValueError(
            f"Establishments CSV is missing required columns: {sorted(missing)}"
        )

    lookup: dict[str, dict[str, Any]] = {}

    for _, row in establishments_df.iterrows():
        key = normalize_establishment_name(row["name"])

        lookup[key] = {
            "id": str(row["id"]),
            "name": str(row["name"]),
            "province": str(row["province"]),
            "sector": str(row["sector"]),
            "violations": int(row["violations"]),
            "last_inspection": str(row["last_inspection"]),
            "zone": str(row["zone"]).upper(),
            "open_complaints": int(row["open_complaints"]),
        }

    return lookup


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def triage_complaint(
    row: pd.Series,
    model: dict,
    establishment_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    message = str(row.get("message", ""))


    embedding = SENTENCE_ENCODER.encode(
        [message],
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    probability_vector = (
        model["classifier"]
        .predict_proba(embedding)[0]
    )

    classes = (
        model["classifier"]
        .classes_
    )

    best_index = int(np.argmax(probability_vector))

    predicted_category = str(classes[best_index])
    confidence = float(probability_vector[best_index])

    signals = extract_signals(message)

    content_score, score_breakdown = calculate_content_score(
        predicted_category,
        signals,
    )

    establishment_key = normalize_establishment_name(
        row.get("establishment_name", "")
    )

    establishment = establishment_lookup.get(establishment_key)

    if establishment is None:
        establishment = {
            "id": None,
            "name": str(
                row.get("establishment_name", "Unmatched establishment")
            ),
            "province": str(row.get("province", "Unknown")),
            "sector": "Unknown",
            "violations": 0,
            "last_inspection": None,
            "zone": "UNKNOWN",
            "open_complaints": 0,
        }

    final_score, priority, final_breakdown = apply_zone_policy(
        content_score=content_score,
        zone=establishment["zone"],
        signals=signals,
        breakdown=score_breakdown,
    )

    requires_manual_review = (
        confidence < 0.50 or establishment["zone"] == "UNKNOWN"
    )

    reasoning_items = build_reasoning(
        predicted_category=predicted_category,
        confidence=confidence,
        signals=signals,
        zone=establishment["zone"],
        violations=establishment["violations"],
    )

    result = {
        "complaint_id": str(row["complaint_id"]),
        "subject": predicted_category.replace("_", " ").title(),
        "message": message,
        "province": str(row.get("province", "Unknown")),
        "establishment_name": establishment["name"],
        "submission_date": str(row.get("submission_date", "")),
        "original_category": str(row.get("category", "")),
        "predicted_category": predicted_category,
        "category": predicted_category,
        "category_confidence": round(confidence, 4),
        "signals": signals,
        "content_score": content_score,
        "establishment": establishment,
        # Flat copies make the JSON easy for the dashboard to consume.
        "establishment_id": establishment["id"],
        "zone": establishment["zone"],
        "violations": establishment["violations"],
        "open_complaints": establishment["open_complaints"],
        "last_inspection": establishment["last_inspection"],
        "triage_score": final_score,
        "priority_category": priority,
        "requires_manual_review": requires_manual_review,
        "reasoning": " ".join(reasoning_items),
        "reasoning_items": reasoning_items,
        "score_breakdown": final_breakdown,
        "recommended_action": recommended_action(priority, confidence),
        "status": "New",
        "cluster_alert": False,
    }

    return result


def add_cluster_alerts(
    results: list[dict[str, Any]],
    window_days: int = 30,
    minimum_count: int = 3,
) -> None:
    """
    Mark recent groups of similar complaints at the same establishment.

    A cluster is:
      - same matched establishment
      - same predicted category
      - at least minimum_count complaints
      - within window_days between earliest and latest report
    """
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for result in results:
        establishment_id = result.get("establishment_id")

        if not establishment_id:
            continue

        key = (
            str(establishment_id),
            str(result["predicted_category"]),
        )
        groups.setdefault(key, []).append(result)

    for group in groups.values():
        if len(group) < minimum_count:
            continue

        dated_items = []

        for item in group:
            date = pd.to_datetime(
                item.get("submission_date"),
                errors="coerce",
            )

            if pd.notna(date):
                dated_items.append((date, item))

        if len(dated_items) < minimum_count:
            continue

        dated_items.sort(key=lambda pair: pair[0])

        for index, (current_date, current_item) in enumerate(dated_items):
            start_date = current_date - pd.Timedelta(days=window_days)

            nearby = [
                item
                for date, item in dated_items
                if start_date <= date <= current_date
            ]

            if len(nearby) >= minimum_count:
                for item in nearby:
                    item["cluster_alert"] = True
                    item["cluster_count"] = len(nearby)

                    cluster_reason = (
                        f"{len(nearby)} similar complaints were detected "
                        f"for this establishment within {window_days} days."
                    )

                    if cluster_reason not in item["reasoning_items"]:
                        item["reasoning_items"].append(cluster_reason)
                        item["reasoning"] = " ".join(
                            item["reasoning_items"]
                        )

                    # Cluster evidence can raise urgency, while preserving
                    # the mandatory GREEN/YELLOW/RED policy.
                    old_score = item["triage_score"]
                    tentative_score = min(old_score + 8, 100)

                    zone = item["zone"]

                    if zone == "GREEN":
                        tentative_score = min(tentative_score, 59)

                    item["triage_score"] = tentative_score

                    if tentative_score >= 80:
                        item["priority_category"] = "CRITICAL"
                    elif tentative_score >= 60:
                        item["priority_category"] = "HIGH"
                    elif tentative_score >= 30:
                        item["priority_category"] = "MEDIUM"
                    else:
                        item["priority_category"] = "LOW"

                    if tentative_score != old_score:
                        item["score_breakdown"].append(
                            {
                                "label": "Similar complaint cluster",
                                "points": tentative_score - old_score,
                            }
                        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not COMPLAINTS_CSV.exists():
        raise FileNotFoundError(
            f"Missing complaints file: {COMPLAINTS_CSV}"
        )

    if not ESTABLISHMENTS_CSV.exists():
        raise FileNotFoundError(
            f"Missing establishments file: {ESTABLISHMENTS_CSV}"
        )

    print("Loading data...")
    complaints_df = pd.read_csv(COMPLAINTS_CSV)
    establishments_df = pd.read_csv(ESTABLISHMENTS_CSV)

    validate_complaints_dataframe(complaints_df)

    print(f"Complaints loaded: {len(complaints_df)}")
    print(f"Establishments loaded: {len(establishments_df)}")

    print("\nTraining category classifier...")
    model, metrics = train_and_evaluate(complaints_df)

    joblib.dump(model, MODEL_PATH)

    with METRICS_PATH.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, indent=2)

    establishment_lookup = prepare_establishment_lookup(
        establishments_df
    )

    print("\nTriaging all complaints...")
    results = [
        triage_complaint(
            row=row,
            model=model,
            establishment_lookup=establishment_lookup,
        )
        for _, row in complaints_df.iterrows()
    ]

    add_cluster_alerts(results)

    # Sort exactly as the dashboard needs:
    # CRITICAL first, then HIGH, MEDIUM, LOW;
    # score descending inside each priority.
    # results.sort(
    #     key=lambda item: (
    #         PRIORITY_RANK.get(item["priority_category"], 0),
    #         item["triage_score"],
    #     ),
    #     reverse=True,
    # )

    priority_counts = {
        priority: sum(
            1
            for item in results
            if item["priority_category"] == priority
        )
        for priority in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    }

    output = {
        "metadata": {
            "total_complaints": len(results),
            "priority_counts": priority_counts,
            "model_accuracy": metrics["accuracy"],
            "model_macro_f1": metrics["macro_f1"],
        },
        "complaints": results,
    }

    with RESULTS_PATH.open("w", encoding="utf-8") as file:
        json.dump(output, file, indent=2, ensure_ascii=False)

    print("\nFinished.")
    print(f"Saved model:  {MODEL_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")
    print(f"Saved JSON:    {RESULTS_PATH}")
    print(f"Priorities:    {priority_counts}")


if __name__ == "__main__":
    main()