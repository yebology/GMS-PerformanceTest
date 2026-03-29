# Performance Test Plan — Gadget Management System

## Overview

This document identifies API endpoints suitable for performance testing based on access frequency, query weight, and risk to validate. Only endpoints with genuine performance risk are included — low-traffic, per-user scoped, or infrequent endpoints are excluded.

**Base URL:** `https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod`

**Available Roles:** `IT Admin`, `Management`, `Employee`, `Finance`

---

## Endpoints

### GET /assets

- Description: List all assets with pagination, filtering by status/category/brand/model/date. Admin sees all; employee sees only their assigned assets.
- Role Access:
  - IT Admin: View and manage full asset inventory
  - Management: View full asset inventory for oversight
  - Employee: View only their own assigned assets
- Performance Test Types:
  - Load Testing (Documentation): Most frequently accessed endpoint — all roles access on every dashboard visit. Provides baseline response time, throughput, and cold start metrics for documentation.
  - Volume Testing: GSI query (EntityTypeIndex/EmployeeAssetIndex) with multiple FilterExpressions. Need to validate performance remains acceptable as asset count grows. Represents all GSI-based list endpoints (GET /issues, GET /disposals, GET /software-requests, GET /maintenance-history).

### GET /notifications

- Description: List notifications for the current user with pagination. Queries by user ID.
- Role Access:
  - IT Admin: Notifications about new issues, software requests, returns
  - Management: Notifications about escalated requests, disposal approvals
  - Employee: Notifications about asset assignments, issue updates, return status
- Performance Test Types:
  - Load Testing (Documentation): Polled by all roles on dashboard. Provides baseline response time and throughput for documentation.
  - Volume Testing: Notifications accumulate per user and are never deleted. Each request performs 2 queries — paginated list + unread count that scans all of the user's notifications. Need to validate performance remains acceptable as notifications per user grow. This is the fastest-growing dataset per user (~10+ notifications/day).

---

## Endpoint

### GET /dashboard/employee/stats

- Description: Retrieve employee dashboard statistics — assigned asset count, pending request count, and pending signature count. Performs multiple paginated GSI queries (EmployeeAssetIndex, IssueEntityIndex, SoftwareEntityIndex) with in-memory filtering, plus per-asset secondary queries for handover and return records.
- Role Access:
  - Employee: View personal dashboard statistics
- Performance Test Types:
  - Volume Testing: Single invocation performs 10+ DynamoDB queries — paginated loops across 3 GSIs plus per-asset secondary lookups for handovers and returns. Query count and latency grow proportionally with assets assigned to the employee. Need to validate response time remains acceptable as employee has more assets and activity.

---

## Performance Test Priority Matrix

| Priority | Endpoint | Test Type | Reason |
|----------|----------|-----------|--------|
| P0 | GET /assets | Load, Volume | All roles access, GSI query + filters, represents all list endpoints |
| P0 | GET /notifications | Load, Volume | All roles poll, accumulating data per user, unread count scans all records |
| P1 | GET /dashboard/employee/stats | Volume | 10+ DynamoDB queries per invocation, grows with employee activity |

---

## Output Report Format

### Load Testing Report

Per-endpoint report with vertical metric tables:

**Per Endpoint:**

| Config | Value |
|--------|-------|
| Test Type | Load |
| Virtual Users | 10 |
| Duration | 5m (30s ramp / 4m steady / 30s down) |

| Metric | Value |
|--------|-------|
| Avg | (ms) |
| Min | (ms) |
| Max | (ms) |
| p(90) | (ms) |
| p(95) | (ms) |
| Total Requests | |
| Throughput | (req/s) |
| Error Rate | (%) |

**Overall Summary:**

| Metric | Value |
|--------|-------|
| Total Requests | |
| Overall Throughput | (req/s) |
| Overall Avg Response | (ms) |
| Overall p(95) | (ms) |
| Overall Error Rate | (%) |
| Data Received | |
| Data Sent | |
| Checks Passed | |

### Volume Testing Report

Test each endpoint at different data sizes. Compare response time and Lambda Duration across sizes.

| Endpoint | Data Size | Avg (ms) | p(95) (ms) | Lambda Duration (ms) | Threshold |
|----------|-----------|----------|------------|---------------------|-----------|
| GET /assets | current data | | | | |
| GET /assets | 2x current | | | | |
| GET /assets | 5x current | | | | |
| GET /notifications | current data | | | | |
| GET /notifications | 2x current | | | | |
| GET /notifications | 5x current | | | | |
| GET /dashboard/employee/stats | 5 assets | | | | |
| GET /dashboard/employee/stats | 20 assets | | | | |
| GET /dashboard/employee/stats | 50 assets | | | | |

Threshold: PASS if p(95) < 3,000ms, FAIL otherwise.

If Lambda Duration rises proportionally with data size → problem is in DynamoDB query, fix with query optimization.
If Lambda Duration stays low but response time rises → problem is outside Lambda (cold start, API Gateway), fix with provisioned concurrency.

---

## AWS Resource Reference

| Endpoint | Lambda Function | CloudWatch Log Group | GSI Used |
|----------|----------------|---------------------|----------|
| GET /assets | `gms-dev-list-assets` | `/gms/dev/list-assets` | `EntityTypeIndex` (admin/management), `EmployeeAssetIndex` (employee) |
| GET /notifications | `gms-dev-list-my-notifications` | `/gms/dev/list-my-notifications` | None — main table query (PK = `USER#<id>`, SK begins_with `NOTIFICATION#`) |
| GET /dashboard/employee/stats | `gms-dev-get-employee-stats` | `/gms/dev/get-employee-stats` | `EmployeeAssetIndex`, `IssueEntityIndex`, `SoftwareEntityIndex` |

DynamoDB Table: `gms-dev-assets`

### Where to Find Metrics in CloudWatch

1. Lambda Duration: CloudWatch → Functions → select function name → Monitor tab → Duration metric
2. DynamoDB Consumed RCU (optional): CloudWatch → All metrics → DynamoDB → GlobalSecondaryIndexName and Table Metrics → search `gms-dev-assets` → select ConsumedReadCapacityUnits
3. Lambda Logs: CloudWatch → Log groups → select log group → each invocation contains `REPORT` line with Duration, Billed Duration, Max Memory Used
