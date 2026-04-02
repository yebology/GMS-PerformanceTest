import http from "k6/http";
import { check, sleep } from "k6";
import { markdownSummary } from "../md-summary.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL, setupAuth, authHeaders } from "./helpers.js";

const SMOKE_STAGES = [
  { duration: "10s", target: 1 },
  { duration: "10s", target: 1 },
  { duration: "10s", target: 0 },
];

const STRESS_STAGES = [
  { duration: "30s", target: 10 },
  { duration: "1m", target: 10 },
  { duration: "1m", target: 50 },
  { duration: "2m", target: 50 },
  { duration: "1m", target: 100 },
  { duration: "2m", target: 100 },
  { duration: "1m", target: 200 },
  { duration: "2m", target: 200 },
  { duration: "1m", target: 0 },
];

export const options = {
  scenarios: {
    smoke_assets: {
      executor: "ramping-vus", exec: "getAssets", startVUs: 0, stages: SMOKE_STAGES,
    },
    stress_assets: {
      executor: "ramping-vus", exec: "getAssets", startVUs: 0, stages: STRESS_STAGES,
      startTime: "35s",
    },
  },
  thresholds: {
    "http_req_duration{name:GET /assets}": ["p(95)<3000"],
    http_req_failed: ["rate<0.10"],
  },
};

export function setup() { return setupAuth(); }

export function getAssets(data) {
  const res = http.get(`${BASE_URL}/assets`, {
    ...authHeaders(data.token), tags: { name: "GET /assets" },
  });
  check(res, { "status 200": (r) => r.status === 200 }); sleep(1);
}

const TEST_META = {
  title: "Stress Testing Report — REST API",
  testType: "Stress Testing",
  endpoints: [
    { method: "GET", path: "/assets", tag: "GET /assets", testType: "Stress", vus: "10→200", duration: "10m (step ramp 10→50→100→200)" },
  ],
};

export function handleSummary(data) {
  return {
    "reports-2/report-stress-rest.md": markdownSummary(data, TEST_META),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
