import http from "k6/http";

export const COGNITO_URL = "https://cognito-idp.ap-southeast-1.amazonaws.com/";
export const CLIENT_ID = "1bcsgeuod46o8i8a3f937jt8qg";
export const BASE_URL =
  "https://so4topq4md.execute-api.ap-southeast-1.amazonaws.com/prod";

export const TEST_ACCOUNTS = [
  { email: "mt-yobelfilipus@axrail.com", password: "Test1234@" },       // IT Admin
  { email: "yobeltest4@gmail.com", password: "Test1234@@" },            // Management
  { email: "yobelnathaniel12@gmail.com", password: "Test1234@@" },      // Employee
];

export const SAMPLE_ASSET_ID = "LAPTOP-2026-001";
export const SAMPLE_RETURN_ID = "RETURN-001";
export const SAMPLE_DISPOSAL_ID = "DISPOSAL-001";

export function cognitoLogin(email, password) {
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
  });
}

export function setupAuth() {
  const acc = TEST_ACCOUNTS[0]; // IT Admin
  const res = cognitoLogin(acc.email, acc.password);
  const body = JSON.parse(res.body);
  return { token: body.AuthenticationResult.IdToken };
}

export function setupEmployeeAuth() {
  const acc = TEST_ACCOUNTS[2]; // Employee
  const res = cognitoLogin(acc.email, acc.password);
  const body = JSON.parse(res.body);
  if (!body.AuthenticationResult) {
    console.error(`Employee login failed: ${res.body}`);
    return { token: "" };
  }
  return { token: body.AuthenticationResult.IdToken };
}

export function authHeaders(token) {
  return { headers: { Authorization: token } };
}

export function getRandomAccount() {
  return TEST_ACCOUNTS[Math.floor(Math.random() * TEST_ACCOUNTS.length)];
}
