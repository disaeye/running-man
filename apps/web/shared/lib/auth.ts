import { apiFetch } from "./api";

interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface RegisterPayload {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  /**
   * The athlete's IANA zone, from the browser.
   *
   * The server cannot know it, and it decides which calendar day a 21:00 run
   * belongs to.
   */
  readonly timezone?: string;
}

export interface AuthResponse {
  readonly access_token: string;
}

export interface NotificationPrefs {
  readonly today_reminder: boolean;
  readonly recovery_risk_alert: boolean;
  readonly sync_failure_alert: boolean;
  readonly plan_deviation_alert: boolean;
}

export interface UserProfile {
  readonly id: number;
  readonly email: string;
  readonly name: string;
  readonly timezone: string;
  readonly hr_max: number | null;
  readonly lthr: number | null;
  readonly threshold_pace: number | null;
  readonly resting_hr: number | null;
  readonly dob: string | null;
  readonly sex: string | null;
  readonly weight_goal: number | null;
  readonly weekly_training_days: number;
  readonly max_session_duration_min: number;
  readonly preferred_sport: string;
  readonly notification_prefs?: NotificationPrefs | null;
}

export function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}

export function getCurrentUser(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/athletes/me");
}
