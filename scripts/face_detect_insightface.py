#!/usr/bin/env python3
"""
Simple InsightFace helper.

Requirements:
  pip install insightface opencv-python-headless numpy

Usage:
  python scripts/face_detect_insightface.py /path/to/image.jpg

Model configuration (via environment variables):
  - LUMINA_INSIGHTFACE_MODEL: model pack name (default: "buffalo_l")
  - LUMINA_INSIGHTFACE_PROVIDERS: ONNX Runtime providers CSV (default: "CPUExecutionProvider")
  - LUMINA_INSIGHTFACE_CTX_ID: GPU id (>=0) or -1 for CPU (default: -1)
  - LUMINA_INSIGHTFACE_DET_SIZE: detector size as "W,H" (default: "640,640")

Outputs JSON to stdout with shape:
  { "faces": [ { "box": [x1,y1,x2,y2], "score": float, "embedding": [..] }, ... ] }
"""
import sys
import json
import os
from contextlib import redirect_stdout
import io

try:
    import cv2
    from insightface.app import FaceAnalysis
except Exception as e:
    print(json.dumps({"error": f"missing dependency: {e}"}))
    sys.exit(2)


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
            print(json.dumps({"error": "missing image path"}))
            sys.exit(1)

        img_path = sys.argv[1]
        if not os.path.exists(img_path):
            print(json.dumps({"error": "image not found"}))
            sys.exit(1)

        img = cv2.imread(img_path)
        if img is None:
            print(json.dumps({"error": "could not read image"}))
            sys.exit(1)

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
                fa = FaceAnalysis(name=model_name, allowed_modules=["detection", "recognition"],  providers=providers)
            except Exception:
                # Fallback: try default pack if model not available
                fa = FaceAnalysis(allowed_modules=["detection", "recognition"],  providers=providers)
            fa.prepare(ctx_id=ctx_id, det_size=det_size)

            faces = fa.get(img)

        # Print captured stdout to stderr
        sys.stderr.write(f.getvalue())

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

        print(json.dumps({"faces": out}))

    except Exception as e:
        print(json.dumps({"error": f"Python script error: {e}"}))
        sys.exit(1)


if __name__ == '__main__':
    main()
