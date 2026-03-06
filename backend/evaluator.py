"""
evaluator.py — Handwriting quality evaluator for Sinhala characters.

Three sub-scores (each 0-100):
  1. line_compliance  — how well the character stays between the two ruled lines
  2. shape_confidence — model confidence from the existing ConvNeXt classifier
  3. proportion       — how close the char's aspect ratio is to reference images

Overall score = 0.4 * line_compliance + 0.4 * shape_confidence + 0.2 * proportion
"""
from __future__ import annotations

import glob
import os
from typing import Any

import cv2
import numpy as np

from pre_processing import img_processing
from backend.classifier import predict_character
from backend.segmenter import _split_by_vertical_projection, _tight_crop


# ---------------------------------------------------------------------------
# 1. Reference proportion computation (run once at import time)
# ---------------------------------------------------------------------------

def _compute_reference_ratios(words_dir: str) -> float:
    """
    Compute the mean width-to-height ratio of Sinhala characters found in
    the reference images inside `words_dir`.  Returns 1.0 if no images found.
    """
    ratios: list[float] = []
    patterns = [
        os.path.join(words_dir, "*.jpeg"),
        os.path.join(words_dir, "*.jpg"),
        os.path.join(words_dir, "*.png"),
    ]
    paths: list[str] = []
    for p in patterns:
        paths.extend(glob.glob(p))

    for path in paths:
        img = cv2.imread(path)
        if img is None:
            continue
        try:
            binary = img_processing(img)
            # segment into letters (use 2 as default — just to get some chars)
            letters, _, _, _ = _split_by_vertical_projection(binary, 2)
            for ltr in letters:
                cropped = _tight_crop(ltr)
                h, w = cropped.shape[:2]
                if h > 0 and w > 0:
                    ratios.append(w / h)
        except Exception:
            continue

    return float(np.median(ratios)) if ratios else 1.0


_WORDS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "words"
)
_REFERENCE_RATIO: float = _compute_reference_ratios(_WORDS_DIR)


# ---------------------------------------------------------------------------
# 2. Line detection
# ---------------------------------------------------------------------------

def _detect_ruled_lines(img_bgr: np.ndarray) -> tuple[int | None, int | None]:
    """
    Detect the two main horizontal ruled lines (baseline + headline) in an
    image using Hough line detection on a blue-channel-emphasised version.

    Returns (y_top, y_bottom) in pixel coordinates, or (None, None) if not found.
    """
    h, w = img_bgr.shape[:2]

    # Emphasise blue ink lines: blue channel is strong, red/green are weaker
    b, g, r = cv2.split(img_bgr)
    # Blue lines appear where B is high and G/R are lower
    blue_mask = cv2.subtract(b.astype(np.int16), ((r.astype(np.int16) + g.astype(np.int16)) // 2).astype(np.int16))
    blue_mask = np.clip(blue_mask, 0, 255).astype(np.uint8)

    # Also try grayscale approach (lines are darker than paper)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, line_bin = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Combine: use horizontal kernel to amplify horizontal structures
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 4, 1))
    horiz_blue = cv2.morphologyEx(blue_mask, cv2.MORPH_OPEN, kernel)
    horiz_gray = cv2.morphologyEx(line_bin, cv2.MORPH_OPEN, kernel)
    combined = cv2.bitwise_or(horiz_blue, horiz_gray)

    # Horizontal projection: sum each row
    proj = np.sum(combined > 0, axis=1).astype(np.float32)

    # Find the two strongest horizontal bands
    threshold = proj.max() * 0.3
    strong_rows = np.where(proj >= threshold)[0]

    if len(strong_rows) < 2:
        # Fallback: split image into thirds and use 1/3 and 2/3 heights
        return h // 3, (2 * h) // 3

    # Cluster strong rows into top and bottom line
    midpoint = h // 2
    top_rows = strong_rows[strong_rows < midpoint]
    bottom_rows = strong_rows[strong_rows >= midpoint]

    y_top = int(np.median(top_rows)) if len(top_rows) > 0 else h // 3
    y_bottom = int(np.median(bottom_rows)) if len(bottom_rows) > 0 else (2 * h) // 3

    return y_top, y_bottom


# ---------------------------------------------------------------------------
# 3. Individual sub-scores
# ---------------------------------------------------------------------------

def _line_compliance_score(
    char_binary: np.ndarray,
    img_h: int,
    y_top: int,
    y_bottom: int,
    x_start: int,
    x_end: int,
) -> float:
    """
    Score 0-100 for how much of the character stays within [y_top, y_bottom].
    """
    total_pixels = int(np.sum(char_binary > 0))
    if total_pixels == 0:
        return 100.0

    # Rows in the full image that correspond to this column slice
    h_char = char_binary.shape[0]  # == img_h (binary is full-height slice)

    # Create a mask of the in-band rows
    in_band = np.zeros(h_char, dtype=bool)
    t = max(0, y_top)
    b = min(h_char, y_bottom + 1)
    in_band[t:b] = True

    inside_pixels = int(np.sum((char_binary > 0) & in_band[:, None]))
    return min(100.0, 100.0 * inside_pixels / total_pixels)


def _proportion_score(char_binary: np.ndarray, reference_ratio: float) -> float:
    """
    Score 0-100 based on how close the character's w/h ratio is to the reference.
    Deviation of 50% from reference → 0 score.
    """
    ys, xs = np.where(char_binary > 0)
    if len(xs) == 0:
        return 50.0
    h = int(ys.max() - ys.min()) + 1
    w = int(xs.max() - xs.min()) + 1
    if h == 0:
        return 50.0
    ratio = w / h
    deviation = abs(ratio - reference_ratio) / max(reference_ratio, 0.01)
    score = max(0.0, 100.0 * (1.0 - deviation * 2.0))
    return score


# ---------------------------------------------------------------------------
# 4. Main evaluation function
# ---------------------------------------------------------------------------

def evaluate_uploaded_image(
    image_bytes: bytes,
    num_letters: int,
) -> dict[str, Any]:
    """
    Full evaluation pipeline. Returns:
    {
        "overall_score": float,         # 0-100
        "num_letters": int,
        "splits": list[int],
        "images": [
            {
                "filename": str,
                "png_base64": str,
                "predicted_char": str | None,
                "confidence": float | None,
                "line_compliance": float,
                "proportion_score": float,
                "quality_score": float,   # overall 0-100
                "feedback": list[str],
            },
            ...
        ]
    }
    """
    if num_letters < 1:
        raise ValueError("num_letters must be >= 1")

    np_buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image.")

    img_h, img_w = img.shape[:2]

    # Detect ruled lines
    y_top, y_bottom = _detect_ruled_lines(img)

    # Segment characters
    binary = img_processing(img)
    letters, _proj, splits, xs = _split_by_vertical_projection(binary, num_letters)

    out: list[dict[str, Any]] = []

    for i, letter in enumerate(letters, start=1):
        x_start = xs[i - 1]
        x_end = xs[i]

        # Tight-crop binary for display
        from backend.segmenter import _tight_crop, _encode_png_base64
        letter_display = _tight_crop(letter)

        # BGR crop for classifier
        ys_pts, xs_pts = np.where(letter > 0)
        if len(xs_pts) > 0:
            y_min, y_max = int(ys_pts.min()), int(ys_pts.max())
            x_min_loc, x_max_loc = int(xs_pts.min()), int(xs_pts.max())
            bgr_crop = img[y_min:y_max + 1, x_start + x_min_loc:x_start + x_max_loc + 1]
        else:
            bgr_crop = img[:, x_start:x_end]

        # Sub-scores
        line_comp = _line_compliance_score(letter, img_h, y_top, y_bottom, x_start, x_end)
        prop_sc = _proportion_score(letter, _REFERENCE_RATIO)

        predicted_char, confidence = predict_character(bgr_crop)
        shape_sc = float(confidence) if confidence is not None else 50.0

        # Overall quality
        quality = 0.4 * line_comp + 0.4 * shape_sc + 0.2 * prop_sc

        # Human-readable feedback
        feedback: list[str] = []

        if line_comp >= 80:
            feedback.append("✅ Character stays nicely within the ruled lines.")
        elif line_comp >= 50:
            feedback.append("⚠️ Character slightly crosses the ruled lines — try to keep it within the two blue lines.")
        else:
            feedback.append("❌ Character goes too far outside the ruled lines — focus on writing between the lines.")

        if shape_sc >= 80:
            feedback.append("✅ The character shape looks correct and clear.")
        elif shape_sc >= 50:
            feedback.append("⚠️ The character shape is partially recognisable — try to write more neatly.")
        else:
            feedback.append("❌ The character shape is hard to recognise — practise this letter more.")

        if prop_sc >= 80:
            feedback.append("✅ Good size — the character is well-proportioned.")
        elif prop_sc >= 50:
            feedback.append("⚠️ The character is slightly too wide or narrow — aim for a balanced shape.")
        else:
            feedback.append("❌ The character is too stretched or squished — try to match the correct proportions.")

        out.append({
            "filename": f"char_{i}.png",
            "png_base64": _encode_png_base64(letter_display),
            "predicted_char": predicted_char,
            "confidence": round(confidence, 1) if confidence is not None else None,
            "line_compliance": round(line_comp, 1),
            "proportion_score": round(prop_sc, 1),
            "quality_score": round(quality, 1),
            "feedback": feedback,
        })

    overall = float(np.mean([c["quality_score"] for c in out])) if out else 0.0

    return {
        "overall_score": round(overall, 1),
        "num_letters": num_letters,
        "splits": splits,
        "y_top": y_top,
        "y_bottom": y_bottom,
        "images": out,
    }
