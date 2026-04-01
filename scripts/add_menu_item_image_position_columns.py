"""
Add menu item image framing columns used by manager image editor.

Run:
  source .venv/bin/activate
  python scripts/add_menu_item_image_position_columns.py
"""

import sys

from sqlalchemy import text

sys.path.insert(0, ".")
from app.core.database import engine  # noqa: E402


SQL = """
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS image_position_x DOUBLE PRECISION NOT NULL DEFAULT 50.0,
  ADD COLUMN IF NOT EXISTS image_position_y DOUBLE PRECISION NOT NULL DEFAULT 50.0,
  ADD COLUMN IF NOT EXISTS image_zoom DOUBLE PRECISION NOT NULL DEFAULT 1.0;
"""


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text(SQL))
    print("Added/verified menu_items image framing columns.")


if __name__ == "__main__":
    main()
