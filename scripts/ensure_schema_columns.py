"""
Ensure DB columns exist for newer ORM fields (idempotent).

SQLAlchemy create_all() does not add columns to existing tables. Run this if
you see UndefinedColumn errors after pulling model changes.

Run from project root:
  source .venv/bin/activate   # or your venv
  python scripts/ensure_schema_columns.py
"""

import sys

sys.path.insert(0, ".")

from app.core.database import ensure_schema_columns  # noqa: E402


def main() -> None:
    ensure_schema_columns()
    print("Schema columns verified (menu_items.ayce_surcharge, orders leftover_charge_*)")


if __name__ == "__main__":
    main()
