"""
LifeScan AI - Heart Failure Detection System
Production Machine Learning Microservice

Flask API for real-time patient heart disease risk prediction.
"""

import os
import logging
from typing import Dict, Any, Tuple
import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Logging Configuration ──────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("lifescan_ml_service")

# ── Flask Application Initialization ───────────────────────────
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for React/Node.js

# ── Constants & Schema Definition ──────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(BASE_DIR, "heart_disease_model.pkl")
SCALER_FILE = os.path.join(BASE_DIR, "feature_scaler.pkl")
ENCODERS_FILE = os.path.join(BASE_DIR, "label_encoders.pkl")

# Exact feature ordering required by the trained model
FEATURE_ORDER = [
    "Age",
    "Sex",
    "ChestPainType",
    "RestingBP",
    "Cholesterol",
    "FastingBS",
    "RestingECG",
    "MaxHR",
    "ExerciseAngina",
    "Oldpeak",
    "ST_Slope"
]

# Validation rules for categorical features
CATEGORICAL_RULES = {
    "Sex": {"allowed": ["M", "F"], "case_sensitive": False},
    "ChestPainType": {"allowed": ["ASY", "ATA", "NAP", "TA"], "case_sensitive": False},
    "RestingECG": {"allowed": ["Normal", "LVH", "ST"], "case_sensitive": False},
    "ExerciseAngina": {"allowed": ["Y", "N"], "case_sensitive": False},
    "ST_Slope": {"allowed": ["Up", "Flat", "Down"], "case_sensitive": False}
}

# Validation rules for numeric features (min, max, type)
NUMERIC_RULES = {
    "Age": {"min": 1, "max": 120, "type": int},
    "RestingBP": {"min": 40, "max": 300, "type": float},
    "Cholesterol": {"min": 0, "max": 700, "type": float},
    "FastingBS": {"min": 0, "max": 1, "type": int},
    "MaxHR": {"min": 40, "max": 250, "type": float},
    "Oldpeak": {"min": -5.0, "max": 10.0, "type": float}
}

# ── Model & Preprocessing Artifact Loader ──────────────────────
model = None
scaler = None
label_encoders = None
artifacts_loaded = False


def load_artifacts() -> bool:
    """Load serialized model, scaler, and label encoders into memory once."""
    global model, scaler, label_encoders, artifacts_loaded
    try:
        if not os.path.exists(MODEL_FILE):
            raise FileNotFoundError(f"Model file not found at: {MODEL_FILE}")
        if not os.path.exists(SCALER_FILE):
            raise FileNotFoundError(f"Scaler file not found at: {SCALER_FILE}")
        if not os.path.exists(ENCODERS_FILE):
            raise FileNotFoundError(f"Label encoders file not found at: {ENCODERS_FILE}")

        model = joblib.load(MODEL_FILE)
        scaler = joblib.load(SCALER_FILE)
        label_encoders = joblib.load(ENCODERS_FILE)
        artifacts_loaded = True
        logger.info("All ML artifacts loaded successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to load ML artifacts: {str(e)}", exc_info=True)
        artifacts_loaded = False
        return False


# Load artifacts at module initialization
load_artifacts()


# ── Input Validation & Preprocessing Pipeline ──────────────────
def validate_patient_payload(data: Any) -> Tuple[bool, Dict[str, Any], Dict[str, Any]]:
    """
    Validates input payload against data types, mandatory fields, and acceptable ranges.
    Returns: (is_valid, sanitized_data, error_details)
    """
    if not isinstance(data, dict):
        return False, {}, {
            "error": "Invalid Payload",
            "message": "JSON body must be an object containing patient features."
        }

    # Check for missing fields
    missing_fields = [feat for feat in FEATURE_ORDER if feat not in data]
    if missing_fields:
        return False, {}, {
            "error": "Missing Required Fields",
            "message": f"Payload is missing {len(missing_fields)} required feature(s).",
            "missing_fields": missing_fields
        }

    sanitized = {}
    validation_errors = []

    # Validate Categorical Features
    for field, rule in CATEGORICAL_RULES.items():
        val = data.get(field)
        if val is None or not isinstance(val, (str, int)):
            validation_errors.append({
                "field": field,
                "error": f"Field '{field}' must be a non-empty string.",
                "allowed_values": rule["allowed"]
            })
            continue

        str_val = str(val).strip()
        matched = False
        for allowed in rule["allowed"]:
            if str_val.lower() == allowed.lower():
                sanitized[field] = allowed  # Canonical casing matching encoder classes
                matched = True
                break

        if not matched:
            validation_errors.append({
                "field": field,
                "error": f"Invalid category '{val}'.",
                "allowed_values": rule["allowed"]
            })

    # Validate Numeric Features
    for field, rule in NUMERIC_RULES.items():
        val = data.get(field)
        if val is None:
            validation_errors.append({
                "field": field,
                "error": f"Field '{field}' is required."
            })
            continue

        # FastingBS allows booleans (True/False)
        if field == "FastingBS" and isinstance(val, bool):
            val = 1 if val else 0

        try:
            # Handle float strings, decimal commas from international keyboards, and whitespace
            val_str = str(val).strip().replace(',', '.')
            if rule["type"] is int:
                num_val = int(round(float(val_str)))
            else:
                num_val = float(val_str)

            if num_val < rule["min"] or num_val > rule["max"]:
                validation_errors.append({
                    "field": field,
                    "error": f"Value {num_val} is out of acceptable clinical range [{rule['min']}, {rule['max']}]."
                })
            else:
                sanitized[field] = num_val
        except (ValueError, TypeError):
            validation_errors.append({
                "field": field,
                "error": f"Field '{field}' must be a valid number of type {rule['type'].__name__}."
            })

    if validation_errors:
        return False, {}, {
            "error": "Input Validation Failed",
            "message": "One or more input fields failed validation.",
            "details": validation_errors
        }

    return True, sanitized, {}


def preprocess_input(sanitized_data: Dict[str, Any]) -> np.ndarray:
    """
    Transforms validated patient dictionary into the scaled NumPy feature vector:
    1. Order features according to FEATURE_ORDER
    2. Apply fitted LabelEncoder for categorical variables
    3. Apply fitted StandardScaler
    """
    input_df = pd.DataFrame([sanitized_data])[FEATURE_ORDER]

    # Encode categorical columns
    for col, le in label_encoders.items():
        if col in input_df.columns:
            val = input_df[col].iloc[0]
            # Transform categorical string into integer index
            input_df[col] = le.transform([val])[0]

    # Scale all features with the pre-fitted StandardScaler
    scaled_array = scaler.transform(input_df)
    scaled_df = pd.DataFrame(scaled_array, columns=FEATURE_ORDER)
    return scaled_df


def determine_risk_category(risk_percentage: float) -> str:
    """Classifies risk percentage into clinical triage categories."""
    if risk_percentage < 35.0:
        return "Low Risk"
    elif risk_percentage < 65.0:
        return "Moderate Risk"
    else:
        return "High Risk"


# ── API Endpoints ──────────────────────────────────────────────
@app.route("/", methods=["GET"])
def root_info():
    """Service metadata endpoint."""
    return jsonify({
        "service": "LifeScan AI Heart Disease Prediction Service",
        "version": "1.0.0",
        "status": "online",
        "endpoints": {
            "predict": "POST /predict",
            "health": "GET /health"
        }
    }), 200


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify model readiness."""
    if not artifacts_loaded:
        return jsonify({
            "status": "unhealthy",
            "message": "Model artifacts are not loaded."
        }), 503

    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "scaler_loaded": scaler is not None,
        "encoders_loaded": label_encoders is not None,
        "model_type": type(model).__name__
    }), 200


@app.route("/predict", methods=["POST"])
def predict():
    """
    Endpoint for patient heart disease risk evaluation.

    Expects JSON payload with 11 features:
    Age, Sex, ChestPainType, RestingBP, Cholesterol, FastingBS,
    RestingECG, MaxHR, ExerciseAngina, Oldpeak, ST_Slope.

    Returns:
    {
      "prediction": 1,
      "risk_category": "High Risk",
      "risk_percentage": 91.4
    }
    """
    # Verify model artifact readiness
    if not artifacts_loaded:
        if not load_artifacts():
            return jsonify({
                "status": "error",
                "error": "Service Unavailable",
                "message": "Model artifacts are unavailable on the server."
            }), 503

    # Check request format
    if not request.is_json:
        return jsonify({
            "status": "error",
            "error": "Invalid Content-Type",
            "message": "Request body must be valid JSON with Content-Type: application/json."
        }), 400

    try:
        payload = request.get_json()
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": "Malformed JSON",
            "message": f"Could not parse request body as JSON: {str(e)}"
        }), 400

    if not payload:
        return jsonify({
            "status": "error",
            "error": "Empty Request",
            "message": "Request body cannot be empty."
        }), 400

    # Validate input payload
    is_valid, sanitized_data, error_response = validate_patient_payload(payload)
    if not is_valid:
        return jsonify(error_response), 400

    # Preprocessing and Model Inference
    try:
        scaled_features = preprocess_input(sanitized_data)

        # Binary prediction (0 = No Disease, 1 = Disease)
        prediction = int(model.predict(scaled_features)[0])

        # Risk probability calculation
        if hasattr(model, "predict_proba"):
            prob_positive = float(model.predict_proba(scaled_features)[0][1])
            risk_percentage = round(prob_positive * 100, 1)
        else:
            # Fallback for models without predict_proba
            risk_percentage = 100.0 if prediction == 1 else 0.0

        risk_category = determine_risk_category(risk_percentage)

        response = {
            "prediction": prediction,
            "risk_category": risk_category,
            "risk_percentage": risk_percentage
        }

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Inference execution failed: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "error": "Prediction Error",
            "message": "An internal error occurred during prediction computation."
        }), 500


# ── Global Error Handlers ──────────────────────────────────────
@app.errorhandler(404)
def resource_not_found(e):
    return jsonify({
        "status": "error",
        "error": "Not Found",
        "message": "The requested endpoint does not exist."
    }), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({
        "status": "error",
        "error": "Method Not Allowed",
        "message": f"HTTP method '{request.method}' is not allowed for this endpoint."
    }), 405


@app.errorhandler(500)
def internal_server_error(e):
    return jsonify({
        "status": "error",
        "error": "Internal Server Error",
        "message": "An unexpected server error occurred."
    }), 500


# ── Local Development Runner ───────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting LifeScan AI ML service on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
