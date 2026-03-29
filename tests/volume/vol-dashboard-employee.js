import http from "k6/http";
import { check, sleep } from "k6";
import { markdownSummary } from "../../md-summary.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL, setupEmployeeAuth, authHeaders } from "../helpers.js";

const STAGES = [
  { duration: "30s", target: 10 },
  { duration: "4m", target: 10 },
  { duration: "30s", target: 0 },
];

export const options = {
  scenarios: {
    get_dashboard_employee: {
      executor: "ramping-vus", exec: "getDashboardEmployee", startVUs: 0, stages: STAGES,
    },
  },
  thresholds: {
    "http_req_duration{name:GET /dashboard/employee/stats (volume)}": ["p(95)<3000"],
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() { return setupEmployeeAuth(); }

export function getDashboardEmployee(data) {
  const res = http.get(`${BASE_URL}/dashboard/employee/stats`, {
    ...authHeaders(data.token), tags: { name: "GET /dashboard/employee/stats (volume)" },
  });
  check(res, {
    "status 200": (r) => r.status === 200,
  });
  if (res.status !== 200) {
    console.log(`Status: ${res.status}, Body: ${res.body.substring(0, 200)}`);
  }
  sleep(1);
}

const DATA_SIZE = __ENV.DATA_SIZE || "baseline";

const TEST_META = {
  title: `Volume Testing — GET /dashboard/employee/stats (${DATA_SIZE})`,
  testType: "Volume Testing",
  endpoints: [
    { method: "GET", path: "/dashboard/employee/stats", tag: "GET /dashboard/employee/stats (volume)", testType: "Volume", vus: "10", duration: "5m", dataSize: DATA_SIZE },
  ],
};

export function handleSummary(data) {
  return {
    [`reports/volume/vol-dashboard-employee-${DATA_SIZE}.md`]: markdownSummary(data, TEST_META),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
