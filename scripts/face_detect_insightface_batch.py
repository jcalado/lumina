#!/usr/bin/env python3
"""
Batch InsightFace helper for processing multiple images efficiently.

Requirements:
  pip install insightface opencv-python-headless numpy

Usage:
  python scripts/face_detect_insightface_batch.py /path/to/temp/dir

Model configuration (via environment variables):
  - LUMINA_INSIGHTFACE_MODEL: model pack name (default: "buffalo_l")
      Examples: "buffalo_l", "antelopev2".
  - LUMINA_INSIGHTFACE_PROVIDERS: ONNX Runtime providers CSV (default: "CPUExecutionProvider")
      Examples: "CUDAExecutionProvider,CPUExecutionProvider" or "CPUExecutionProvider".
  - LUMINA_INSIGHTFACE_CTX_ID: GPU id (>=0) or -1 for CPU (default: -1)
  - LUMINA_INSIGHTFACE_DET_SIZE: detector size as "W,H" (default: "640,640")

Expected input:
  - A directory containing image files named with their photo IDs
  - A batch.json file in the directory with the list of files to process

Outputs JSON to stdout with shape:
  { 
    "results": [
      {
        "photoId": "photo123",
        "faces": [ { "box": [x1,y1,x2,y2], "score": float, "embedding": [..] }, ... ],
        "error": null
      },
      ...
    ]
  }
"""
import sys
import json
import os
import glob
from contextlib import redirect_stdout
import io

try:
    import cv2
    from insightface.app import FaceAnalysis
except Exception as e:
    print(json.dumps({"error": f"missing dependency: {e}"}))
    sys.exit(2)


def process_single_image(fa, img_path, photo_id):
    """Process a single image and return the result."""
    try:
        if not os.path.exists(img_path):
            return {
                "photoId": photo_id,
                "faces": [],
                "error": "image not found"
            }

        img = cv2.imread(img_path)
        if img is None:
            return {
                "photoId": photo_id,
                "faces": [],
                "error": "could not read image"
            }

        faces = fa.get(img)

        out = []
        for f in faces:
            # f.bbox is [x1, y1, x2, y2]
            try:
                bbox = [float(x) for x in f.bbox]
            except Exception:
                # older versions may use f.bbox.tolist()
                bbox = [float(x) for x in f.bbox.tolist()]

            score = float(getattr(f, 'det_score', getattr(f, 'score', 0.0)))

            # embedding is a numpy array
            emb = None
            if hasattr(f, 'embedding') and f.embedding is not None:
                try:
                    emb = [float(x) for x in f.embedding.tolist()]
                except Exception:
                    emb = [float(x) for x in f.embedding]

            out.append({
                'box': bbox,
                'score': score,
                'embedding': emb or []
            })

        return {
            "photoId": photo_id,
            "faces": out,
            "error": None
        }

    except Exception as e:
        return {
            "photoId": photo_id,
            "faces": [],
            "error": f"Processing error: {e}"
        }


def _get_env(name: str, default: str) -> str:
    try:
        v = os.environ.get(name)
        return v if (v is not None and str(v).strip() != "") else default
    except Exception:
        return default


def _parse_providers(env_val: str) -> list:
    parts = [p.strip() for p in env_val.split(',') if p.strip()]
    return parts or ["CPUExecutionProvider"]


def _parse_det_size(env_val: str) -> tuple:
    try:
        w_str, h_str = env_val.split(',')
        w = int(w_str.strip()); h = int(h_str.strip())
        if w > 0 and h > 0:
            return (w, h)
    except Exception:
        pass
    return (640, 640)


def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "missing temp directory path"}))
            sys.exit(1)

        temp_dir = sys.argv[1]
        if not os.path.exists(temp_dir):
            print(json.dumps({"error": "temp directory not found"}))
            sys.exit(1)

        # Read the batch configuration
        batch_file = os.path.join(temp_dir, 'batch.json')
        if not os.path.exists(batch_file):
            print(json.dumps({"error": "batch.json not found"}))
            sys.exit(1)

        with open(batch_file, 'r') as f:
            batch_config = json.load(f)

        if 'files' not in batch_config:
            print(json.dumps({"error": "batch.json missing 'files' array"}))
            sys.exit(1)

        # Initialize the face analysis model ONCE for the entire batch
        # Redirect stdout to stderr for insightface's internal prints
        f = io.StringIO()
        with redirect_stdout(f):
            # Read configuration from environment
            model_name = _get_env('LUMINA_INSIGHTFACE_MODEL', 'buffalo_l')
            providers = _parse_providers(_get_env('LUMINA_INSIGHTFACE_PROVIDERS', 'CPUExecutionProvider'))
            try:
                ctx_id = int(_get_env('LUMINA_INSIGHTFACE_CTX_ID', '-1'))
            except Exception:
                ctx_id = -1
            det_size = _parse_det_size(_get_env('LUMINA_INSIGHTFACE_DET_SIZE', '640,640'))

            # Construct FaceAnalysis with explicit model pack
            try:
                fa = FaceAnalysis(name=model_name, allowed_modules=["detection", "recognition"], providers=providers)
            except Exception:
                # Fallback: try default pack if model not available
                fa = FaceAnalysis(allowed_modules=["detection", "recognition"], providers=providers)
            fa.prepare(ctx_id=ctx_id, det_size=det_size)

        # Print captured stdout to stderr
        sys.stderr.write(f.getvalue())

        results = []
        for file_info in batch_config['files']:
            photo_id = file_info['photoId']
            filename = file_info['filename']
            img_path = os.path.join(temp_dir, filename)
            
            result = process_single_image(fa, img_path, photo_id)
            results.append(result)

        print(json.dumps({"results": results}))

    except Exception as e:
        print(json.dumps({"error": f"Python script error: {e}"}))
        sys.exit(1)


if __name__ == '__main__':
    main()
