# Instructions for AI Agent

Analyze the entire codebase of this project and identify only the API endpoints that are suitable for performance testing. Do not list all endpoints — only pick the ones that are worth testing based on the following selection criteria:

- **Access Frequency** — How often the endpoint is accessed (e.g. every page load, periodic polling, on-demand)
- **Query Weight** — How heavy the underlying query/processing is (e.g. lightweight single record fetch, aggregation across multiple tables, large dataset scan)
- **Risk to Validate** — What risk needs to be tested (e.g. response degradation under load, timeout on heavy aggregation, memory leak on sustained polling)

Then categorize each selected endpoint by the type of performance test that fits best.

For each endpoint, include:

1. **Method** — The HTTP method used (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
2. **Endpoint** — Full endpoint path (e.g. `/assets`, `/assets/{id}`)
3. **Description** — Brief explanation of what the endpoint does
4. **Accessible Roles** — Which roles have permission to access this endpoint
5. **Purpose per Role** — Explain specifically why each role needs access and what they do there

Available roles in the system: `IT Admin`, `Management`, `Employee`, `Finance`.

---

## Performance Test Types

Use the following test types as reference. Only include a category if there are endpoints that genuinely fit — do not force endpoints into a category.

| Type | Description | When to Apply |
|------|-------------|---------------|
| Load Testing | Simulate expected concurrent users under normal conditions | Endpoints accessed frequently by multiple users during daily operations |
| Stress Testing | Gradually increase load beyond normal capacity to find breaking point | High-traffic endpoints where degradation risk is highest (e.g. dashboard, main listing pages) |
| Spike Testing | Sudden dramatic increase in load | Endpoints that may experience sudden bursts of traffic (e.g. login during start of work hours, bulk operations) |
| Soak / Endurance Testing | Sustained load over an extended period to detect memory leaks or degradation | Endpoints that run continuously or are polled frequently over long periods (e.g. dashboard polling, ticket queue monitoring) |
| Volume Testing | Test with large amounts of data | Endpoints that return or process large datasets (e.g. listing endpoints with many records, export/report generation) |
| Scalability Testing | Measure how system scales when load increases incrementally | Core endpoints where you need to understand scaling behavior as user base grows |

---

## Output Format

Group endpoints by phase (e.g. Phase 1 — Asset Creation, Phase 2 — Assignment & Handover, etc.). Within each phase, list the selected endpoints with the following format:

### [Phase Name]

- **[METHOD] /path/endpoint**
  - Description: ...
  - Role Access:
    - IT Admin: (specific purpose for this role)
    - Management: (specific purpose for this role)
    - Employee: (specific purpose for this role)
    - Finance: (specific purpose for this role)
  - Performance Test Type: (which test type fits, e.g. Load Testing, Stress Testing, etc. Can be more than one if applicable)
  - Reason: (why this endpoint is suitable for that type of performance test)

Only list roles that actually have access. Do not include roles that have no access to the endpoint.

---

## Notes

- Scan all route definitions, controllers, handlers, and middleware to discover endpoints.
- Check middleware or guards that determine role access (e.g. role-based auth, permission checks, JWT claims).
- Not every test type will have matching endpoints — skip categories that don't apply.
- An endpoint can appear in multiple categories if it fits more than one test type.
- Prioritize endpoints that are critical to user experience or have high traffic patterns.
- Consider access frequency, number of concurrent users, data volume, and business criticality when categorizing.
- Output in English.
- Save the output to a `.md` file.
