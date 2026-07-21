import os
import json
import argparse
from qdrant_client import QdrantClient

parser = argparse.ArgumentParser()
parser.add_argument("--extended", action="store_true", help="Print sample points")
parser.add_argument(
    "--limit",
    type=int,
    default=5,
    help="Number of example points to print with --extended",
)
args = parser.parse_args()

qdrant_port = int(os.getenv("QDRANT_PORT", "6333"))
collection_name = os.getenv("COLLECTION_NAME", "markdown_docs")

client = QdrantClient(url=f"http://localhost:{qdrant_port}")

info = client.get_collection(collection_name)
print("Points:", info.points_count)
print("Status:", info.status)
print("Optimizer status:", info.optimizer_status)

if args.extended:
    points, next_page = client.scroll(
        collection_name=collection_name,
        limit=args.limit,
        with_payload=True,
        with_vectors=False,
    )

    for i, p in enumerate(points, start=1):
        print(f"\nExample point {i}")
        print(f"ID: {p.id}")
        print("Payload:")
        print(json.dumps(p.payload or {}, indent=2, ensure_ascii=False))
        print("-" * 40)