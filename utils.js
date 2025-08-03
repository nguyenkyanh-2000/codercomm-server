import {
  MOCK_ACCESS_TOKEN_EXPIRATION,
  MOCK_ACCESS_TOKEN_SECRET,
} from "./config.js";
import { jwtVerify } from "jose";
import { HttpResponse } from "msw";
import process from "process";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const generateApiResponse = ({
  status,
  data,
  errors,
  message,
  success,
  accessToken,
  removeAccessToken,
}) => {
  const response = {};
  // Use FRONTEND_URL from env, fallback to localhost for dev
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";

  let headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };

  if (success) response.success = success;
  if (data) response.data = data;
  if (errors) response.errors = errors;
  if (message) response.message = message;
  if (accessToken) {
    headers = {
      ...headers,
      "Set-Cookie": `codercomm-access-token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MOCK_ACCESS_TOKEN_EXPIRATION}`,
    };
  }

  if (removeAccessToken) {
    headers = {
      ...headers,
      "Set-Cookie": `codercomm-access-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    };
  }

  return new HttpResponse(JSON.stringify(response), {
    status,
    headers,
  });
};

export const extractJWT = async (accessToken) => {
  if (!accessToken) return null;

  try {
    const { payload } = await jwtVerify(accessToken, MOCK_ACCESS_TOKEN_SECRET);

    return payload;
  } catch {
    return null;
  }
};

export const countBy = (array, prop) => {
  return array.reduce((acc, item) => {
    const key = item[prop];
    if (!acc[key]) acc[key] = 0;
    acc[key]++;
    return acc;
  }, {});
};

export const queryParams = (request) => {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  return params;
};
