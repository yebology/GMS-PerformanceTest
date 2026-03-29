import http from "k6/http";
import { check, sleep } from "k6";
import { markdownSummary } from "./md-summary.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// === CONFIG ===
const COGNITO_URL = "https://cognito-idp.ap-southeast-1.amazonaws.com/";
const CLIENT_ID = "1bcsgeuod46o8i8a3f937jt8qg";
const BASE_URL =
  "https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod";

const TEST_ACCOUNTS = [
  { email: "mt-yobelfilipus@axrail.com", password: "Test1234@" },
  { email: "yobeltest4@gmail.com", password: "Test1234@@" },
  { email: "yobelnathaniel12@gmail.com", password: "Test1234@@" },
];

const ASSET_ID = "LAPTOP-2026-001";

// === SCENARIOS ===
export const options = {
  scenarios: {
    // Pre-requisites: Login (Average Load)
    login: {
      executor: "ramping-vus",
      exec: "loginTest",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m", target: 10 },
        { duration: "30s", target: 0 },
      ],
      tags: { phase: "prerequisites" },
    },
    // Phase 1: GET /assets (Average Load)
    assets_list: {
      executor: "ramping-vus",
      exec: "assetsList",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "4m", target: 10 },
        { duration: "30s", target: 0 },
      ],
      startTime: "3m30s", // start after login test
      tags: { phase: "phase1" },
    },
    // Phase 1: GET /assets/{id} (Average Load)
    asset_detail: {
      executor: "ramping-vus",
      exec: "assetDetail",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "4m", target: 10 },
        { duration: "30s", target: 0 },
      ],
      startTime: "3m30s",
      tags: { phase: "phase1" },
    },
    // Phase 1: GET /assets?status=ASSET_PENDING_APPROVAL (Smoke)
    assets_pending: {
      executor: "ramping-vus",
      exec: "assetsPending",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 5 },
        { duration: "30s", target: 5 },
        { duration: "10s", target: 0 },
      ],
      startTime: "3m30s",
      tags: { phase: "phase1" },
    },
    // Phase 1: GET /assets?status=IN_STOCK (Smoke)
    assets_in_stock: {
      executor: "ramping-vus",
      exec: "assetsInStock",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 5 },
        { duration: "30s", target: 5 },
        { duration: "10s", target: 0 },
      ],
      startTime: "3m30s",
      tags: { phase: "phase1" },
    },
  },
  thresholds: {
    "http_req_duration{name:POST Cognito Login}": ["p(95)<3000"],
    "http_req_duration{name:GET /assets}": ["p(95)<2000"],
    "http_req_duration{name:GET /assets/{id}}": ["p(95)<2000"],
    "http_req_duration{name:GET /assets?status=ASSET_PENDING_APPROVAL}": ["p(95)<2000"],
    "http_req_duration{name:GET /assets?status=IN_STOCK}": ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

// === HELPERS ===
function cognitoLogin(email, password) {
  const payload = JSON.stringify({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  return http.post(COGNITO_URL, payload, {
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    tags: { name: "POST Cognito Login" },
  });
}

function getAccount() {
  return TEST_ACCOUNTS[Math.floor(Math.random() * TEST_ACCOUNTS.length)];
}

// Shared token (set in setup)
export function setup() {
  const acc = TEST_ACCOUNTS[0];
  const res = cognitoLogin(acc.email, acc.password);
  const body = JSON.parse(res.body);
  return { token: body.AuthenticationResult.IdToken };
}

function authHeaders(token) {
  return { headers: { Authorization: token } };
}

// === TEST FUNCTIONS ===

// Pre-requisites: Login test
export function loginTest() {
  const acc = getAccount();
  const res = cognitoLogin(acc.email, acc.password);
  check(res, {
    "login status 200": (r) => r.status === 200,
    "has IdToken": (r) => JSON.parse(r.body).AuthenticationResult !== undefined,
  });
  sleep(1);
}

// Phase 1: GET /assets
export function assetsList(data) {
  const res = http.get(`${BASE_URL}/assets`, {
    ...authHeaders(data.token),
    tags: { name: "GET /assets" },
  });
  check(res, {
    "/assets status 200": (r) => r.status === 200,
    "/assets has items": (r) => JSON.parse(r.body).items !== undefined,
  });
  sleep(1);
}

// Phase 1: GET /assets/{id}
export function assetDetail(data) {
  const res = http.get(`${BASE_URL}/assets/${ASSET_ID}`, {
    ...authHeaders(data.token),
    tags: { name: "GET /assets/{id}" },
  });
  check(res, {
    "/assets/{id} status 200": (r) => r.status === 200,
    "/assets/{id} has asset_id": (r) => JSON.parse(r.body).asset_id !== undefined,
  });
  sleep(1);
}

// Phase 1: GET /assets?status=ASSET_PENDING_APPROVAL
export function assetsPending(data) {
  const res = http.get(`${BASE_URL}/assets?status=ASSET_PENDING_APPROVAL`, {
    ...authHeaders(data.token),
    tags: { name: "GET /assets?status=ASSET_PENDING_APPROVAL" },
  });
  check(res, {
    "pending status 200": (r) => r.status === 200,
  });
  sleep(1);
}

// Phase 1: GET /assets?status=IN_STOCK
export function assetsInStock(data) {
  const res = http.get(`${BASE_URL}/assets?status=IN_STOCK`, {
    ...authHeaders(data.token),
    tags: { name: "GET /assets?status=IN_STOCK" },
  });
  check(res, {
    "in_stock status 200": (r) => r.status === 200,
  });
  sleep(1);
}

// === REPORT ===
const TEST_META = {
  endpoints: [
    {
      method: "POST",
      path: "Cognito InitiateAuth (Login)",
      tag: "POST Cognito Login",
      testType: "Average Load",
      vus: "10",
      duration: "3m (30s ramp / 2m steady / 30s down)",
    },
    {
      method: "GET",
      path: "/assets",
      tag: "GET /assets",
      testType: "Average Load",
      vus: "10",
      duration: "5m (30s ramp / 4m steady / 30s down)",
    },
    {
      method: "GET",
      path: "/assets/{id}",
      tag: "GET /assets/{id}",
      testType: "Average Load",
      vus: "10",
      duration: "5m (30s ramp / 4m steady / 30s down)",
    },
    {
      method: "GET",
      path: "/assets?status=ASSET_PENDING_APPROVAL",
      tag: "GET /assets?status=ASSET_PENDING_APPROVAL",
      testType: "Smoke",
      vus: "5",
      duration: "50s (10s ramp / 30s steady / 10s down)",
    },
    {
      method: "GET",
      path: "/assets?status=IN_STOCK",
      tag: "GET /assets?status=IN_STOCK",
      testType: "Smoke",
      vus: "5",
      duration: "50s (10s ramp / 30s steady / 10s down)",
    },
  ],
};

export function handleSummary(data) {
  return {
    "load-test-report.md": markdownSummary(data, TEST_META),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
