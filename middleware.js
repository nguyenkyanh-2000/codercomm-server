import { ValidationError } from "yup";
import { extractJWT, generateApiResponse } from "./utils.js";

export const withAuth = (resolver) => {
  return async (input) => {
    const { cookies } = input;
    const accessToken = cookies["codercomm-access-token"];

    const payload = await extractJWT(accessToken);

    if (!payload || payload.exp < Date.now() / 1000) {
      return generateApiResponse({
        success: false,
        errors: ["Unauthorized"],
        message: "Unauthorized",
        status: 401,
      });
    }

    return resolver(input);
  };
};

export const catchError = (handler) => {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      console.error("❌ Error:", error);

      if (error instanceof ValidationError) {
        return generateApiResponse({
          success: false,
          errors: error.errors,
          message: error.message,
          status: 422,
        });
      }

      return generateApiResponse({
        success: false,
        errors: [error.message],
        message: error.message || "Internal server error",
        status: error.status || 500,
      });
    }
  };
};
