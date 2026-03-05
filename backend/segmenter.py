from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from scipy.signal import savgol_filter

from pre_processing import img_processing


@dataclass(frozen=True)
class SegmentedImage:
    filename: str
    png_base64: str


def _vertical_projection(binary_img: np.ndarray) -> np.ndarray:
    # Sum white pixels column-wise
    return np.sum(binary_img > 0, axis=0)


def _smooth_projection(proj: np.ndarray) -> np.ndarray:
    # Savitzky–Golay smoothing (robust for small widths)
    n = int(proj.shape[0])
    if n < 5:
        return proj.astype(np.float64)

    window = min(21, n)
    if window % 2 == 0:
        window -= 1
    if window < 5:
        window = 5 if n >= 5 else n | 1
    window = min(window, n if n % 2 == 1 else n - 1)

    polyorder = 3
    if window <= polyorder:
        polyorder = max(1, window - 2)

    return savgol_filter(proj.astype(np.float64), window, polyorder)


def _find_split_points(
    proj: np.ndarray, num_letters: int, margin_ratio: float = 0.06
) -> list[int]:
    w = int(len(proj))
    margin = int(w * margin_ratio)
    valid_proj = proj[margin : w - margin]

    if num_letters <= 1 or len(valid_proj) == 0:
        return []

    min_val = float(np.min(valid_proj))
    max_val = float(np.max(valid_proj))
    threshold = min_val + 0.08 * (max_val - min_val)
    low_mask = valid_proj <= threshold

    valleys: list[tuple[int, int]] = []
    start: int | None = None
    for i, v in enumerate(low_mask):
        if bool(v) and start is None:
            start = i
        elif (not bool(v)) and start is not None:
            valleys.append((start, i - 1))
            start = None
    if start is not None:
        valleys.append((start, len(low_mask) - 1))

    if not valleys:
        return []

    region_width = len(valid_proj) / num_letters
    region_centers = [(i + 1) * region_width for i in range(num_letters - 1)]

    splits: list[int] = []
    for rc in region_centers:
        best: tuple[int, int] | None = None
        best_dist = float("inf")
        for s, e in valleys:
            c = (s + e) / 2
            dist = abs(c - rc)
            if dist < best_dist:
                best = (s, e)
                best_dist = dist
        if best is not None:
            s, e = best
            splits.append(int((s + e) / 2) + margin)

    return sorted(splits)


def _split_by_vertical_projection(
    binary_img: np.ndarray, num_letters: int
) -> tuple[list[np.ndarray], np.ndarray, list[int]]:
    proj = _vertical_projection(binary_img)
    proj_smooth = _smooth_projection(proj)
    splits = _find_split_points(proj_smooth, num_letters)

    h, w = binary_img.shape[:2]
    xs = [0] + splits + [w]

    letters: list[np.ndarray] = []
    for i in range(len(xs) - 1):
        part = binary_img[:, xs[i] : xs[i + 1]]
        letters.append(part)

    return letters, proj_smooth, splits


def _tight_crop(img: np.ndarray) -> np.ndarray:
    ys, xs = np.where(img > 0)
    if len(xs) == 0:
        return img
    return img[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def _encode_png_base64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise ValueError("Failed to encode PNG")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def segment_uploaded_image(
    image_bytes: bytes,
    *,
    num_letters: int,
    crop: bool = True,
) -> dict[str, Any]:
    if num_letters < 1:
        raise ValueError("num_letters must be >= 1")

    np_buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image (is it a valid PNG/JPG?)")

    binary = img_processing(img)
    letters, _proj, splits = _split_by_vertical_projection(binary, num_letters)

    out: list[SegmentedImage] = []
    for i, letter in enumerate(letters, start=1):
        letter_img = _tight_crop(letter) if crop else letter
        out.append(
            SegmentedImage(
                filename=f"char_{i}.png",
                png_base64=_encode_png_base64(letter_img),
            )
        )

    return {
        "num_letters": num_letters,
        "splits": splits,
        "images": [img.__dict__ for img in out],
    }

