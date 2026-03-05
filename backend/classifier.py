from __future__ import annotations

import os
from typing import Tuple

import cv2
import numpy as np

# Suppress TF logs before importing tensorflow
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import tensorflow as tf
from tensorflow.keras.applications.convnext import preprocess_input

# Use CPU for prediction
tf.config.set_visible_devices([], 'GPU')

# Sinhala letters our model knows (in alphabetical order as used in training)
CLASS_NAMES = ['ක', 'ග', 'ත', 'න', 'ප', 'ම', 'ර', 'ල', 'ස', 'හ']

_model: tf.keras.Model | None = None

def load_model() -> None:
    """Load the model once into memory."""
    global _model
    if _model is not None:
        return

    model_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "sinhala_convnext_full.keras"
    )

    if not os.path.exists(model_path):
        print(f"Warning: Model not found at {model_path}. Classification will be skipped.")
        return

    print("Loading ConvNeXt Sinhala Character Classifier...")
    _model = tf.keras.models.load_model(model_path)
    print("Classifier loaded successfully.")

def predict_character(img_bgr: np.ndarray) -> tuple[str | None, float | None]:
    """
    Given a BGR image crop of a single character, returns the predicted 
    Sinhala character and the confidence percentage (0-100).
    If model is not loaded, returns (None, None).
    """
    if _model is None:
        return None, None

    # Processing matching the training pipeline
    try:
        # Resize to 128x128
        img_resized = cv2.resize(img_bgr, (128, 128))
        
        # ConvNeXt expects RGB
        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
        
        # Convert to float32 and preprocess
        img_float = img_rgb.astype(np.float32)
        img_preprocessed = preprocess_input(img_float)
        
        # Add batch dimension
        img_batch = np.expand_dims(img_preprocessed, axis=0)
        
        # Predict
        preds = _model.predict(img_batch, verbose=0)
        
        # Extract results
        class_index = np.argmax(preds)
        confidence = float(np.max(preds) * 100.0) # 0 to 100 format
        predicted_label = CLASS_NAMES[class_index]
        
        return predicted_label, confidence
        
    except Exception as e:
        print(f"Prediction error: {e}")
        return None, None
