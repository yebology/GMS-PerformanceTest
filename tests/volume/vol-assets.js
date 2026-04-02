import http from "k6/http";
import { check, sleep } from "k6";
import { markdownSummary } from "../../md-summary.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { BASE_URL, setupAuth, authHeaders } from "../helpers.js";

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
  },
  thresholds: {
    "http_req_duration{name:GET /assets (volume)}": ["p(95)<3000"],
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() { return setupAuth(); }

export function getAssets(data) {
  const res = http.get(`${BASE_URL}/assets?limit=100`, {
    ...authHeaders(data.token), tags: { name: "GET /assets (volume)" },
  });
  check(res, { "status 200": (r) => r.status === 200 }); sleep(1);
}

const DATA_SIZE = __ENV.DATA_SIZE || "baseline";

const TEST_META = {
  title: `Volume Testing — GET /assets (${DATA_SIZE})`,
  testType: "Volume Testing",
  endpoints: [
    { method: "GET", path: "/assets", tag: "GET /assets (volume)", testType: "Volume", vus: "10", duration: "5m (30s ramp / 4m steady / 30s down)", dataSize: DATA_SIZE },
  ],
};

export function handleSummary(data) {
  return {
    [`reports-2/volume/vol-assets-${DATA_SIZE}.md`]: markdownSummary(data, TEST_META),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
