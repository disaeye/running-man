import { describe, expect, it } from "vitest";

import { ApiContractError, ApiError, API_ERROR_KINDS, apiErrorMessage, readApiError } from "./api";

/**
 * One failure, one sentence.
 *
 * The API knows things the client cannot guess — which field the database
 * refused, which threshold a scheme is missing — so its message wins when it was
 * written for a person. Router details like `goal not found` are identifiers,
 * and the client's own sentence for that status class replaces them so the
 * interface stays Chinese either way.
 */

function errorResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readApiError", () => {
  it("reads the envelope the API writes", async () => {
    const error = await readApiError(
      errorResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "请求参数有误：sex",
            request_id: "3f9c1a2b4d5e",
            fields: [{ field: "sex", message: "取值不在允许范围内" }],
          },
          detail: "请求参数有误：sex",
        },
        422,
      ),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.kind).toBe(API_ERROR_KINDS.validation);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBe("3f9c1a2b4d5e");
    expect(error.fields).toEqual([{ field: "sex", message: "取值不在允许范围内" }]);
    expect(error.detail).toBe("请求参数有误：sex");
  });

  it("falls back to detail, then to the status text", async () => {
    const withDetail = await readApiError(errorResponse({ detail: "goal not found" }, 404));
    expect(withDetail.detail).toBe("goal not found");

    const empty = await readApiError(new Response("", { status: 500, statusText: "Server Error" }));
    expect(empty.detail).toBe("Server Error");
    expect(empty.code).toBeNull();
  });
});

describe("apiErrorMessage", () => {
  it("shows the API's message when it was written for a person", () => {
    const error = new ApiError(
      422,
      "请求参数有误：sex",
      API_ERROR_KINDS.validation,
      "VALIDATION_ERROR",
    );
    expect(apiErrorMessage(error)).toBe("请求参数有误：sex");
  });

  it("replaces an identifier detail with the message for its status", () => {
    const notFound = new ApiError(404, "goal not found", API_ERROR_KINDS.notFound);
    expect(apiErrorMessage(notFound)).toBe("请求的数据不存在或已被移除。");

    const server = new ApiError(500, "Internal Server Error", API_ERROR_KINDS.server);
    expect(apiErrorMessage(server)).toBe("服务暂时不可用，请稍后重试。");
  });

  it("names the action for a failure that carries no status", () => {
    expect(apiErrorMessage(new TypeError("x is undefined"), "保存偏好设置失败")).toBe(
      "保存偏好设置失败",
    );
    expect(apiErrorMessage(null)).toBe("网络请求失败，请检查网络连接后重试。");
  });

  it("treats a broken contract as an unreachable backend", () => {
    expect(apiErrorMessage(new ApiContractError("Expected X-API-Version: 1"))).toContain(
      "后端服务暂时不可达",
    );
  });
});
