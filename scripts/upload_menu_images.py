"""
One-time script to bulk-upload menu item images from ~/Downloads to S3
and update each MenuItem's image_url in the database.
"""

import os
import sys
import re
import uuid
import boto3

# make sure the project root is on the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models.menu import MenuItem

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:5v4n7wA!@localhost:5432/sushi_pos")
DOWNLOADS = os.path.expanduser("~/Downloads")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "sushi-pos-uploads")
S3_PREFIX = "menu-items"
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def normalize(text_: str) -> str:
    """Lowercase, strip non-alpha, collapse whitespace."""
    t = text_.lower()
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def extract_name_from_filename(filename: str) -> str:
    """Best-effort extraction of the dish name from a raw filename."""
    name = os.path.splitext(filename)[0]
    # remove known noise words / prefixes / suffixes found in the downloads
    noise = [
        r"^recipe", r"recipe$", r"\d+x\d+", r"\d+$", r"square",
        r"masi\s*masa", r"agedashi\s*tofu\s*square.*",
    ]
    n = normalize(name)
    for pat in noise:
        n = re.sub(pat, " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def best_match(candidate: str, items: list[MenuItem]) -> MenuItem | None:
    """
    Return the MenuItem whose normalized name has the best token overlap
    with the candidate string.  Returns None when no good match exists.
    """
    cand_tokens = set(candidate.split())
    best_item = None
    best_score = 0
    for item in items:
        item_tokens = set(normalize(item.name).split())
        # intersection over union (Jaccard-like)
        overlap = len(cand_tokens & item_tokens)
        union = len(cand_tokens | item_tokens)
        score = overlap / union if union else 0
        # also boost if the whole item name is contained in the candidate
        if normalize(item.name) in candidate:
            score += 0.5
        if score > best_score:
            best_score = score
            best_item = item
    # require a minimum quality — at least one matching word
    return best_item if best_score > 0.1 else None


def main():
    # --- collect jpg files ---
    jpg_files = [
        f for f in os.listdir(DOWNLOADS)
        if f.lower().endswith(".jpg")
    ]
    if not jpg_files:
        print("No .jpg files found in ~/Downloads")
        return

    # --- connect to DB ---
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    items = db.query(MenuItem).all()
    print(f"Found {len(items)} menu items in DB, {len(jpg_files)} .jpg files in Downloads\n")

    # --- S3 client ---
    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=AWS_REGION,
    )

    matched = []
    unmatched = []

    for filename in sorted(jpg_files):
        candidate = extract_name_from_filename(filename)
        item = best_match(candidate, items)
        if item:
            matched.append((filename, item))
        else:
            unmatched.append(filename)

    # show plan before doing anything
    print("=== MATCH PLAN ===")
    for filename, item in matched:
        marker = " [will overwrite]" if item.image_url else ""
        print(f"  {filename!r}  →  [{item.id}] {item.name!r}{marker}")

    if unmatched:
        print("\n=== UNMATCHED (will skip) ===")
        for f in unmatched:
            print(f"  {f!r}")

    print(f"\n{len(matched)} images will be uploaded, {len(unmatched)} skipped.")
    confirm = input("\nProceed? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    # --- upload & update ---
    errors = []
    for filename, item in matched:
        filepath = os.path.join(DOWNLOADS, filename)
        key = f"{S3_PREFIX}/{item.id}_{uuid.uuid4().hex}.jpg"
        try:
            with open(filepath, "rb") as f:
                s3.upload_fileobj(
                    f,
                    S3_BUCKET,
                    key,
                    ExtraArgs={"ContentType": "image/jpeg"},
                )
            url = f"https://{S3_BUCKET}.s3.amazonaws.com/{key}"
            item.image_url = url
            db.add(item)
            print(f"  ✓  {item.name!r}  →  {url}")
        except Exception as e:
            errors.append((filename, str(e)))
            print(f"  ✗  {filename!r}  ERROR: {e}")

    db.commit()
    db.close()

    print(f"\nDone. {len(matched) - len(errors)} uploaded, {len(errors)} errors.")
    if errors:
        for f, e in errors:
            print(f"  ERROR {f!r}: {e}")


if __name__ == "__main__":
    main()
