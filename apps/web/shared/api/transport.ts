import {
  ApiContractError,
  ApiError,
  API_ERROR_KINDS,
  assertApiVersion,
  readApiError,
} from "@shared/lib/api";

export { ApiError, ApiContractError as ContractError };

export async function runtimeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, {
      credentials: "include",
      ...init,
    });
  } catch {
    throw new ApiError(0, "网络请求失败", API_ERROR_KINDS.request);
  }
  const version = response.headers.get("X-API-Version");
  if (!response.ok) {
    if (version == null) {
      throw new ApiError(
        response.status || 0,
        "请求超时或连接中断，请查看同步状态",
        API_ERROR_KINDS.server,
      );
    }
    assertApiVersion(response);
    throw await readApiError(response);
  }
  assertApiVersion(response);
  return response;
}
