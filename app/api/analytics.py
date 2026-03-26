"""
Analytics API — "The Lens"

Phase 1: Summary metrics + drill-down by dimension.

Recommended indexes to run once in your Supabase SQL editor for best performance:
    CREATE INDEX IF NOT EXISTS idx_orders_created_status
        ON orders (created_at, status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_menu
        ON order_items (order_id, menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category
        ON menu_items (category_id);
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from datetime import date, datetime, timedelta
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class SummaryGroup(BaseModel):
    group_key: str
    order_count: int
    total_revenue: float
    avg_order_value: float


class SummaryResponse(BaseModel):
    total_revenue: float
    order_count: int
    avg_order_value: float
    groups: Optional[List[SummaryGroup]] = None


class DrillRow(BaseModel):
    label: str
    value: float
    order_count: int
    item_id: Optional[int] = None
    category_id: Optional[int] = None


class DrillResponse(BaseModel):
    metric: str
    dimension: str
    rows: List[DrillRow]
    total: float


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_dates(
    start_date: Optional[date], end_date: Optional[date]
) -> tuple[datetime, datetime]:
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time().replace(microsecond=0))
    return start_dt, end_dt


def _meal_period_clause(meal_period: Optional[str]) -> str:
    # Heuristic: lunch = orders placed before 16:00, dinner = 16:00 and later
    if meal_period == "lunch":
        return " AND EXTRACT(HOUR FROM o.created_at) < 16"
    if meal_period == "dinner":
        return " AND EXTRACT(HOUR FROM o.created_at) >= 16"
    return ""


VALID_GROUP_BYS = frozenset(
    {"day", "week", "day_of_week", "hour", "item", "category", "order_type"}
)

VALID_DIMENSIONS = frozenset(
    {"item", "category", "day_of_week", "hour", "order_type", "table"}
)

VALID_METRICS = frozenset(
    {"revenue", "order_count", "avg_order_value", "item_count"}
)


# ---------------------------------------------------------------------------
# GET /analytics/summary
# ---------------------------------------------------------------------------

@router.get("/analytics/summary", response_model=SummaryResponse)
def get_analytics_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    meal_period: Optional[str] = Query(None),   # "lunch" | "dinner"
    group_by: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Returns aggregate metrics for the given time window.
    When group_by is provided, also returns a breakdown list.

    group_by options: day, week, day_of_week, hour, item, category, order_type
    """
    start_dt, end_dt = _resolve_dates(start_date, end_date)
    params: dict = {"start_dt": start_dt, "end_dt": end_dt}

    base_conditions = (
        # Compare enum status as text to avoid enum-literal validation errors.
        # This endpoint is using raw SQL, so casting prevents Postgres from rejecting
        # unknown enum labels (e.g. due to enum drift/casing differences).
        "LOWER(o.status::text) != 'cancelled'"
        " AND o.created_at >= :start_dt"
        " AND o.created_at <= :end_dt"
        + _meal_period_clause(meal_period)
    )

    totals_row = db.execute(
        text(f"""
            SELECT
                COUNT(*)                          AS order_count,
                COALESCE(SUM(o.total_amount), 0)  AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)  AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
        """),
        params,
    ).fetchone()

    groups: Optional[List[SummaryGroup]] = None
    if group_by and group_by in VALID_GROUP_BYS:
        groups = _grouped_summary(db, group_by, base_conditions, params)

    return SummaryResponse(
        total_revenue=float(totals_row.total_revenue),
        order_count=int(totals_row.order_count),
        avg_order_value=float(totals_row.avg_order_value),
        groups=groups,
    )


def _grouped_summary(
    db: Session, group_by: str, base_conditions: str, params: dict
) -> List[SummaryGroup]:
    """Builds and runs the appropriate GROUP BY query for the requested dimension."""

    if group_by == "day":
        select_key = "TO_CHAR(DATE(o.created_at), 'YYYY-MM-DD')"
        order_by   = "DATE(o.created_at)"
        sql = f"""
            SELECT
                {select_key}                          AS group_key,
                COUNT(*)                              AS order_count,
                COALESCE(SUM(o.total_amount), 0)      AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)      AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
            GROUP BY {order_by}, {select_key}
            ORDER BY {order_by}
        """

    elif group_by == "week":
        sql = f"""
            SELECT
                TO_CHAR(DATE_TRUNC('week', o.created_at), 'YYYY-MM-DD') AS group_key,
                COUNT(*)                                                  AS order_count,
                COALESCE(SUM(o.total_amount), 0)                         AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)                         AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
            GROUP BY DATE_TRUNC('week', o.created_at)
            ORDER BY DATE_TRUNC('week', o.created_at)
        """

    elif group_by == "day_of_week":
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'Dy')            AS group_key,
                COUNT(*)                               AS order_count,
                COALESCE(SUM(o.total_amount), 0)       AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)       AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
            GROUP BY EXTRACT(DOW FROM o.created_at), TO_CHAR(o.created_at, 'Dy')
            ORDER BY EXTRACT(DOW FROM o.created_at)
        """

    elif group_by == "hour":
        sql = f"""
            SELECT
                LPAD(EXTRACT(HOUR FROM o.created_at)::int::text, 2, '0') || ':00' AS group_key,
                COUNT(*)                               AS order_count,
                COALESCE(SUM(o.total_amount), 0)       AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)       AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
            GROUP BY EXTRACT(HOUR FROM o.created_at)
            ORDER BY EXTRACT(HOUR FROM o.created_at)
        """

    elif group_by == "order_type":
        sql = f"""
            SELECT
                CASE WHEN o.ayce_order THEN 'AYCE' ELSE 'Regular' END AS group_key,
                COUNT(*)                               AS order_count,
                COALESCE(SUM(o.total_amount), 0)       AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)       AS avg_order_value
            FROM orders o
            WHERE {base_conditions}
            GROUP BY o.ayce_order
            ORDER BY total_revenue DESC
        """

    elif group_by == "item":
        sql = f"""
            SELECT
                mi.name                                        AS group_key,
                COUNT(DISTINCT o.id)                          AS order_count,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue,
                COALESCE(AVG(oi.unit_price), 0)               AS avg_order_value
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            WHERE {base_conditions}
            GROUP BY mi.id, mi.name
            ORDER BY total_revenue DESC
            LIMIT 50
        """

    elif group_by == "category":
        sql = f"""
            SELECT
                COALESCE(c.name, 'Uncategorized')              AS group_key,
                COUNT(DISTINCT o.id)                          AS order_count,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue,
                COALESCE(AVG(oi.unit_price), 0)               AS avg_order_value
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            LEFT JOIN categories c ON c.id = mi.category_id
            WHERE {base_conditions}
            GROUP BY c.id, c.name
            ORDER BY total_revenue DESC
        """

    else:
        return []

    rows = db.execute(text(sql), params).fetchall()
    return [
        SummaryGroup(
            group_key=str(r.group_key).strip(),
            order_count=int(r.order_count),
            total_revenue=float(r.total_revenue),
            avg_order_value=float(r.avg_order_value),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# GET /analytics/drill
# ---------------------------------------------------------------------------

@router.get("/analytics/drill", response_model=DrillResponse)
def get_analytics_drill(
    metric: str = Query("revenue"),
    dimension: str = Query("category"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    meal_period: Optional[str] = Query(None),
    order_type: Optional[str] = Query(None),    # "ayce" | "regular"
    category_id: Optional[int] = Query(None),
    item_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Returns a breakdown of metric by dimension, supporting filter chaining for drill-downs.

    Typical drill path:
      dimension=category
        → click row (category_id=X) → dimension=item&category_id=X
          → click row (item_id=Y)   → dimension=day_of_week&item_id=Y
    """
    # Validate against whitelists (prevents SQL injection via interpolated names)
    if metric not in VALID_METRICS:
        metric = "revenue"
    if dimension not in VALID_DIMENSIONS:
        dimension = "category"

    start_dt, end_dt = _resolve_dates(start_date, end_date)
    params: dict = {"start_dt": start_dt, "end_dt": end_dt}

    # Build order-level filter conditions
    order_conditions = (
        # Cast enum to text for the same reason as in the summary endpoint.
        "LOWER(o.status::text) != 'cancelled'"
        " AND o.created_at >= :start_dt"
        " AND o.created_at <= :end_dt"
        + _meal_period_clause(meal_period)
    )
    if order_type == "ayce":
        order_conditions += " AND o.ayce_order = true"
    elif order_type == "regular":
        order_conditions += " AND o.ayce_order = false"

    # Build item-level filter conditions (only applied when join is present)
    item_filter_parts: list[str] = []
    if category_id is not None:
        item_filter_parts.append("mi.category_id = :category_id")
        params["category_id"] = category_id
    if item_id is not None:
        item_filter_parts.append("oi.menu_item_id = :item_id")
        params["item_id"] = item_id

    rows, total = _drill_query(
        db, dimension, metric, order_conditions, item_filter_parts, params
    )

    return DrillResponse(metric=metric, dimension=dimension, rows=rows, total=total)


def _drill_query(
    db: Session,
    dimension: str,
    metric: str,
    order_conditions: str,
    item_filter_parts: list[str],
    params: dict,
) -> tuple[List[DrillRow], float]:
    """
    Builds the appropriate SQL for the given dimension + metric combination.

    item_filter_parts contains WHERE clauses referencing oi/mi columns.
    These are only applied when the query already joins order_items + menu_items.
    For time/type dimensions, a conditional join is added when item filters are present.
    """
    has_item_filters = bool(item_filter_parts)
    item_filter_sql = (" AND " + " AND ".join(item_filter_parts)) if item_filter_parts else ""

    # --- ITEM dimension ---
    if dimension == "item":
        metric_expr = _item_metric_expr(metric)
        sql = f"""
            SELECT
                mi.name   AS label,
                mi.id     AS item_id,
                NULL::int AS category_id,
                {metric_expr} AS value,
                COUNT(DISTINCT o.id) AS order_count
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            WHERE {order_conditions} {item_filter_sql}
            GROUP BY mi.id, mi.name
            ORDER BY value DESC
            LIMIT 50
        """

    # --- CATEGORY dimension ---
    elif dimension == "category":
        metric_expr = _item_metric_expr(metric)
        sql = f"""
            SELECT
                COALESCE(c.name, 'Uncategorized') AS label,
                NULL::int                         AS item_id,
                c.id                              AS category_id,
                {metric_expr}                     AS value,
                COUNT(DISTINCT o.id)              AS order_count
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            LEFT JOIN categories c ON c.id = mi.category_id
            WHERE {order_conditions} {item_filter_sql}
            GROUP BY c.id, c.name
            ORDER BY value DESC
        """

    # --- DAY_OF_WEEK dimension ---
    elif dimension == "day_of_week":
        metric_expr, join_clause = _time_metric_and_join(metric, has_item_filters)
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'Dy') AS label,
                NULL::int                   AS item_id,
                NULL::int                   AS category_id,
                {metric_expr}               AS value,
                COUNT(DISTINCT o.id)        AS order_count
            FROM orders o
            {join_clause}
            WHERE {order_conditions} {item_filter_sql if has_item_filters and join_clause else ''}
            GROUP BY EXTRACT(DOW FROM o.created_at), TO_CHAR(o.created_at, 'Dy')
            ORDER BY EXTRACT(DOW FROM o.created_at)
        """

    # --- HOUR dimension ---
    elif dimension == "hour":
        metric_expr, join_clause = _time_metric_and_join(metric, has_item_filters)
        sql = f"""
            SELECT
                LPAD(EXTRACT(HOUR FROM o.created_at)::int::text, 2, '0') || ':00' AS label,
                NULL::int             AS item_id,
                NULL::int             AS category_id,
                {metric_expr}         AS value,
                COUNT(DISTINCT o.id)  AS order_count
            FROM orders o
            {join_clause}
            WHERE {order_conditions} {item_filter_sql if has_item_filters and join_clause else ''}
            GROUP BY EXTRACT(HOUR FROM o.created_at)
            ORDER BY EXTRACT(HOUR FROM o.created_at)
        """

    # --- ORDER_TYPE dimension ---
    elif dimension == "order_type":
        metric_expr = _order_metric_expr(metric)
        sql = f"""
            SELECT
                CASE WHEN o.ayce_order THEN 'AYCE' ELSE 'Regular' END AS label,
                NULL::int            AS item_id,
                NULL::int            AS category_id,
                {metric_expr}        AS value,
                COUNT(DISTINCT o.id) AS order_count
            FROM orders o
            WHERE {order_conditions}
            GROUP BY o.ayce_order
            ORDER BY value DESC
        """

    # --- TABLE dimension ---
    elif dimension == "table":
        metric_expr = _order_metric_expr(metric)
        sql = f"""
            SELECT
                'Table ' || t.number::text AS label,
                NULL::int                  AS item_id,
                NULL::int                  AS category_id,
                {metric_expr}              AS value,
                COUNT(DISTINCT o.id)       AS order_count
            FROM orders o
            JOIN tables t ON t.id = o.table_id
            WHERE {order_conditions}
            GROUP BY t.id, t.number
            ORDER BY value DESC
        """

    else:
        return [], 0.0

    raw = db.execute(text(sql), params).fetchall()
    total = sum(float(r.value) for r in raw)

    rows = [
        DrillRow(
            label=str(r.label).strip(),
            value=float(r.value),
            order_count=int(r.order_count),
            item_id=int(r.item_id) if r.item_id is not None else None,
            category_id=int(r.category_id) if r.category_id is not None else None,
        )
        for r in raw
    ]
    return rows, total


def _item_metric_expr(metric: str) -> str:
    """Metric expressions for queries that JOIN order_items + menu_items."""
    if metric == "revenue":
        return "COALESCE(SUM(oi.quantity * oi.unit_price), 0)"
    if metric == "order_count":
        return "COUNT(DISTINCT o.id)"
    if metric == "avg_order_value":
        return "COALESCE(AVG(oi.unit_price), 0)"
    if metric == "item_count":
        return "COALESCE(SUM(oi.quantity), 0)"
    return "COALESCE(SUM(oi.quantity * oi.unit_price), 0)"


def _order_metric_expr(metric: str) -> str:
    """Metric expressions for queries on orders table only."""
    if metric == "revenue":
        return "COALESCE(SUM(o.total_amount), 0)"
    if metric == "order_count":
        return "COUNT(DISTINCT o.id)"
    if metric == "avg_order_value":
        return "COALESCE(AVG(o.total_amount), 0)"
    if metric == "item_count":
        return "COUNT(DISTINCT o.id)"  # fallback: can't count items without join
    return "COALESCE(SUM(o.total_amount), 0)"


def _time_metric_and_join(metric: str, has_item_filters: bool) -> tuple[str, str]:
    """
    Returns (metric_expr, join_clause) for time-based dimensions.
    If item filters are present, we must join order_items to apply them.
    """
    needs_join = has_item_filters or metric == "item_count"
    if needs_join:
        join_clause = (
            "JOIN order_items oi ON oi.order_id = o.id"
            " JOIN menu_items mi ON mi.id = oi.menu_item_id"
        )
        metric_expr = _item_metric_expr(metric)
    else:
        join_clause = ""
        metric_expr = _order_metric_expr(metric)
    return metric_expr, join_clause
