# Performance Testing Methodology

**Project:** IT Asset Lifecycle Management Module  
**Tool:** k6 + Python seeders  
**Infrastructure:** AWS (API Gateway → Lambda → DynamoDB)

---

## Test Types

We perform two types of performance testing, each answering a different question:

| Type | Question Answered | What Changes | What Stays Fixed |
|------|-------------------|-------------|-----------------|
| Load Testing | "Can the API handle concurrent users at normal load?" | Number of concurrent users (VUs) | Data size in DB |
| Volume Testing | "Does the API slow down as data grows?" | Data size in DynamoDB | Number of concurrent users (VUs) |

---

## 1. Load Testing

### Goal

Establish a baseline for response time and error rate under normal concurrent usage (10 VUs).

### How It Works

```
┌─────────────────────────────────────────────────────┐
│                  Load Test Flow                      │
│                                                      │
│  1. Login (Cognito) → get IdToken                    │
│  2. Run scenarios in parallel:                       │
│     ┌──────────────────┐  ┌────────────────────┐    │
│     │ GET /assets       │  │ GET /notifications  │    │
│     │ 10 VUs, 5 min     │  │ 10 VUs, 5 min      │    │
│     └──────────────────┘  └────────────────────┘    │
│  3. Generate markdown report                         │
└─────────────────────────────────────────────────────┘
```

### VU Ramp Pattern

All load test scenarios use the same ramp pattern:

```
VUs
 10 ┤          ┌──────────────────────┐
    │         /                        \
    │        /    4 min steady state     \
    │       /                            \
  0 ┤──────┘                              └──────
    0     30s                        4m30s    5m
         ramp up                     ramp down
```

### Endpoints Tested

| Endpoint | VUs | Rationale |
|----------|-----|-----------|
| GET `/assets` | 10 | All roles access on every dashboard load |
| GET `/notifications` | 10 | All roles poll, highest concurrent access |

### Thresholds

- `p(95) < 2000ms` — 95th percentile response time under 2 seconds
- `error rate < 5%` — less than 5% failed requests

### Run Command

```bash
make load
```

### Output

Report saved to `reports/report-load-testing.md` with per-endpoint metrics (avg, min, max, p90, p95, throughput, error rate).

---

## 2. Volume Testing

### Goal

Measure how response time changes as the amount of data in DynamoDB grows. This catches performance degradation that only appears at scale.

### How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                    Volume Test Flow                               │
│                                                                   │
│  Iteration 1: Baseline (existing data)                           │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐       │
│  │ k6 test  │ →  │ Record p95   │ →  │ Save report      │       │
│  └──────────┘    └──────────────┘    └──────────────────┘       │
│       ↓                                                          │
│  Seed more data (e.g., +200 records)                             │
│       ↓                                                          │
│  Iteration 2: 2x data                                            │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐       │
│  │ k6 test  │ →  │ Record p95   │ →  │ Save report      │       │
│  └──────────┘    └──────────────┘    └──────────────────┘       │
│       ↓                                                          │
│  Seed more data (e.g., +300 records)                             │
│       ↓                                                          │
│  Iteration 3: 5x data                                            │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐       │
│  └──────────┘    └──────────────┘    └──────────────────┘       │
│       ↓                                                          │
│  Cleanup all test data (IsTestData=true)                         │
└──────────────────────────────────────────────────────────────────┘
```

### Endpoints Tested

Each endpoint represents a unique DynamoDB query pattern:

| Endpoint | Query Pattern | Why It Matters |
|----------|--------------|----------------|
| GET `/assets` | GSI scan + filter | Represents all list endpoints (issues, disposals, etc.) |
| GET `/notifications` | PK query + unread count scan | Per-user data that grows continuously (~10+/day) |
| GET `/dashboard/employee/stats` | 10+ queries in a loop | Multi-query aggregation, cost grows with assigned assets |

### Seed → Test → Compare Workflow


#### GET /assets

```bash
# Baseline (existing data only)
make vol-assets DATA_SIZE=50

# Seed 200 test assets → run again
make seed-assets COUNT=200
make vol-assets DATA_SIZE=200

# Seed 300 more (500 total) → run again
make seed-assets COUNT=300
make vol-assets DATA_SIZE=500

# Cleanup
make cleanup
```

#### GET /notifications

```bash
# Baseline
make vol-notifications DATA_SIZE=100

# Seed 400 more notifications for the test user
make seed-notifications USER_ID=<cognito-sub> COUNT=400
make vol-notifications DATA_SIZE=500

# Seed 500 more (1000 total)
make seed-notifications USER_ID=<cognito-sub> COUNT=500
make vol-notifications DATA_SIZE=1000

# Cleanup
make cleanup
```

#### GET /dashboard/employee/stats

```bash
# Baseline (5 assets assigned)
make vol-dashboard DATA_SIZE=5

# Seed 15 more assets for the employee
make seed-employee EMPLOYEE_ID=<cognito-sub> COUNT=15
make vol-dashboard DATA_SIZE=20

# Cleanup
make cleanup
```

### Thresholds

- `p(95) < 3000ms` — more lenient than load testing because we're measuring degradation trend, not absolute speed
- `error rate < 5%`

### What We're Looking For

The key metric is how p(95) changes across data sizes:

```
p(95)
  3s ┤ · · · · · · · · · · · · · · · · · · threshold
     │
     │                                    ╱  ← bad: exponential growth
     │                              ╱────╱
     │                        ╱────╱
  1s ┤────────────────────────╱
     │
     │────────────────────────────────────── ← good: flat/linear
     │
  0s ┤
     50        200        500       1000
                  Data Size (records)
```

- Flat line → query is paginated/indexed properly, scales well
- Linear growth → acceptable, but monitor at production scale
- Exponential growth → missing index or full-table scan, needs optimization

---

## Seeder Scripts

Python scripts that insert tagged test data into DynamoDB. All seeded records have `IsTestData=true` so cleanup only removes test data.

| Script | What It Seeds | Usage |
|--------|--------------|-------|
| `scripts/seed-assets.py` | Asset records (various statuses) | `make seed-assets COUNT=200` |
| `scripts/seed-notifications.py` | Notifications for a specific user | `make seed-notifications USER_ID=<sub> COUNT=500` |
| `scripts/seed-employee-stats.py` | Assets + handovers + issues + SW requests for one employee | `make seed-employee EMPLOYEE_ID=<sub> COUNT=20` |
| `scripts/cleanup-test-assets.py` | Deletes all `IsTestData=true` records | `make cleanup` |

---

## Project Structure

```
├── tests/
│   ├── helpers.js              # Shared: auth, config, base URL
│   ├── load-testing.js         # Load test: /assets + /notifications
│   └── volume/
│       ├── vol-assets.js       # Volume test: GET /assets
│       ├── vol-notifications.js        # Volume test: GET /notifications
│       └── vol-dashboard-employee.js   # Volume test: GET /dashboard/employee/stats
├── scripts/
│   ├── seed-assets.py
│   ├── seed-notifications.py
│   ├── seed-employee-stats.py
│   └── cleanup-test-assets.py
├── reports/
│   ├── report-load-testing.md
│   └── volume/
│       ├── vol-assets-{size}.md
│       ├── vol-notifications-{size}.md
│       └── vol-dashboard-employee-{size}.md
├── md-summary.js               # Markdown report generator
├── Makefile                    # All commands
└── load-test-plan.md           # Test plan & endpoint selection rationale
```

---

## Report Format

All reports are auto-generated as `.md` files by `md-summary.js` and include:

- Test metadata (date, tool, test type)
- Per-endpoint tables: avg, min, max, p(90), p(95), throughput, error rate
- Threshold pass/fail status
- Overall summary
- (Volume only) CloudWatch placeholder for manual Lambda duration entry

---

## Quick Reference

| Action | Command |
|--------|---------|
| Run load test | `make load` |
| Run all volume tests | `make volume DATA_SIZE=200` |
| Run single volume test | `make vol-assets DATA_SIZE=200` |
| Seed assets | `make seed-assets COUNT=200` |
| Seed notifications | `make seed-notifications USER_ID=<sub> COUNT=500` |
| Seed employee data | `make seed-employee EMPLOYEE_ID=<sub> COUNT=20` |
| Cleanup test data | `make cleanup` |
| Delete all reports | `make clean` |

---

*This document describes the testing methodology used in this project. See `load-test-plan.md` for endpoint selection rationale and `volume-test-seeder.md` for seeder implementation details.*
