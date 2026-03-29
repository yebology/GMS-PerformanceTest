# Performance Test Report — Gadget Management System

**Project:** IT Asset Lifecycle Management Module  
**Base URL:** `https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod`  
**Tool:** k6  
**Date:** 2026-03-28 ~ 2026-03-29  

---

## Executive Summary

Performance testing was conducted on 3 endpoints identified as having the highest performance risk. Two test types were executed: Load Testing (baseline under normal concurrent users) and Volume Testing (response time at increasing data sizes).

Key findings:
- GET /assets degrades linearly with data size — p(95) reaches 1.39s at 500 records
- GET /notifications degrades similarly — p(95) reaches 1.98s at 1000 notifications per user
- GET /dashboard/employee/stats fails completely at 20 assigned assets due to Lambda timeout (3s default) and near-OOM (108/128 MB)

---

## 1. Load Testing Results

Baseline performance under normal concurrent load (10 VUs, 5 minutes).

| Endpoint | Avg | Min | Max | p(90) | p(95) | Requests | Throughput | Error Rate |
|----------|-----|-----|-----|-------|-------|----------|------------|------------|
| GET /assets | 198ms | 119ms | 2.56s | 220ms | 240ms | 4,373 | 6.61 req/s | 0.00% |
| GET /notifications | 277ms | 197ms | 2.50s | 330ms | 422ms | 4,373 | 6.61 req/s | 0.00% |

Both endpoints pass all thresholds under normal load. No errors detected.

---

## 2. Volume Testing Results

### 2.1 GET /assets — Comparison Across Data Sizes

| Data Size | Avg | p(90) | p(95) | Max | Requests | Throughput | Error Rate | Lambda Duration |
|-----------|-----|-------|-------|-----|----------|------------|------------|-----------------|
| 50 | 256ms | 280ms | 312ms | 2.62s | 2,152 | 7.14 req/s | 0.00% | 185ms |
| 200 | 460ms | 475ms | 551ms | 4.10s | 1,853 | 6.15 req/s | 0.00% | 386ms |
| 500 | 877ms | 891ms | 1.39s | 3.90s | 1,443 | 4.79 req/s | 0.00% | 803ms |

Observation: Response time scales linearly with data size. 10x data (50→500) results in ~3.4x slower response. Lambda Duration confirms the bottleneck is in DynamoDB query execution, not API Gateway overhead. At 500 records, p(95) is 1.39s — approaching the 2s threshold. Projected to exceed 3s at ~1,000 records.

### 2.2 GET /notifications — Comparison Across Data Sizes

| Data Size | Avg | p(90) | p(95) | Max | Requests | Throughput | Error Rate | Lambda Duration |
|-----------|-----|-------|-------|-----|----------|------------|------------|-----------------|
| 100 | 302ms | 322ms | 337ms | 2.53s | 2,079 | 6.89 req/s | 0.00% | 249ms |
| 500 | 829ms | 845ms | 1.21s | 3.70s | 1,481 | 4.91 req/s | 0.00% | 743ms |
| 1,000 | 1.43s | 1.62s | 1.98s | 4.44s | 1,116 | 3.69 req/s | 0.00% | 1.35s |

Observation: Similar linear degradation pattern. Each request performs 2 DynamoDB queries: paginated list + unread count that scans ALL notifications for the user. The unread count query is the bottleneck — it has no pagination and scans every record. At 1,000 notifications per user, p(95) is 1.98s. Projected to exceed 3s at ~1,500 notifications per user.

### 2.3 GET /dashboard/employee/stats — Comparison Across Data Sizes

| Data Size (assets) | Avg | p(90) | p(95) | Max | Requests | Throughput | Error Rate | Lambda Duration |
|--------------------|-----|-------|-------|-----|----------|------------|------------|-----------------|
| 5 | 1.28s | 1.34s | 1.35s | 3.62s | 1,189 | 3.94 req/s | 0.00% | 1.21s |
| 20 | 4.66s | 4.86s | 5.32s | 8.49s | 480 | 1.60 req/s | 99.79% ❌ | 3s (timeout) |

Observation: Critical failure at 20 assets. Lambda timeout at 3s (default) confirmed from CloudWatch logs:

```
Duration: 3000.00 ms | Memory Size: 128 MB | Max Memory Used: 108 MB | Status: timeout
```

Two issues identified:
1. Lambda timeout too low (3s default) for an endpoint that performs 60+ DynamoDB queries with 20 assets
2. Memory near limit (108/128 MB) — will OOM with more assets

---

## 3. Issues Found

| # | Severity | Endpoint | Issue | Data Size |
|---|----------|----------|-------|-----------|
| 1 | Critical | GET /dashboard/employee/stats | Lambda timeout (3s) causes 502 at 20 assets | 20 assets |
| 2 | Critical | GET /dashboard/employee/stats | Memory near limit (108/128 MB) | 20 assets |
| 3 | Warning | GET /assets | Linear degradation — p(95) projected to exceed 3s at ~1,000 records | 500 |
| 4 | Warning | GET /notifications | Linear degradation — p(95) projected to exceed 3s at ~1,500 notifications/user | 1,000 |

---

## 4. Recommendations

| # | Endpoint | Action | Priority |
|---|----------|--------|----------|
| 1 | GET /dashboard/employee/stats | Increase Lambda timeout to 15–30s | Immediate |
| 2 | GET /dashboard/employee/stats | Increase Lambda memory to 256–512 MB | Immediate |
| 3 | GET /dashboard/employee/stats | Optimize query pattern — reduce per-asset secondary lookups | Short-term |
| 4 | GET /assets | Review GSI query — ensure filtering uses key conditions, not FilterExpressions | Short-term |
| 5 | GET /notifications | Add pagination or limit to unread count query | Short-term |

---

## 5. Test Configuration

| Parameter | Value |
|-----------|-------|
| Tool | k6 |
| Virtual Users | 10 |
| Duration per test | 5 minutes |
| Sleep between requests | 1 second |
| Load Testing threshold | p(95) < 2,000ms, error rate < 5% |
| Volume Testing threshold | p(95) < 3,000ms, error rate < 5% |
| Auth | AWS Cognito (USER_PASSWORD_AUTH), IdToken without Bearer prefix |

---

*Generated from k6 load test results — 2026-03-29*
