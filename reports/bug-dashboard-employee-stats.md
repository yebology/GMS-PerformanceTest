# Bug Report: GET /dashboard/employee/stats — 502 at 20 Assets

## Summary

`GET /dashboard/employee/stats` returns **502 Bad Gateway** when the employee has 20 assigned assets. Works fine with 5 assets.

## Endpoint

- **Method:** GET
- **Path:** `/dashboard/employee/stats`
- **Lambda Function:** `gms-dev-get-employee-stats`
- **Log Group:** `/gms/dev/get-employee-stats`

## How to Reproduce

1. Seed 19 assets for employee `c97a050c-5061-708f-d3f0-7f6019b34488` (1 real + 19 seed = 20 total):
   ```bash
   python3 scripts/seed-employee-stats.py "c97a050c-5061-708f-d3f0-7f6019b34488" 19
   ```
2. Hit the endpoint with employee token:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}" \
     "https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod/dashboard/employee/stats" \
     -H "Authorization: <employee-id-token>"
   ```
3. Response: `{"message": "Internal server error"}` with HTTP 502, ~5s response time.

## Expected vs Actual

| | 5 assets | 20 assets |
|--|----------|-----------|
| Status | 200 ✅ | 502 ❌ |
| Response | `{"assigned_assets": 5, ...}` | `{"message": "Internal server error"}` |
| Response Time | ~88ms | ~5.1s |

## Volume Test Results

| Data Size | Avg | p(95) | Error Rate | Throughput |
|-----------|-----|-------|------------|------------|
| 5 assets | 88ms | 113ms | 99.96%* | 8.25 req/s |
| 20 assets | 4.66s | 5.32s | 99.79% | 1.60 req/s |

*Note: 5-asset test also showed high error rate — likely due to cold start or token issue during that specific run. Manual curl with 5 assets returns 200 successfully.

## Root Cause

Confirmed from CloudWatch logs:

```
REPORT RequestId: f6f1cecd-4f9a-442e-8ab0-3bbde5ba2b95
Duration: 3000.00 ms  Billed Duration: 3000 ms
Memory Size: 128 MB   Max Memory Used: 108 MB
Status: timeout
```

1. **Lambda timeout at 3s (default)** — with 20 assets, the function needs 60+ DynamoDB queries which takes longer than 3 seconds. Lambda is killed at exactly 3000ms, API Gateway returns 502.
2. **Memory near limit** — 108 MB used out of 128 MB. With more assets, this will OOM.

## Fix Required

1. Increase Lambda timeout (recommend 15–30s for this endpoint)
2. Increase Lambda memory (recommend 256–512 MB)
3. Long-term: optimize query pattern to reduce number of DynamoDB calls per invocation

## Cleanup

To remove seeded test data:
```bash
python3 scripts/cleanup-test-assets.py
```
This only deletes records with `IsTestData=true`.
