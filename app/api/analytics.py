"""
Analytics API — "The Lens"

Phase 1: /summary, /drill
Phase 2: /decompose, /compare — built on shared filter + aggregation core
Phase 3: /signals — rolling-window anomaly detection (z-score, no ML)

Recommended indexes (run once in Supabase SQL editor):
    CREATE INDEX IF NOT EXISTS idx_orders_created_status
        ON orders (created_at, status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_menu
        ON order_items (order_id, menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category
        ON menu_items (category_id);
"""

import statistics as _stats
from dataclasses import dataclass, field
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Any, Optional, List
from datetime import date, datetime, timedelta
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Input model + filter dependency
# ---------------------------------------------------------------------------

class AnalyticsFilter(BaseModel):
    """Unified filter accepted by every analytics endpoint."""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    meal_period: Optional[str] = None   # "lunch" | "dinner"
    order_type: Optional[str] = None    # "ayce"  | "regular"
    table_id: Optional[int] = None
    category_id: Optional[int] = None  # narrows to items in this category
    item_id: Optional[int] = None      # narrows to a specific item


def parse_filter(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    meal_period: Optional[str] = Query(None),
    order_type: Optional[str] = Query(None),
    table_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    item_id: Optional[int] = Query(None),
) -> AnalyticsFilter:
    return AnalyticsFilter(
        start_date=start_date,
        end_date=end_date,
        meal_period=meal_period,
        order_type=order_type,
        table_id=table_id,
        category_id=category_id,
        item_id=item_id,
    )


# ---------------------------------------------------------------------------
# Compiled filter conditions (SQL fragments + bound params)
# ---------------------------------------------------------------------------

@dataclass
class FilterConditions:
    """
    Pre-compiled SQL WHERE fragments ready to embed in any query.

    order_clause  — conditions on the orders table (alias "o").
                    Always present; safe to use without any extra joins.
    item_clause   — additional conditions that reference order_items (oi)
                    and menu_items (mi). Empty string when no item filters
                    are active. Must only be included when those joins exist.
    params        — SQLAlchemy bind params dict for this filter.
    needs_items_join — True when item_clause is non-empty.
    """
    order_clause: str
    item_clause: str
    params: dict
    needs_items_join: bool


def build_conditions(f: AnalyticsFilter) -> FilterConditions:
    """
    Translates an AnalyticsFilter into FilterConditions.
    This is the single source of truth for filter → SQL translation.
    All analytics endpoints call this; none build conditions inline.
    """
    start_dt, end_dt = _resolve_dates(f.start_date, f.end_date)
    params: dict = {"start_dt": start_dt, "end_dt": end_dt}

    order_parts: list[str] = [
        # Cast enum to text — prevents Postgres from rejecting unknown enum
        # labels in raw SQL (enum drift / casing differences with SQLAlchemy).
        "LOWER(o.status::text) != 'cancelled'",
        "o.created_at >= :start_dt",
        "o.created_at <= :end_dt",
    ]
    item_parts: list[str] = []

    # Meal period (time-of-day heuristic: lunch = before 16:00, dinner ≥ 16:00)
    if f.meal_period == "lunch":
        order_parts.append("EXTRACT(HOUR FROM o.created_at) < 16")
    elif f.meal_period == "dinner":
        order_parts.append("EXTRACT(HOUR FROM o.created_at) >= 16")

    # Order type
    if f.order_type == "ayce":
        order_parts.append("o.ayce_order = true")
    elif f.order_type == "regular":
        order_parts.append("o.ayce_order = false")

    # Table filter (order-level)
    if f.table_id is not None:
        order_parts.append("o.table_id = :table_id")
        params["table_id"] = f.table_id

    # Item-level filters (require join with order_items + menu_items)
    if f.category_id is not None:
        item_parts.append("mi.category_id = :category_id")
        params["category_id"] = f.category_id

    if f.item_id is not None:
        item_parts.append("oi.menu_item_id = :item_id")
        params["item_id"] = f.item_id

    item_clause = (" AND " + " AND ".join(item_parts)) if item_parts else ""
    return FilterConditions(
        order_clause=" AND ".join(order_parts),
        item_clause=item_clause,
        params=params,
        needs_items_join=bool(item_parts),
    )


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
    # Generic metadata bag — contains drillable IDs (item_id, category_id, etc.)
    # Frontend reads this to determine what filter to push when a row is clicked.
    metadata: dict[str, Any] = field(default_factory=dict)

    class Config:
        # pydantic v1 compat
        pass


class DrillResponse(BaseModel):
    metric: str
    dimension: str
    rows: List[DrillRow]
    total: float


class CompareRow(BaseModel):
    label: str
    a_value: float
    b_value: float
    delta: float
    pct_change: Optional[float] = None  # None when b_value is 0


class CompareResponse(BaseModel):
    dimension: str
    metric: str
    rows: List[CompareRow]


class DecomposeResponse(BaseModel):
    """
    Breaks a metric into its component drivers for a given time window.
    Used to answer "why did this number change?"
    """
    total: SummaryResponse
    timeseries: List[SummaryGroup]  # daily breakdown: revenue + orders + avg per day


# ---------------------------------------------------------------------------
# Shared SQL helpers (metric expressions)
# ---------------------------------------------------------------------------

VALID_GROUP_BYS = frozenset(
    {"day", "week", "day_of_week", "hour", "item", "category", "order_type"}
)
VALID_DIMENSIONS = frozenset(
    {"item", "category", "day_of_week", "hour", "order_type", "table"}
)
VALID_METRICS = frozenset(
    {"revenue", "order_count", "avg_order_value", "item_count"}
)


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


def _item_metric_expr(metric: str) -> str:
    """Metric expression for queries that JOIN order_items + menu_items."""
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
    """Metric expression for queries on the orders table only."""
    if metric == "revenue":
        return "COALESCE(SUM(o.total_amount), 0)"
    if metric == "order_count":
        return "COUNT(DISTINCT o.id)"
    if metric == "avg_order_value":
        return "COALESCE(AVG(o.total_amount), 0)"
    if metric == "item_count":
        return "COUNT(DISTINCT o.id)"  # can't count items without join; fallback
    return "COALESCE(SUM(o.total_amount), 0)"


def _pick_metric_and_join(
    metric: str, needs_items_join: bool
) -> tuple[str, str]:
    """
    Returns (metric_expr, join_clause) for dimensions that can work either
    with or without the order_items join (day_of_week, hour, etc.).

    If item-level filters are active we must join order_items to apply them,
    so we also switch to item-level metric expressions for consistency.
    """
    if needs_items_join or metric == "item_count":
        join_clause = (
            "JOIN order_items oi ON oi.order_id = o.id"
            " JOIN menu_items mi ON mi.id = oi.menu_item_id"
        )
        return _item_metric_expr(metric), join_clause
    return _order_metric_expr(metric), ""


# ---------------------------------------------------------------------------
# GET /analytics/summary
# ---------------------------------------------------------------------------

@router.get("/analytics/summary", response_model=SummaryResponse)
def get_analytics_summary(
    group_by: Optional[str] = Query(None),
    f: AnalyticsFilter = Depends(parse_filter),
    db: Session = Depends(get_db),
):
    """
    Aggregate metrics for the given window. group_by adds a breakdown list.
    group_by options: day, week, day_of_week, hour, item, category, order_type
    """
    fc = build_conditions(f)

    totals_row = db.execute(
        text(f"""
            SELECT
                COUNT(*)                          AS order_count,
                COALESCE(SUM(o.total_amount), 0)  AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)  AS avg_order_value
            FROM orders o
            WHERE {fc.order_clause}
        """),
        fc.params,
    ).fetchone()

    groups: Optional[List[SummaryGroup]] = None
    if group_by and group_by in VALID_GROUP_BYS:
        groups = _grouped_summary(db, group_by, fc)

    return SummaryResponse(
        total_revenue=float(totals_row.total_revenue),
        order_count=int(totals_row.order_count),
        avg_order_value=float(totals_row.avg_order_value),
        groups=groups,
    )


def _grouped_summary(
    db: Session, group_by: str, fc: FilterConditions
) -> List[SummaryGroup]:
    """
    Builds a GROUP BY query for the summary chart.
    Dimensions that need item joins (item, category) use item-level metrics.
    Time/type dimensions use order-level metrics; joins are added when
    item filters are active so those filters are still applied.
    """
    needs_join = group_by in ("item", "category") or fc.needs_items_join
    item_filter = fc.item_clause if needs_join else ""

    if group_by == "day":
        join = (
            "JOIN order_items oi ON oi.order_id = o.id JOIN menu_items mi ON mi.id = oi.menu_item_id"
            if needs_join else ""
        )
        rev = _item_metric_expr("revenue") if needs_join else _order_metric_expr("revenue")
        sql = f"""
            SELECT
                TO_CHAR(DATE(o.created_at), 'YYYY-MM-DD') AS group_key,
                COUNT(DISTINCT o.id)                      AS order_count,
                {rev}                                     AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)          AS avg_order_value
            FROM orders o {join}
            WHERE {fc.order_clause} {item_filter}
            GROUP BY DATE(o.created_at)
            ORDER BY DATE(o.created_at)
        """

    elif group_by == "week":
        sql = f"""
            SELECT
                TO_CHAR(DATE_TRUNC('week', o.created_at), 'YYYY-MM-DD') AS group_key,
                COUNT(*)                                                  AS order_count,
                COALESCE(SUM(o.total_amount), 0)                         AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)                         AS avg_order_value
            FROM orders o
            WHERE {fc.order_clause}
            GROUP BY DATE_TRUNC('week', o.created_at)
            ORDER BY DATE_TRUNC('week', o.created_at)
        """

    elif group_by == "day_of_week":
        join = (
            "JOIN order_items oi ON oi.order_id = o.id JOIN menu_items mi ON mi.id = oi.menu_item_id"
            if needs_join else ""
        )
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'Dy')  AS group_key,
                COUNT(DISTINCT o.id)         AS order_count,
                COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                COALESCE(AVG(o.total_amount), 0) AS avg_order_value
            FROM orders o {join}
            WHERE {fc.order_clause} {item_filter}
            GROUP BY EXTRACT(DOW FROM o.created_at), TO_CHAR(o.created_at, 'Dy')
            ORDER BY EXTRACT(DOW FROM o.created_at)
        """

    elif group_by == "hour":
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'HH24') AS group_key,
                COUNT(*)                                AS order_count,
                COALESCE(SUM(o.total_amount), 0)        AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)        AS avg_order_value
            FROM orders o
            WHERE {fc.order_clause}
            GROUP BY TO_CHAR(o.created_at, 'HH24')
            ORDER BY TO_CHAR(o.created_at, 'HH24')::int
        """

    elif group_by == "order_type":
        sql = f"""
            SELECT
                CASE WHEN o.ayce_order THEN 'AYCE' ELSE 'Regular' END AS group_key,
                COUNT(*)                               AS order_count,
                COALESCE(SUM(o.total_amount), 0)       AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)       AS avg_order_value
            FROM orders o
            WHERE {fc.order_clause}
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
            WHERE {fc.order_clause} {fc.item_clause}
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
            WHERE {fc.order_clause} {fc.item_clause}
            GROUP BY c.id, c.name
            ORDER BY total_revenue DESC
        """

    else:
        return []

    rows = db.execute(text(sql), fc.params).fetchall()
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
    f: AnalyticsFilter = Depends(parse_filter),
    db: Session = Depends(get_db),
):
    """
    Returns metric broken down by dimension, with cumulative filter support.
    Filters accumulate as the user drills deeper (category_id → item_id → …).
    """
    if metric not in VALID_METRICS:
        metric = "revenue"
    if dimension not in VALID_DIMENSIONS:
        dimension = "category"

    fc = build_conditions(f)
    rows, total = _drill_query(db, dimension, metric, fc)
    return DrillResponse(metric=metric, dimension=dimension, rows=rows, total=total)


def _drill_query(
    db: Session,
    dimension: str,
    metric: str,
    fc: FilterConditions,
) -> tuple[List[DrillRow], float]:
    """
    Core aggregation engine shared by /drill and /compare.
    Builds one SQL query per dimension, embedding pre-compiled FilterConditions.

    Returns (rows, total) — rows carry a metadata dict with any IDs needed
    for the frontend to determine drillability and accumulate filters.
    """

    if dimension == "item":
        metric_expr = _item_metric_expr(metric)
        sql = f"""
            SELECT
                mi.name   AS label,
                {metric_expr} AS value,
                COUNT(DISTINCT o.id) AS order_count,
                mi.id     AS meta_item_id
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            WHERE {fc.order_clause} {fc.item_clause}
            GROUP BY mi.id, mi.name
            ORDER BY value DESC
            LIMIT 50
        """
        def make_meta(r: Any) -> dict:
            return {"item_id": int(r.meta_item_id)}

    elif dimension == "category":
        metric_expr = _item_metric_expr(metric)
        sql = f"""
            SELECT
                COALESCE(c.name, 'Uncategorized') AS label,
                {metric_expr}                     AS value,
                COUNT(DISTINCT o.id)              AS order_count,
                c.id                              AS meta_category_id
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN menu_items  mi ON mi.id = oi.menu_item_id
            LEFT JOIN categories c ON c.id = mi.category_id
            WHERE {fc.order_clause} {fc.item_clause}
            GROUP BY c.id, c.name
            ORDER BY value DESC
        """
        def make_meta(r: Any) -> dict:
            return {"category_id": int(r.meta_category_id)} if r.meta_category_id is not None else {}

    elif dimension == "day_of_week":
        metric_expr, join_clause = _pick_metric_and_join(metric, fc.needs_items_join)
        item_filter = fc.item_clause if join_clause else ""
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'Dy') AS label,
                {metric_expr}               AS value,
                COUNT(DISTINCT o.id)        AS order_count
            FROM orders o {join_clause}
            WHERE {fc.order_clause} {item_filter}
            GROUP BY EXTRACT(DOW FROM o.created_at), TO_CHAR(o.created_at, 'Dy')
            ORDER BY EXTRACT(DOW FROM o.created_at)
        """
        def make_meta(_: Any) -> dict:
            return {}

    elif dimension == "hour":
        metric_expr, join_clause = _pick_metric_and_join(metric, fc.needs_items_join)
        item_filter = fc.item_clause if join_clause else ""
        sql = f"""
            SELECT
                TO_CHAR(o.created_at, 'HH24') AS label,
                {metric_expr}                           AS value,
                COUNT(DISTINCT o.id)                    AS order_count
            FROM orders o {join_clause}
            WHERE {fc.order_clause} {item_filter}
            GROUP BY TO_CHAR(o.created_at, 'HH24')
            ORDER BY TO_CHAR(o.created_at, 'HH24')::int
        """
        def make_meta(_: Any) -> dict:
            return {}

    elif dimension == "order_type":
        metric_expr = _order_metric_expr(metric)
        sql = f"""
            SELECT
                CASE WHEN o.ayce_order THEN 'AYCE' ELSE 'Regular' END AS label,
                {metric_expr}        AS value,
                COUNT(DISTINCT o.id) AS order_count
            FROM orders o
            WHERE {fc.order_clause}
            GROUP BY o.ayce_order
            ORDER BY value DESC
        """
        def make_meta(r: Any) -> dict:
            return {"order_type": "ayce" if r.label == "AYCE" else "regular"}

    elif dimension == "table":
        metric_expr = _order_metric_expr(metric)
        sql = f"""
            SELECT
                'Table ' || t.number::text AS label,
                {metric_expr}              AS value,
                COUNT(DISTINCT o.id)       AS order_count,
                t.id                       AS meta_table_id
            FROM orders o
            JOIN tables t ON t.id = o.table_id
            WHERE {fc.order_clause}
            GROUP BY t.id, t.number
            ORDER BY value DESC
        """
        def make_meta(r: Any) -> dict:
            return {"table_id": int(r.meta_table_id)}

    else:
        return [], 0.0

    raw = db.execute(text(sql), fc.params).fetchall()
    total = sum(float(r.value) for r in raw)
    rows = [
        DrillRow(
            label=str(r.label).strip(),
            value=float(r.value),
            order_count=int(r.order_count),
            metadata=make_meta(r),
        )
        for r in raw
    ]
    return rows, total


# ---------------------------------------------------------------------------
# GET /analytics/decompose
# ---------------------------------------------------------------------------

@router.get("/analytics/decompose", response_model=DecomposeResponse)
def get_analytics_decompose(
    f: AnalyticsFilter = Depends(parse_filter),
    db: Session = Depends(get_db),
):
    """
    Breaks down revenue into its component drivers for a time window.
    Returns an aggregate total AND a daily timeseries of all three metrics.
    Use this to answer "why did revenue change?" for any filtered slice.
    """
    fc = build_conditions(f)

    totals_row = db.execute(
        text(f"""
            SELECT
                COUNT(*)                          AS order_count,
                COALESCE(SUM(o.total_amount), 0)  AS total_revenue,
                COALESCE(AVG(o.total_amount), 0)  AS avg_order_value
            FROM orders o
            WHERE {fc.order_clause}
        """),
        fc.params,
    ).fetchone()

    # Reuse _grouped_summary for the daily breakdown (all three metrics per day)
    timeseries = _grouped_summary(db, "day", fc)

    total = SummaryResponse(
        total_revenue=float(totals_row.total_revenue),
        order_count=int(totals_row.order_count),
        avg_order_value=float(totals_row.avg_order_value),
    )
    return DecomposeResponse(total=total, timeseries=timeseries)


# ---------------------------------------------------------------------------
# GET /analytics/compare
# ---------------------------------------------------------------------------

@router.get("/analytics/compare", response_model=CompareResponse)
def get_analytics_compare(
    metric: str = Query("revenue"),
    dimension: str = Query("category"),
    # Cohort A
    a_start_date: Optional[date] = Query(None),
    a_end_date: Optional[date] = Query(None),
    a_meal_period: Optional[str] = Query(None),
    a_order_type: Optional[str] = Query(None),
    # Cohort B
    b_start_date: Optional[date] = Query(None),
    b_end_date: Optional[date] = Query(None),
    b_meal_period: Optional[str] = Query(None),
    b_order_type: Optional[str] = Query(None),
    # Shared dimensional filters (applied to both cohorts)
    category_id: Optional[int] = Query(None),
    item_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Runs the same aggregation over two cohorts and returns a side-by-side diff.

    Typical use: compare last 30 days vs the previous 30 days for the same
    dimension, to see which categories / items grew or shrank.

    Cohort A and B share the same dimension filters (category_id, item_id)
    so comparisons are apples-to-apples. Only time range and period filters differ.
    """
    if metric not in VALID_METRICS:
        metric = "revenue"
    if dimension not in VALID_DIMENSIONS:
        dimension = "category"

    today = date.today()

    filter_a = AnalyticsFilter(
        start_date=a_start_date or today - timedelta(days=30),
        end_date=a_end_date or today,
        meal_period=a_meal_period,
        order_type=a_order_type,
        category_id=category_id,
        item_id=item_id,
    )
    filter_b = AnalyticsFilter(
        start_date=b_start_date or today - timedelta(days=60),
        end_date=b_end_date or today - timedelta(days=31),
        meal_period=b_meal_period,
        order_type=b_order_type,
        category_id=category_id,
        item_id=item_id,
    )

    # Run the same _drill_query logic for both cohorts — zero duplication
    rows_a, _ = _drill_query(db, dimension, metric, build_conditions(filter_a))
    rows_b, _ = _drill_query(db, dimension, metric, build_conditions(filter_b))

    # Align by label (full outer join semantics)
    a_map: dict[str, float] = {r.label: r.value for r in rows_a}
    b_map: dict[str, float] = {r.label: r.value for r in rows_b}
    all_labels = sorted(set(a_map) | set(b_map), key=lambda l: a_map.get(l, 0), reverse=True)

    compare_rows: List[CompareRow] = []
    for label in all_labels:
        a_val = a_map.get(label, 0.0)
        b_val = b_map.get(label, 0.0)
        delta = a_val - b_val
        pct_change = (delta / b_val) if b_val != 0 else None
        compare_rows.append(
            CompareRow(
                label=label,
                a_value=a_val,
                b_value=b_val,
                delta=delta,
                pct_change=pct_change,
            )
        )

    return CompareResponse(dimension=dimension, metric=metric, rows=compare_rows)


# ---------------------------------------------------------------------------
# GET /analytics/signals  — Phase 3: rolling-window anomaly detection
# ---------------------------------------------------------------------------

_SIGNAL_METRIC_LABELS: dict[str, str] = {
    "total_revenue":   "Revenue",
    "order_count":     "Order count",
    "avg_order_value": "Avg order value",
}


class SignalResult(BaseModel):
    metric: str
    date: str
    value: float
    mean: float
    z_score: float
    severity: str   # "high" (|z| > 3) | "medium" (|z| > 2)
    direction: str  # "increase" | "decrease"
    message: str


@router.get("/analytics/signals", response_model=List[SignalResult])
def get_analytics_signals(
    window_days: int = Query(14, ge=7, le=90),
    meal_period: Optional[str] = Query(None),
    order_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Scans daily metrics over a rolling window and returns anomalous days.

    Approach (transparent, no black box):
    - Fetch daily revenue, order count, and avg order value for the window.
    - For each metric, compute the window mean and standard deviation.
    - Flag any day where |z_score| > 2 (≈ top/bottom ~2.3% of a normal dist).
    - z_score = (day_value − window_mean) / window_std

    Edge cases handled:
    - std == 0 (all days identical): skipped — no anomaly is possible.
    - Fewer than 3 data points: returns empty (statistics are meaningless).
    """
    end_d = date.today()
    start_d = end_d - timedelta(days=window_days)

    window_filter = AnalyticsFilter(
        start_date=start_d,
        end_date=end_d,
        meal_period=meal_period,
        order_type=order_type,
    )
    fc = build_conditions(window_filter)
    daily = _grouped_summary(db, "day", fc)

    if len(daily) < 3:
        return []

    metric_series: dict[str, list[float]] = {
        "total_revenue":   [float(r.total_revenue)   for r in daily],
        "order_count":     [float(r.order_count)     for r in daily],
        "avg_order_value": [float(r.avg_order_value) for r in daily],
    }

    signals: List[SignalResult] = []

    for metric_key, values in metric_series.items():
        mean = _stats.mean(values)
        try:
            std = _stats.stdev(values)
        except _stats.StatisticsError:
            continue
        if std == 0:
            continue  # No variance — every day was identical; nothing to flag.

        for row, v in zip(daily, values):
            z = (v - mean) / std
            if abs(z) <= 2.0:
                continue

            severity = "high" if abs(z) > 3.0 else "medium"
            direction = "increase" if z > 0 else "decrease"
            pct = abs(v - mean) / mean * 100 if mean != 0 else 0
            label = _SIGNAL_METRIC_LABELS[metric_key]

            if direction == "increase":
                msg = f"{label} was {pct:.0f}% above {window_days}-day average"
            else:
                msg = f"{label} dropped {pct:.0f}% below {window_days}-day average"

            signals.append(SignalResult(
                metric=metric_key,
                date=row.group_key,
                value=round(v, 2),
                mean=round(mean, 2),
                z_score=round(z, 2),
                severity=severity,
                direction=direction,
                message=msg,
            ))

    # Strongest anomalies first
    signals.sort(key=lambda s: abs(s.z_score), reverse=True)
    return signals
