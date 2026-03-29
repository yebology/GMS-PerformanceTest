# IT Asset Lifecycle — Load Test Plan

**Project:** IT Asset Lifecycle Management Module  
**Base URL:** `https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod`  
**Auth:** AWS Cognito (USER_PASSWORD_AUTH)  
**Tool:** k6  

---

## Test Type Definitions

| Type | Purpose | VU Strategy | Duration |
|------|---------|-------------|----------|
| Load Testing | Baseline documentation — validate response time under normal concurrent users | 10 VUs steady | 5m (30s ramp / 4m steady / 30s down) |
| Volume Testing | Validate performance as data size grows | 10 VUs steady | 5m per data size iteration |

---

## Load Testing Endpoints

| Priority | Endpoint | VUs | Duration | Rationale |
|----------|----------|-----|----------|-----------|
| P0 | GET `/assets` | 10 | 5m | All roles access, every dashboard load |
| P0 | GET `/notifications` | 10 | 5m | All roles poll, highest concurrent access |

---

## Volume Testing Endpoints

| Priority | Endpoint | VUs | Duration | Rationale |
|----------|----------|-----|----------|-----------|
| P0 | GET `/assets` | 10 | 5m | GSI query + filters, represents all list endpoints |
| P0 | GET `/notifications` | 10 | 5m | 2 queries/req, accumulating data per user |
| P1 | GET `/dashboard/employee/stats` | 10 | 5m | 10+ DynamoDB queries per invocation |

---

## Thresholds

| Metric | Load Testing | Volume Testing |
|--------|-------------|----------------|
| `http_req_duration` p(95) | < 2000ms | < 3000ms |
| `http_req_failed` rate | < 5% | < 5% |

---

## Scripts & Reports

| Script | Report |
|--------|--------|
| `tests/load-testing.js` | `reports/report-load-testing.md` |
| `tests/volume/vol-assets.js` | `reports/volume/vol-assets.md` |
| `tests/volume/vol-notifications.js` | `reports/volume/vol-notifications.md` |
| `tests/volume/vol-dashboard-employee.js` | `reports/volume/vol-dashboard-employee.md` |

---

## Volume Test Workflow

1. Run k6 test → record baseline at current data size
2. Seed additional data: `python scripts/seed-assets.py 200`
3. Run k6 test → record results at 2x data
4. Seed more: `python scripts/seed-assets.py 300`
5. Run k6 test → record results at 5x data
6. Cleanup: `python scripts/cleanup-test-assets.py`
7. Compare results across data sizes
