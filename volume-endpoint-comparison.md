# Volume Test Endpoint Analysis — Why These 3 Endpoints

## Overview

3 endpoints were selected for volume testing because each represents a distinct DynamoDB query pattern. Testing all 3 covers the full range of performance risks in the system.

---

## Pattern 1: GET /assets — Single GSI Query

### How it works

One query to EntityTypeIndex GSI. Since all assets share the same partition key (`EntityType = "ASSET"`), the query reads all items in that partition, then applies FilterExpression in-memory.

### Code (`services/lambdas/functions/ListAssets/lambda_function.py`)

```python
# Single GSI query — query ALL assets
key_condition = Key("EntityType").eq("ASSET")

items, total_items, total_pages = paginated_query(
    table,
    "EntityTypeIndex",   # GSI
    key_condition,
    filter_exp,          # Optional: status, category, brand filters
    page=pagination.page,
    page_size=pagination.page_size,
)
```

### What happens inside `paginated_query`

Example: 100 assets in DynamoDB, user requests page 3 with page_size 20.

**Step 1: Count query — reads ALL items just to count them**

```python
# page = 3, page_size = 20

total_items = 0
count_kwargs = {"Select": "COUNT", "KeyConditionExpression": key_condition}
while True:
    response = table.query(**count_kwargs)  # DynamoDB reads batch of items
    total_items += response["Count"]        # After loop: total_items = 100
    if "LastEvaluatedKey" not in response:
        break

# Result:
# total_items = 100
# total_pages = ceil(100 / 20) = 5
# offset = (3 - 1) * 20 = 40  ← skip first 40 items
```

DynamoDB reads all 100 items just to get the number "100". This happens on EVERY request.

**Step 2: Data query — reads from beginning, skips items one by one**

```python
skipped = 0
items = []

while len(items) < 20:  # page_size = 20
    response = table.query(**data_kwargs)  # DynamoDB reads items from the start again
    page_items = response.get("Items", [])

    for item in page_items:
        if skipped < 40:       # offset = 40 (page 1 + page 2 = 40 items to skip)
            skipped += 1       # Item 1: skip. Item 2: skip. ... Item 40: skip.
            continue
        items.append(item)     # Item 41: keep! Item 42: keep! ... Item 60: keep!
        if len(items) >= 20:   # Got 20 items → stop
            break
```

DynamoDB cannot "jump to item 41" directly. It always starts from item 1. So the code:
1. Receives item 1 from DynamoDB → throws it away (not on page 3)
2. Receives item 2 → throws it away
3. ... repeats 40 times ...
4. Receives item 41 → keeps it (this is page 3!)
5. ... keeps items until 60 ...
6. Got 20 items → stops

**Total reads for this single request:**
- Step 1: 100 reads (count all items)
- Step 2: 60 reads (skip 40 + fetch 20)
- Total: 160 reads to return just 20 items

**How it gets worse with more data and higher pages:**

| Data Size | Page | Items Read (Count) | Items Read (Data) | Total Reads | Items Returned |
|-----------|------|-------------------|-------------------|-------------|----------------|
| 100 | 1 | 100 | 20 | 120 | 20 |
| 100 | 3 | 100 | 60 | 160 | 20 |
| 100 | 5 | 100 | 100 | 200 | 20 |
| 500 | 1 | 500 | 20 | 520 | 20 |
| 500 | 3 | 500 | 60 | 560 | 20 |
| 500 | 10 | 500 | 200 | 700 | 20 |

The count query always reads ALL items regardless of which page is requested. The data query reads more items the higher the page number. Both get worse as total data grows.

### Why it slows down

- 50 assets → reads 50 items (count) + fetches 20 (data) = ~70 reads
- 500 assets → reads 500 items (count) + fetches 20 (data) = ~520 reads
- Items read grows linearly with total assets, response time grows linearly

### Volume test result

| Data Size | p(95) | Lambda Duration |
|-----------|-------|-----------------|
| 50 | 312ms | 185ms |
| 200 | 551ms | 386ms |
| 500 | 1.39s | 803ms |

### Represents these endpoints (same pattern)

- GET /issues (IssueEntityIndex)
- GET /disposals (DisposalEntityIndex / DisposalStatusIndex)
- GET /assets/software-requests (SoftwareEntityIndex / SoftwareStatusIndex)
- GET /maintenance-history (MaintenanceEntityIndex)


---

## Pattern 2: GET /notifications — Main Table Query + Unread Count Full-Read

### How it works

Two queries per request: paginated list + unread count that reads ALL notifications for the user without any limit.

### Code (`services/lambdas/functions/ListMyNotifications/lambda_function.py`)

```python
# Query 1: Paginated list (same paginated_query as /assets)
key_condition = Key("PK").eq(f"USER#{caller_user_id}") & Key("SK").begins_with("NOTIFICATION#")

items, total_items, total_pages = paginated_query(
    table,
    None,  # Main table, not GSI
    key_condition,
    filter_exp,
    page=pagination.page,
    page_size=pagination.page_size,
)

# Query 2: Unread count — reads ALL notifications, no pagination, no limit
unread_response = table.query(
    KeyConditionExpression=Key("PK").eq(f"USER#{caller_user_id}")
        & Key("SK").begins_with("NOTIFICATION#"),
    FilterExpression=Attr("IsRead").eq(False),
    Select="COUNT",
)
unread_count = unread_response.get("Count", 0)
```

### Why it slows down

- 100 notifications → reads 100 (count) + fetches 20 (data) + reads 100 (unread) = ~220 reads
- 1,000 notifications → reads 1,000 (count) + fetches 20 (data) + reads 1,000 (unread) = ~2,020 reads
- Two full reads of all items per request instead of one (unlike /assets)
- Unread count query has no pagination — if data exceeds 1MB per query page, count may be inaccurate

### Volume test result

| Data Size | p(95) | Lambda Duration |
|-----------|-------|-----------------|
| 100/user | 337ms | 249ms |
| 500/user | 1.21s | 743ms |
| 1,000/user | 1.98s | 1.35s |

### Why this is different from Pattern 1

Pattern 1 (GET /assets) does 1 count query + 1 data fetch. Pattern 2 does the same PLUS an additional full read of all items for unread count. This extra query makes notifications degrade faster than assets at the same data size.

---

## Pattern 3: GET /dashboard/employee/stats — Multi-Query Loop

### How it works

Performs 10+ sequential DynamoDB queries in a single invocation. Loops through 3 GSIs, then does per-asset secondary queries for handover and return records.

### Code (`services/lambdas/functions/GetEmployeeStats/lambda_function.py`)

```python
def lambda_handler(event, context):
    actor_id = require_group(event, "employee")

    # Query 1: Count assigned assets (EmployeeAssetIndex, paginated loop)
    assigned_assets = _count_assigned_assets(actor_id)

    # Queries 2-3: Count pending issues + software requests (2 GSI loops)
    my_pending_requests = _count_pending_requests(actor_id)

    # Queries 4+: Per-asset secondary queries
    pending_signatures = _count_pending_signatures(actor_id)
```

```python
def _count_assigned_assets(employee_id):
    # Loop: query EmployeeAssetIndex with Select=COUNT
    while True:
        response = table.query(IndexName="EmployeeAssetIndex", ...)
        count += response["Count"]
        if "LastEvaluatedKey" not in response: break

def _count_pending_requests(employee_id):
    # Loop 1: query IssueEntityIndex — reads ALL issues, filters by employee
    while True:
        response = table.query(IndexName="IssueEntityIndex",
            FilterExpression=Attr("ReportedBy").eq(employee_id), ...)
        # Count non-terminal in memory

    # Loop 2: query SoftwareEntityIndex — reads ALL software requests, filters by employee
    while True:
        response = table.query(IndexName="SoftwareEntityIndex",
            FilterExpression=Attr("RequestedBy").eq(employee_id), ...)
        # Count non-terminal in memory

def _count_pending_signatures(employee_id):
    # Get all asset IDs for this employee
    asset_ids = [...]  # query EmployeeAssetIndex

    # PER-ASSET LOOP — this is the bottleneck
    for asset_id in asset_ids:
        # Query handover records for this asset
        handover_resp = table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSET#{asset_id}")
                & Key("SK").begins_with("HANDOVER#"), ...)

        # Query return records for this asset
        return_resp = table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSET#{asset_id}")
                & Key("SK").begins_with("RETURN#"), ...)
```

### Why it slows down

- 5 assets → 3 GSI loops + (5 × 2 per-asset queries) = ~13 queries
- 20 assets → 3 GSI loops + (20 × 2 per-asset queries) = ~43 queries
- 50 assets → 3 GSI loops + (50 × 2 per-asset queries) = ~103 queries
- Each query ~50-100ms sequential = total time grows linearly with asset count
- Additionally, IssueEntityIndex and SoftwareEntityIndex read ALL records globally, not just this employee's

### Volume test result

| Data Size | p(95) | Lambda Duration | Error Rate |
|-----------|-------|-----------------|------------|
| 5 assets | 1.35s | 1.21s | 0.00% |
| 20 assets | 5.32s | 3s (timeout) | 99.79% ❌ |

### Why this is different from Pattern 1 and 2

Pattern 1 and 2: number of queries is fixed (1-3), items read per query grows.
Pattern 3: number of queries itself grows with data. More assets = more queries = more time. This is O(N) in query count, not just O(N) in items read. That's why it hits Lambda timeout at just 20 assets.

---

## Summary

| Pattern | Endpoint | Queries per request | What grows | Risk |
|---------|----------|-------------------|------------|------|
| 1. Single GSI query | GET /assets | 2 (fixed) | Items read per query | Linear slowdown |
| 2. Double query + unread | GET /notifications | 3 (fixed) | Items read per query (×2 full reads) | Faster degradation than Pattern 1 |
| 3. Multi-query loop | GET /dashboard/employee/stats | 3 + (N × 2) | Number of queries | Lambda timeout at ~20 assets |
