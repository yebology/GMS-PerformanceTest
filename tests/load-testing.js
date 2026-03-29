import http from "k6/http";
import { check, sleep } from "k6";
import { markdownSummary } from "../md-summary.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL, setupAuth, authHeaders } from "./helpers.js";

// Load Testing: 10 VUs steady, 5m per endpoint (30s ramp / 4m steady / 30s down)
const STAGES = [
  { duration: "30s", target: 10 },
  { duration: "4m", target: 10 },
  { duration: "30s", target: 0 },
];

export const options = {
  scenarios: {
    get_assets: {
      executor: "ramping-vus", exec: "getAssets", startVUs: 0, stages: STAGES,
    },
    get_notifications: {
      executor: "ramping-vus", exec: "getNotifications", startVUs: 0, stages: STAGES,
      startTime: "6m",
    },
  },
  thresholds: {
    "http_req_duration{name:GET /assets}": ["p(95)<2000"],
    "http_req_duration{name:GET /notifications}": ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() { return setupAuth(); }

export function getAssets(data) {
  const res = http.get(`${BASE_URL}/assets`, {
    ...authHeaders(data.token), tags: { name: "GET /assets" },
  });
  check(res, { "status 200": (r) => r.status === 200 }); sleep(1);
}

export function getNotifications(data) {
  const res = http.get(`${BASE_URL}/notifications`, {
    ...authHeaders(data.token), tags: { name: "GET /notifications" },
  });
  check(res, { "status 200": (r) => r.status === 200 }); sleep(1);
}

// === REPORT ===
const TEST_META = {
  title: "Load Testing Report",
  testType: "Load Testing",
  endpoints: [
    { method: "GET", path: "/assets", tag: "GET /assets", testType: "Load", vus: "10", duration: "5m (30s ramp / 4m steady / 30s down)" },
    { method: "GET", path: "/notifications", tag: "GET /notifications", testType: "Load", vus: "10", duration: "5m" },
  ],
};

export function handleSummary(data) {
  return {
    "reports/report-load-testing.md": markdownSummary(data, TEST_META),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
