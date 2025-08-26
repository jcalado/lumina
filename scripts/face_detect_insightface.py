#!/usr/bin/env python3
"""
Simple InsightFace helper.

Requirements:
  pip install insightface opencv-python-headless numpy

Usage:
  python scripts/face_detect_insightface.py /path/to/image.jpg

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
            # Use CPU (ctx_id=-1). Adjust if you have GPU and want to use it.
            fa = FaceAnalysis(allowed_modules=["detection", "recognition"],  providers=['CPUExecutionProvider'])
            fa.prepare(ctx_id=-1, det_size=(640, 640))

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

    except Exception as e: # Added except block
        print(json.dumps({"error": f"Python script error: {e}"}))
        sys.exit(1)


if __name__ == '__main__':
    main()
