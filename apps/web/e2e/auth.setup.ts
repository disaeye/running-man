import { expect, test as setup } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { AUTH_FILE } from "./auth";

const execFileAsync = promisify(execFile);

type StorageCookie = {
  readonly name: string;
  readonly value: string;
};

type StorageState = {
  readonly cookies: readonly StorageCookie[];
  readonly origins: readonly unknown[];
};

function accessTokenFromStorageState(state: StorageState): string {
  expect(state.origins).toEqual([]);
  expect(state.cookies).toHaveLength(1);
  const [cookie] = state.cookies;
  expect(cookie?.name).toBe("access_token");
  return cookie?.value ?? "";
}

setup("bootstraps read-only QA authentication", async ({ request }) => {
  await execFileAsync("npm", ["run", "qa:auth-bootstrap"]);
  const rawState = await readFile(AUTH_FILE, "utf8");
  const state = JSON.parse(rawState) as StorageState;
  const accessToken = accessTokenFromStorageState(state);
  const response = await request.get("/api/v1/athletes/me", {
    headers: { cookie: `access_token=${accessToken}` },
  });
  expect(response.status()).toBe(200);
});
