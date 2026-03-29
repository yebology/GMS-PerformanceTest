# Volume Test Seeder Scripts

## Overview

Scripts to seed and cleanup fake asset records in DynamoDB for volume testing. Seeded records are tagged with `IsTestData=true` so they can be bulk-deleted after testing without affecting real data.

## Prerequisites

```bash
pip install boto3
```

Ensure AWS credentials are configured (via `aws sso login` or environment variables).

## Seed Script

Save as `scripts/seed-assets.py`:

```python
import boto3
import uuid
import argparse
from datetime import datetime, timezone
from decimal import Decimal

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

CATEGORIES = ["LAPTOP", "MOBILE_PHONE", "TABLET", "OTHERS"]
BRANDS = ["Lenovo", "Dell", "HP", "Apple", "Samsung", "Asus"]
STATUSES = ["IN_STOCK", "ASSIGNED", "ASSET_PENDING_APPROVAL", "DAMAGED"]


def generate_asset(index: int) -> dict:
    asset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    category = CATEGORIES[index % len(CATEGORIES)]
    brand = BRANDS[index % len(BRANDS)]
    status = STATUSES[index % len(STATUSES)]
    serial = f"TEST-SN-{index:06d}"

    return {
        "PK": f"ASSET#{asset_id}",
        "SK": "METADATA",
        "Brand": brand,
        "Model": f"TestModel-{index}",
        "SerialNumber": serial,
        "Category": category,
        "Status": status,
        "Cost": Decimal(str(round(500 + (index * 10.5), 2))),
        "CreatedAt": now,
        "EntityType": "ASSET",
        "StatusIndexPK": f"STATUS#{status}",
        "StatusIndexSK": f"ASSET#{asset_id}",
        "SerialNumberIndexPK": f"SERIAL#{serial}",
        "SerialNumberIndexSK": "METADATA",
        "IsTestData": True,
    }


```python
def seed(count: int):
    print(f"Seeding {count} test assets...")
    with table.batch_writer() as batch:
        for i in range(count):
            item = generate_asset(i)
            batch.put_item(Item=item)
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{count} seeded")
    print(f"Done. {count} test assets seeded.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("count", type=int, help="Number of assets to seed")
    args = parser.parse_args()
    seed(args.count)
```

### Usage

```bash
# Seed 50 test assets
python scripts/seed-assets.py 50

# Seed 200 test assets
python scripts/seed-assets.py 200

# Seed 500 test assets
python scripts/seed-assets.py 500
```

---

## Cleanup Script

Save as `scripts/cleanup-test-assets.py`:

```python
import boto3

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)


def cleanup():
    print("Scanning for test assets (IsTestData=true)...")
    count = 0
    scan_kwargs = {
        "FilterExpression": "IsTestData = :val",
        "ExpressionAttributeValues": {":val": True},
        "ProjectionExpression": "PK, SK",
    }

    with table.batch_writer() as batch:
        while True:
            response = table.scan(**scan_kwargs)
            items = response.get("Items", [])
            for item in items:
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                count += 1
                if count % 100 == 0:
                    print(f"  {count} deleted...")
            if "LastEvaluatedKey" not in response:
                break
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    print(f"Done. {count} test assets deleted.")


if __name__ == "__main__":
    cleanup()
```

### Usage

```bash
# Delete all test assets
python scripts/cleanup-test-assets.py
```

---

## Volume Test Workflow

1. Note current data count (existing real data)
2. Run k6 test → record baseline results
3. Seed additional assets: `python scripts/seed-assets.py 200`
4. Run k6 test → record results at new data size
5. Seed more: `python scripts/seed-assets.py 300` (now 500 total seeded)
6. Run k6 test → record results
7. Cleanup: `python scripts/cleanup-test-assets.py`
8. Compare results across data sizes

## Notes

- Seeded records have `IsTestData=true` — real data does not have this field
- Cleanup script only deletes records with `IsTestData=true`, real data is safe
- `batch_writer()` handles DynamoDB's 25-item batch limit automatically
- Seed count is cumulative — running `seed 200` then `seed 300` creates 500 total test records


---

## Notification Seeder

### Seed Script

Save as `scripts/seed-notifications.py`:

```python
import boto3
import uuid
import argparse
import time
from datetime import datetime, timezone, timedelta

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

NOTIFICATION_TYPES = [
    "NEW_ISSUE_REPORTED",
    "ASSET_APPROVED",
    "HANDOVER_ACCEPTED",
    "NEW_SOFTWARE_INSTALL_REQUEST",
    "REPLACEMENT_APPROVED",
]

REFERENCE_TYPES = ["ASSET", "ISSUE", "SOFTWARE", "DISPOSAL", "RETURN"]


def generate_notification(user_id: str, index: int) -> dict:
    notification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc) - timedelta(hours=index)
    timestamp = now.isoformat()
    expires_at = int((now + timedelta(days=90)).timestamp())
    notif_type = NOTIFICATION_TYPES[index % len(NOTIFICATION_TYPES)]
    ref_type = REFERENCE_TYPES[index % len(REFERENCE_TYPES)]

    return {
        "PK": f"USER#{user_id}",
        "SK": f"NOTIFICATION#{timestamp}#{notification_id}",
        "NotificationType": notif_type,
        "Title": f"Test Notification {index}",
        "Message": f"This is test notification number {index} for volume testing.",
        "ReferenceID": str(uuid.uuid4()),
        "ReferenceType": ref_type,
        "IsRead": index % 3 == 0,  # ~33% read, ~67% unread
        "CreatedAt": timestamp,
        "ExpiresAt": expires_at,
        "TTL": expires_at,
        "EntityType": "NOTIFICATION",
        "IsTestData": True,
    }


def seed(user_id: str, count: int):
    print(f"Seeding {count} test notifications for user {user_id}...")
    with table.batch_writer() as batch:
        for i in range(count):
            item = generate_notification(user_id, i)
            batch.put_item(Item=item)
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{count} seeded")
    print(f"Done. {count} test notifications seeded for user {user_id}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", help="Cognito user ID (sub) to seed notifications for")
    parser.add_argument("count", type=int, help="Number of notifications to seed")
    args = parser.parse_args()
    seed(args.user_id, args.count)
```

### Usage

```bash
# Seed 100 notifications for a specific user
python scripts/seed-notifications.py "abc123-user-sub-id" 100

# Seed 500 notifications
python scripts/seed-notifications.py "abc123-user-sub-id" 500

# Seed 1000 notifications
python scripts/seed-notifications.py "abc123-user-sub-id" 1000
```

To find your user ID (Cognito sub), run:
```bash
aws cognito-idp list-users --user-pool-id <your-pool-id> --filter "email = \"your@email.com\""
```

### Cleanup

The same cleanup script works for both assets and notifications — it deletes all records with `IsTestData=true`:

```bash
python scripts/cleanup-test-assets.py
```

---

## Why These 2 Endpoints Were Chosen

GET /assets and GET /notifications were selected for volume testing because they represent the two distinct query patterns in the system:

### GET /assets — Represents GSI-based list endpoints

- Queries a Global Secondary Index (EntityTypeIndex) that spans all asset records
- Uses FilterExpressions for status/category/brand filtering
- Performance depends on total number of assets in the table
- Results from this test apply to all other GSI-based list endpoints (GET /issues, GET /disposals, GET /software-requests, GET /maintenance-history) because they share the same query pattern: GSI query + pagination + optional filter

### GET /notifications — Represents per-user accumulating data

- Queries the main table (not a GSI) scoped to a single user (PK = USER#<id>)
- Performs 2 queries per request: paginated list + unread count that scans ALL notifications for the user
- Performance depends on number of notifications per user, which grows continuously (~10+/day)
- This is the fastest-growing dataset per user and the most likely to cause performance issues first
- The unread count query has no pagination — it scans every notification record for the user every time

### Why not other endpoints?

- GET /issues, GET /disposals, GET /software-requests, GET /maintenance-history — same GSI + pagination pattern as GET /assets. If GET /assets performs well, these will too.
- GET /dashboard/employee/stats — depends on assets per employee. If GET /assets GSI query is fine, the per-employee queries in this endpoint are also fine since they query a subset of the same data.


---

## Employee Stats Seeder

This seeder creates a complete set of data for one employee: assigned assets + handover records + issues + software requests. This simulates an employee with many assets and activity history.

### Seed Script

Save as `scripts/seed-employee-stats.py`:

```python
import boto3
import uuid
import argparse
from datetime import datetime, timezone, timedelta

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

ISSUE_STATUSES = ["TROUBLESHOOTING", "UNDER_REPAIR", "SEND_WARRANTY", "RESOLVED"]
SW_STATUSES = ["PENDING_REVIEW", "ESCALATED_TO_MANAGEMENT", "SOFTWARE_INSTALL_APPROVED"]


def seed(employee_id: str, asset_count: int):
    print(f"Seeding {asset_count} assets with issues & software requests for employee {employee_id}...")
    now = datetime.now(timezone.utc)
    items = []

    for i in range(asset_count):
        asset_id = str(uuid.uuid4())
        handover_id = str(uuid.uuid4())
        assignment_date = (now - timedelta(days=asset_count - i)).isoformat()

        # 1. Asset metadata (ASSIGNED to this employee)
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": "METADATA",
            "Brand": f"TestBrand-{i}",
            "Model": f"TestModel-{i}",
            "SerialNumber": f"EMP-TEST-SN-{i:06d}",
            "Category": "LAPTOP",
            "Status": "ASSIGNED",
            "CreatedAt": assignment_date,
            "EntityType": "ASSET",
            "StatusIndexPK": "STATUS#ASSIGNED",
            "StatusIndexSK": f"ASSET#{asset_id}",
            "SerialNumberIndexPK": f"SERIAL#EMP-TEST-SN-{i:06d}",
            "SerialNumberIndexSK": "METADATA",
            "EmployeeAssetIndexPK": f"EMPLOYEE#{employee_id}",
            "EmployeeAssetIndexSK": f"ASSET#{assignment_date}",
            "IsTestData": True,
        })

        # 2. Handover record (accepted)
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"HANDOVER#{handover_id}",
            "HandoverID": handover_id,
            "EmployeeID": employee_id,
            "EmployeeName": "Test Employee",
            "EmployeeEmail": "test@example.com",
            "AssignedByID": "admin-test-id",
            "AssignmentDate": assignment_date,
            "AcceptedAt": assignment_date,
            "EmployeeAssetIndexPK": f"EMPLOYEE#{employee_id}",
            "EmployeeAssetIndexSK": f"ASSET#{assignment_date}",
            "IsTestData": True,
        })

        # 3. Issue per asset (non-terminal status so it counts as pending)
        issue_id = str(uuid.uuid4())
        issue_status = ISSUE_STATUSES[i % len(ISSUE_STATUSES)]
        issue_created = (now - timedelta(days=asset_count - i, hours=2)).isoformat()
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"ISSUE#{issue_id}",
            "IssueID": issue_id,
            "IssueDescription": f"Test issue {i}",
            "Category": "HARDWARE",
            "Status": issue_status,
            "ReportedBy": employee_id,
            "CreatedAt": issue_created,
            "IssueStatusIndexPK": f"ISSUE_STATUS#{issue_status}",
            "IssueStatusIndexSK": f"ISSUE#{issue_created}",
            "IssueEntityType": "ISSUE",
            "IsTestData": True,
        })

        # 4. Software request per asset
        sw_id = str(uuid.uuid4())
        sw_status = SW_STATUSES[i % len(SW_STATUSES)]
        sw_created = (now - timedelta(days=asset_count - i, hours=4)).isoformat()
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"SOFTWARE#{sw_id}",
            "SoftwareRequestID": sw_id,
            "SoftwareName": f"TestSoftware-{i}",
            "Version": "1.0",
            "Vendor": "TestVendor",
            "Justification": "Volume testing",
            "LicenseType": "PERPETUAL",
            "LicenseValidityPeriod": "N/A",
            "DataAccessImpact": "NONE",
            "Status": sw_status,
            "RequestedBy": employee_id,
            "CreatedAt": sw_created,
            "SoftwareStatusIndexPK": f"SOFTWARE_STATUS#{sw_status}",
            "SoftwareStatusIndexSK": f"SOFTWARE#{sw_created}",
            "SoftwareEntityType": "SOFTWARE_REQUEST",
            "IsTestData": True,
        })

    # Batch write all items
    with table.batch_writer() as batch:
        for idx, item in enumerate(items):
            batch.put_item(Item=item)
            if (idx + 1) % 100 == 0:
                print(f"  {idx + 1}/{len(items)} written")

    print(f"Done. Created {asset_count} assets x 4 records = {len(items)} total records.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("employee_id", help="Cognito user ID (sub) of the employee")
    parser.add_argument("asset_count", type=int, help="Number of assets to assign")
    args = parser.parse_args()
    seed(args.employee_id, args.asset_count)
```

### Usage

```bash
# Seed 5 assets (20 records total: 5 assets + 5 handovers + 5 issues + 5 sw requests)
python scripts/seed-employee-stats.py "employee-sub-id" 5

# Seed 20 assets (80 records total)
python scripts/seed-employee-stats.py "employee-sub-id" 20

# Seed 50 assets (200 records total)
python scripts/seed-employee-stats.py "employee-sub-id" 50
```

### Cleanup

Same cleanup script — deletes all records with `IsTestData=true`:

```bash
python scripts/cleanup-test-assets.py
```

---

## Updated: Why These 3 Endpoints Were Chosen

### GET /assets — GSI query + filter pattern
- Queries EntityTypeIndex GSI across all assets
- Uses FilterExpressions for status/category/brand
- Represents all GSI-based list endpoints (GET /issues, GET /disposals, GET /software-requests, GET /maintenance-history)
- Risk: query slows down as total asset count grows

### GET /notifications — Per-user accumulating data pattern
- Queries main table scoped to one user (PK = USER#<id>)
- Performs 2 queries per request: paginated list + unread count scanning ALL records
- Fastest-growing dataset per user (~10+ notifications/day)
- Risk: unread count query scans more data as notifications accumulate

### GET /dashboard/employee/stats — Multi-query loop pattern
- Performs 10+ DynamoDB queries in a single invocation
- Loops through 3 GSIs (EmployeeAssetIndex, IssueEntityIndex, SoftwareEntityIndex)
- Then does per-asset secondary queries for handover and return records
- Risk: query count and latency grow proportionally with assets assigned to the employee
- This pattern is unique — not covered by GET /assets or GET /notifications
