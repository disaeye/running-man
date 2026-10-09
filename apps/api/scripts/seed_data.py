#!/usr/bin/env python3
"""Generate realistic demo data for all dashboard pages.

Inserts activities, wellness, daily load, calendar, goals, milestones, and
training phases for the admin athlete, then recomputes daily_load via PMC.

Usage:
    cd apps/api && source .venv/bin/activate && python scripts/seed_data.py
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import psycopg

# ── configuration ────────────────────────────────────────────────────────────


def _load_dsn() -> str:
    """Load DATABASE_URL from .env file or environment."""
    dsn = os.getenv("DATABASE_URL", "")
    if dsn:
        return dsn.replace("+asyncpg://", "://")

    # Try loading from the app's .env file
    env_file = Path(__file__).parent.parent / ".env"
    try:
        with env_file.open() as f:
            for raw_line in f:
                line = raw_line.strip()
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].replace("+asyncpg://", "://")
    except FileNotFoundError:
        pass

    print("ERROR: DATABASE_URL not found in environment or .env", file=sys.stderr)
    sys.exit(1)


DSN: str = _load_dsn()

ADMIN_EMAIL = "admin@running.man"
DAYS_BACK = 90
DAYS_FORWARD = 28
INJURY_HEALTHY_PROBABILITY = 0.95

# ── helpers ──────────────────────────────────────────────────────────────────

# Deterministic but diverse source hashes
def source_hash(prefix: str, idx: int) -> str:
    return hashlib.sha256(f"{prefix}:{idx}".encode()).hexdigest()[:32]

# ── training science: realistic weekly pattern ───────────────────────────────

# Template for a week: each tuple is
# (sport, category, tss_min, tss_max, dist_min, dist_max, dur_min, dur_max)
# Pattern: Mon easy, Tue tempo, Wed off/strength, Thu intervals, Fri easy,
# Sat strength, Sun long run
WEEKLY_TEMPLATE = [
    ("Run", "easy", 25, 40, 5, 8, 25, 45),       # Mon: easy run
    ("Run", "tempo", 55, 75, 6, 10, 35, 55),      # Tue: tempo
    ("Workout", "strength", 10, 25, 0, 0, 25, 50),# Wed: strength
    ("Run", "intervals", 60, 95, 5, 9, 30, 55),   # Thu: intervals
    ("Run", "easy", 25, 40, 5, 8, 25, 45),        # Fri: easy run
    ("Workout", "strength", 10, 25, 0, 0, 25, 50),# Sat: strength
    ("Run", "long_run", 85, 150, 10, 18, 55, 120),# Sun: long run
]

# Occasional variants
RIDE_TEMPLATE = ("Ride", "endurance", 40, 80, 25, 55, 50, 120)
TRAIL_TEMPLATE = ("TrailRun", "trail", 50, 100, 6, 15, 40, 100)
VIRTUAL_TEMPLATE = ("VirtualRun", "tempo", 30, 60, 5, 10, 25, 50)

# Random-swap thresholds for variant sports (cumulative cutoffs on rand_val)
VARIANT_TRAIL_CUTOFF = 0.08
VARIANT_RIDE_CUTOFF = 0.18
VARIANT_VIRTUAL_CUTOFF = 0.28
SKIP_WORKOUT_CHANCE = 0.25
POWER_SAMPLE_CHANCE = 0.3

# ── activity generator ───────────────────────────────────────────────────────

# Demo-data generator: deliberately a long flat sequence of weighted dice
# rolls; splitting it would obscure the per-day simulation. Complexity lints
# are waived for this one function.
def generate_activities(  # noqa: C901, PLR0912, PLR0915
    athlete_id: UUID, days_back: int, target_count: int
) -> list[dict[str, object]]:
    """Generate a realistic 90-day training block with periodization."""
    today = date.today()
    end_date = today
    start_date = end_date - timedelta(days=days_back)

    # Phase plan: 3 x 3-week build + 1-week recovery (then a taper at end)
    phases = [
        {"name": "base_build_1", "factor": 1.0, "weeks": 3},
        {"name": "recovery_1", "factor": 0.6, "weeks": 1},
        {"name": "base_build_2", "factor": 1.1, "weeks": 3},
        {"name": "recovery_2", "factor": 0.6, "weeks": 1},
        {"name": "build_intensity", "factor": 1.2, "weeks": 3},
        {"name": "recovery_3", "factor": 0.65, "weeks": 1},
    ]

    activities: list[dict[str, object]] = []
    day_cursor: date = start_date
    phase_idx = 0
    days_processed = 0

    # Activity counter for unique IDs
    act_counter = 10000

    while day_cursor <= end_date:
        if day_cursor > end_date:
            break

        # Determine current phase
        weeks_passed = 0
        for pi, phase in enumerate(phases):
            if days_processed < (weeks_passed + phase["weeks"]) * 7:
                phase_idx = pi
                break
            weeks_passed += phase["weeks"]
        else:
            phase_idx = len(phases) - 1

        phase = phases[phase_idx]
        factor = phase["factor"]
        weekday = day_cursor.weekday()  # 0=Mon

        template = WEEKLY_TEMPLATE[weekday]
        sport, category, tss_min, tss_max, dist_min, dist_max, dur_min, dur_max = template

        # Randomly swap in variant sports (~15% chance)
        rand_val = random.random()
        is_race_day = day_cursor == end_date - timedelta(days=random.randint(3, 14))

        if is_race_day:
            sport, category, tss_min, tss_max = "Run", "race", 120, 160
            dist_min, dist_max, dur_min, dur_max = 8, 12, 38, 50
        elif sport == "Run" and rand_val < VARIANT_TRAIL_CUTOFF:
            sport, category, tss_min, tss_max, dist_min, dist_max, dur_min, dur_max = TRAIL_TEMPLATE
        elif sport == "Run" and VARIANT_TRAIL_CUTOFF <= rand_val < VARIANT_RIDE_CUTOFF:
            sport, category, tss_min, tss_max, dist_min, dist_max, dur_min, dur_max = RIDE_TEMPLATE
        elif sport == "Run" and VARIANT_RIDE_CUTOFF <= rand_val < VARIANT_VIRTUAL_CUTOFF:
            (
                sport, category, tss_min, tss_max,
                dist_min, dist_max, dur_min, dur_max,
            ) = VIRTUAL_TEMPLATE

        # Skip 1-2 rest days per week (random but structured)
        if sport == "Workout" and random.random() < SKIP_WORKOUT_CHANCE:
            day_cursor += timedelta(days=1)
            days_processed += 1
            continue

        # Apply phase factor to intensity
        if category in ("easy", "strength") and phase["name"].startswith("recovery"):
            tss_min, tss_max = int(tss_min * 0.7), int(tss_max * 0.9)

        tss = round(random.uniform(tss_min, tss_max) * factor, 1)
        tss = max(5, min(tss, 200))

        # Distance and duration based on sport and TSS
        if sport in ("Run", "VirtualRun", "TrailRun"):
            dist = round(random.uniform(dist_min, dist_max) * (0.8 + 0.2 * (tss / 100)), 2)
            dur = int(random.uniform(dur_min, dur_max) * (0.85 + 0.15 * (tss / 100)))
        elif sport == "Ride":
            dist = round(random.uniform(dist_min, dist_max) * (0.8 + 0.2 * (tss / 80)), 1)
            dur = int(random.uniform(dur_min, dur_max) * (0.85 + 0.15 * (tss / 80)))
        else:  # Workout
            dist = 0
            dur = int(random.uniform(dur_min, dur_max))

        dist = max(0.0, dist)
        dur_s = max(1200, min(int(dur * 60), 7200))

        # HR based on intensity
        if sport == "Workout":
            avg_hr = random.randint(95, 125)
            max_hr_val = avg_hr + random.randint(15, 30)
        elif category == "easy":
            avg_hr = random.randint(120, 142)
            max_hr_val = avg_hr + random.randint(15, 30)
        elif category in ("tempo", "endurance"):
            avg_hr = random.randint(140, 160)
            max_hr_val = avg_hr + random.randint(15, 30)
        elif category in ("intervals", "race"):
            avg_hr = random.randint(150, 172)
            max_hr_val = avg_hr + random.randint(15, 35)
        elif category == "long_run":
            avg_hr = random.randint(130, 155)
            max_hr_val = avg_hr + random.randint(15, 30)
        else:
            avg_hr = random.randint(120, 155)
            max_hr_val = avg_hr + random.randint(15, 30)

        avg_hr = max(80, min(avg_hr, 195))
        max_hr_val = max(avg_hr + 5, min(max_hr_val, 210))

        # Power (only for rides and some runs)
        avg_power = None
        if sport in ("Ride", "VirtualRide"):
            avg_power = random.randint(120, 250)
        elif category in ("intervals", "tempo") and random.random() < POWER_SAMPLE_CHANCE:
            avg_power = random.randint(180, 320)

        # Speed (m/s from distance_m / duration_s)
        if dist > 0 and dur_s > 0:
            avg_speed = round(dist / dur_s, 2)
        else:
            avg_speed = None

        # Elevation
        if sport == "TrailRun":
            elev = round(random.uniform(100, 500), 1)
        elif sport == "Ride":
            elev = round(random.uniform(50, 400), 1)
        elif sport in ("Run", "VirtualRun"):
            elev = round(random.uniform(5, 80), 1)
        else:
            elev = 0.0

        # Calories
        cal_per_hour = 550 if sport == "Ride" else 650
        calories = int(cal_per_hour * (dur_s / 3600) * (0.85 + 0.15 * random.random()))

        # Cadence for runs
        avg_cadence = None
        if sport in ("Run", "VirtualRun", "TrailRun"):
            avg_cadence = round(random.uniform(158, 180), 1)

        # Start time: morning for runs, vary for others
        running = sport in ("Run", "VirtualRun", "TrailRun")
        hour = random.randint(6, 10) if running else random.randint(7, 18)
        minute = random.randint(0, 59)
        start_dt = datetime.combine(day_cursor, datetime.min.time(), tzinfo=timezone.utc)
        start_dt = start_dt.replace(hour=hour, minute=minute)

        # has_* flags
        is_outdoor = sport in ("Run", "TrailRun", "Ride")
        has_hr_flag = avg_hr is not None
        has_gps_flag = is_outdoor
        has_power_flag = avg_power is not None
        has_cadence_flag = avg_cadence is not None

        # JSONB raw_data
        raw_data: dict[str, object] = {}
        if has_gps_flag:
            lat_base = 31.23 + random.uniform(-0.02, 0.02)
            lon_base = 121.47 + random.uniform(-0.02, 0.02)
            raw_data["latlng"] = [[lat_base + random.uniform(-0.001, 0.001),
                                   lon_base + random.uniform(-0.001, 0.001)]
                                  for _ in range(min(dur_s // 30, 300))]

        activity_id = f"seed_{act_counter}"
        act_counter += 1

        # NP for power-based activities
        np_val = None
        if avg_power is not None:
            vi = random.uniform(1.0, 1.08)
            np_val = round(avg_power * vi, 1)

        activities.append({
            "activity_id": activity_id,
            "athlete_id": athlete_id,
            "start_time": start_dt,
            "sport": sport,
            "distance_m": dist,
            "duration_s": dur_s,
            "avg_hr": avg_hr,
            "max_hr": max_hr_val,
            "avg_power": avg_power,
            "np": np_val,
            "tss": tss,
            "avg_speed": avg_speed,
            "elevation_gain_m": elev,
            "calories": calories,
            "source": "intervals_icu",
            "source_hash": source_hash("seed", act_counter),
            "has_gps": has_gps_flag,
            "has_hr": has_hr_flag,
            "has_power": has_power_flag,
            "has_cadence": has_cadence_flag,
            "avg_cadence": avg_cadence,
            "raw_data": raw_data,
        })

        day_cursor += timedelta(days=1)
        days_processed += 1

    return activities


# ── wellness data generator ──────────────────────────────────────────────────

def generate_wellness(athlete_id: UUID, days_back: int) -> list[dict[str, object]]:  # noqa: PLR0915
    """Generate 90 days of realistic daily wellness metrics."""
    today = date.today()
    start_date = today - timedelta(days=days_back - 1)  # include today

    records: list[dict[str, object]] = []

    # Base values with slight long-term trends
    base_weight = 73.0
    base_rhr = 46
    base_hrv = 65
    base_vo2 = 55.5
    base_sleep = 25200  # 7 hours
    base_steps = 9500

    for i in range(days_back):
        day = start_date + timedelta(days=i)

        # Build a phase factor: slightly over-trained in the middle
        phase_factor = 1.0 - 0.08 * math.sin(i * math.pi / days_back)

        # Weight: ~73kg with ~0.5kg day-to-day variation
        weight = round(base_weight + random.uniform(-0.6, 0.6), 1)

        # RHR: trained athlete, slight elevation during hard blocks
        rhr_wobble = (i * 1.5) % 10  # oscillate
        rhr = int(base_rhr + random.uniform(-3, 4) + rhr_wobble * 0.5)
        rhr = max(38, min(rhr, 55))

        # HRV: inversely related to training stress
        hrv = round(base_hrv + random.uniform(-10, 10) - rhr_wobble * 0.3, 1)
        hrv = max(45.0, min(hrv, 85.0))

        # Sleep: 6-8.5 hours, worse during hard training
        sleep_quality = 1.0 - 0.05 * phase_factor
        sleep_secs = int(base_sleep * sleep_quality + random.uniform(-2400, 3600))
        sleep_secs = max(18000, min(sleep_secs, 30600))

        # Sleep score
        sleep_score = int(60 + (sleep_secs - 18000) / 12600 * 35 + random.uniform(-8, 8))
        sleep_score = max(30, min(sleep_score, 98))

        # VO2max: slow improvement over time
        vo2 = round(base_vo2 + i * 0.015 + random.uniform(-0.5, 0.5), 1)
        vo2 = max(50.0, min(vo2, 60.0))

        # Steps
        steps = int(base_steps + random.uniform(-3000, 5000))
        steps = max(3000, min(steps, 18000))

        # Fatigue: 1-4, higher after hard days
        fatigue = int(2.0 + random.uniform(-1.0, 1.6) + phase_factor * 0.5)
        fatigue = max(1, min(fatigue, 4))

        # Soreness: 1-4
        soreness = int(1.5 + random.uniform(-0.5, 1.4) + phase_factor * 0.3)
        soreness = max(1, min(soreness, 4))

        # Stress, mood, motivation, readiness
        stress = int(2.0 + random.uniform(-1.0, 1.6))
        stress = max(1, min(stress, 4))

        mood = int(3.0 + random.uniform(-1.5, 1.0) - phase_factor * 0.3)
        mood = max(1, min(mood, 4))

        motivation = int(3.0 + random.uniform(-1.5, 1.0))
        motivation = max(1, min(motivation, 4))

        injury_status = 1 if random.random() < INJURY_HEALTHY_PROBABILITY else 2

        readiness = int(70 + random.uniform(-15, 15) - phase_factor * 5)
        readiness = max(30, min(readiness, 95))

        # HRV SDNN 与 rMSSD 同向波动
        hrv_sdnn = round(hrv * 1.15 + random.uniform(-5, 5), 1)

        # 睡眠质量（1-4）与睡眠评分同向
        sleep_quality = max(1, min(4, int(sleep_score / 26 + random.uniform(-0.5, 0.5))))
        avg_sleeping_hr = int(rhr - 4 + random.uniform(-2, 2))

        # 血氧 / 呼吸 / 血压 / 体脂
        spo2 = int(random.uniform(95, 99))
        respiration_rate = round(random.uniform(12.5, 16.5), 1)
        systolic_bp = int(random.uniform(108, 126))
        diastolic_bp = int(random.uniform(66, 82))
        body_fat_pct = round(17.5 - i * 0.005 + random.uniform(-0.5, 0.5), 1)

        # 营养与水分
        kcal_consumed = int(2100 + random.uniform(-350, 550))
        carbs_g = round(kcal_consumed * random.uniform(0.45, 0.55) / 4.0, 1)
        protein_g = round(kcal_consumed * random.uniform(0.18, 0.25) / 4.0, 1)
        fat_g = round(kcal_consumed * random.uniform(0.22, 0.3) / 9.0, 1)
        hydration = int(random.choices([1, 2, 3, 4], weights=[35, 45, 15, 5])[0])

        records.append({
            "day": day,
            "athlete_id": athlete_id,
            "weight": weight,
            "resting_hr": rhr,
            "hrv": hrv,
            "hrv_sdnn": hrv_sdnn,
            "vo2max": vo2,
            "steps": steps,
            "sleep_secs": sleep_secs,
            "sleep_score": sleep_score,
            "sleep_quality": sleep_quality,
            "avg_sleeping_hr": avg_sleeping_hr,
            "spo2": spo2,
            "respiration_rate": respiration_rate,
            "systolic_bp": systolic_bp,
            "diastolic_bp": diastolic_bp,
            "kcal_consumed": kcal_consumed,
            "carbs_g": carbs_g,
            "protein_g": protein_g,
            "fat_g": fat_g,
            "hydration": hydration,
            "body_fat_pct": body_fat_pct,
            "fatigue": fatigue,
            "soreness": soreness,
            "stress": stress,
            "mood": mood,
            "motivation": motivation,
            "injury_status": injury_status,
            "readiness": readiness,
        })

    return records


# ── training calendar generator ──────────────────────────────────────────────

def generate_calendar(athlete_id: UUID, days_forward: int) -> list[dict[str, object]]:
    """Generate planned training events for the next 4 weeks."""
    today = date.today()

    # Week pattern for next 4 weeks (build phase)
    weekly_plan = [
        # (sport, category, name, tss, dur_min)
        ("Run", "easy", "Easy Run", 35, 35),
        ("Run", "tempo", "Tempo Run 6K", 65, 45),
        ("Run", "intervals", "400m repeats x8", 85, 50),
        ("Run", "easy", "Recovery Run", 25, 30),
        ("Run", "easy", "Easy Run + Strides", 40, 40),
        ("Rest", "rest", "Rest Day", 0, 0),
        ("Run", "long_run", "Long Run 14K", 120, 90),
    ]

    events: list[dict[str, object]] = []

    for week in range(4):
        for day_of_week, (sport, category, name, tss, dur) in enumerate(weekly_plan):
            event_date = today + timedelta(days=week * 7 + day_of_week)

            # Slight variation
            tss_adj = round(tss * random.uniform(0.9, 1.1), 1) if tss > 0 else 0

            events.append({
                "event_id": f"plan_{week}_{day_of_week}",
                "athlete_id": athlete_id,
                "start_time": datetime.combine(
                    event_date,
                    datetime.min.time().replace(hour=7),
                    tzinfo=timezone.utc,
                ),
                "category": category,
                "sport_type": sport,
                "name": name,
                "predicted_tss": tss_adj,
                "status": "planned",
                "done": False,
            })

    return events


# ── goals and milestones ─────────────────────────────────────────────────────

def generate_goals(
    athlete_id: UUID,
) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    """Generate goals with milestones and training phases."""
    today = date.today()

    goal1_id = uuid4()
    goal2_id = uuid4()

    # Goal 1: 10K race
    goal1 = {
        "goal_id": goal1_id,
        "athlete_id": athlete_id,
        "type": "race",
        "title": "10K Race - Sub 45:00",
        "target_value": 2700.0,  # seconds
        "current_value": 0.0,
        "unit": "seconds",
        "target_date": today + timedelta(days=56),
        "race_distance_m": 10000.0,
        "race_target_time_s": 2700,
        "status": "active",
    }

    # Goal 2: Weekly consistency
    goal2 = {
        "goal_id": goal2_id,
        "athlete_id": athlete_id,
        "type": "consistency",
        "title": "5 Sessions/Week for 8 Weeks",
        "target_value": 5.0,
        "current_value": 4.0,
        "unit": "sessions/week",
        "target_date": today + timedelta(days=42),
        "status": "active",
    }

    milestones = [
        {
            "goal_id": goal1_id,
            "title": "5K Time Trial",
            "target_date": today + timedelta(days=14),
            "target_value": 1300.0,  # 21:40
            "achieved": False,
        },
        {
            "goal_id": goal1_id,
            "title": "8K Tempo at Race Pace",
            "target_date": today + timedelta(days=28),
            "target_value": 2150.0,  # 35:50
            "achieved": False,
        },
        {
            "goal_id": goal1_id,
            "title": "10K Race Simulation",
            "target_date": today + timedelta(days=42),
            "target_value": 2700.0,  # 45:00
            "achieved": False,
        },
        {
            "goal_id": goal1_id,
            "title": "Taper Week (Reduced Volume)",
            "target_date": today + timedelta(days=49),
            "target_value": None,
            "achieved": False,
        },
        {
            "goal_id": goal1_id,
            "title": "Race Day - Sub 45 Target",
            "target_date": today + timedelta(days=56),
            "target_value": 2700.0,
            "achieved": False,
        },
    ]

    phases = [
        {
            "goal_id": goal1_id,
            "athlete_id": athlete_id,
            "name": "Base Building",
            "start_date": today - timedelta(days=56),
            "end_date": today + timedelta(days=14),
            "target_weekly_tss": 300.0,
        },
        {
            "goal_id": goal1_id,
            "athlete_id": athlete_id,
            "name": "Specific Preparation",
            "start_date": today + timedelta(days=15),
            "end_date": today + timedelta(days=42),
            "target_weekly_tss": 350.0,
        },
        {
            "goal_id": goal1_id,
            "athlete_id": athlete_id,
            "name": "Taper",
            "start_date": today + timedelta(days=43),
            "end_date": today + timedelta(days=56),
            "target_weekly_tss": 200.0,
        },
    ]

    return ([goal1, goal2], milestones, phases)


# ── insert functions ─────────────────────────────────────────────────────────

def insert_ftp_history(conn: psycopg.Connection, athlete_id: UUID) -> None:
    """Ensure athlete has a basic FTP/LTHR record so recompute_load works."""
    sql = """
    INSERT INTO ftp_history (athlete_id, effective_from, ftp, lthr)
    VALUES (%(athlete_id)s, %(effective_from)s, %(ftp)s, %(lthr)s)
    ON CONFLICT (athlete_id, effective_from) DO NOTHING
    """
    base_date = date.today() - timedelta(days=DAYS_BACK + 365)
    with conn.cursor() as cur:
        _ = cur.execute(sql, {
            "athlete_id": athlete_id,
            "effective_from": base_date,
            "ftp": 250,
            "lthr": 168,
        })


def insert_activities(conn: psycopg.Connection, activities: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO activity_summary
      (activity_id, athlete_id, start_time, sport, distance_m, duration_s,
       avg_hr, max_hr, avg_power, np, avg_speed, elevation_gain_m,
       calories, source, source_hash, avg_cadence,
       tss, has_gps, has_hr, has_power, has_cadence, raw_data)
    VALUES (%(activity_id)s, %(athlete_id)s, %(start_time)s, %(sport)s,
            %(distance_m)s, %(duration_s)s, %(avg_hr)s, %(max_hr)s,
            %(avg_power)s, %(np)s, %(avg_speed)s, %(elevation_gain_m)s,
            %(calories)s, %(source)s, %(source_hash)s, %(avg_cadence)s,
            %(tss)s, %(has_gps)s, %(has_hr)s, %(has_power)s, %(has_cadence)s,
            %(raw_data)s::jsonb)
    ON CONFLICT (activity_id, start_time) DO UPDATE SET
        sport = EXCLUDED.sport,
        distance_m = EXCLUDED.distance_m,
        duration_s = EXCLUDED.duration_s,
        avg_hr = EXCLUDED.avg_hr,
        max_hr = EXCLUDED.max_hr,
        avg_power = EXCLUDED.avg_power,
        np = EXCLUDED.np,
        avg_speed = EXCLUDED.avg_speed,
        elevation_gain_m = EXCLUDED.elevation_gain_m,
        calories = EXCLUDED.calories,
        source = EXCLUDED.source,
        source_hash = EXCLUDED.source_hash,
        avg_cadence = EXCLUDED.avg_cadence,
        tss = EXCLUDED.tss,
        has_gps = EXCLUDED.has_gps,
        has_hr = EXCLUDED.has_hr,
        has_power = EXCLUDED.has_power,
        has_cadence = EXCLUDED.has_cadence,
        raw_data = EXCLUDED.raw_data
    """
    with conn.cursor() as cur:
        for a in activities:
            a_copy = dict(a)
            # Convert raw_data to JSON string for psycopg
            a_copy["raw_data"] = json.dumps(a_copy["raw_data"])
            _ = cur.execute(sql, a_copy)
    return len(activities)


def insert_wellness(conn: psycopg.Connection, records: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO health_wellness
      (day, athlete_id, weight, resting_hr, hrv, hrv_sdnn, vo2max, steps,
       sleep_secs, sleep_score, sleep_quality, avg_sleeping_hr, spo2,
       respiration_rate, systolic_bp, diastolic_bp, kcal_consumed, carbs_g,
       protein_g, fat_g, hydration, body_fat_pct, fatigue, soreness, stress,
       mood, motivation, injury_status, readiness)
    VALUES (%(day)s, %(athlete_id)s, %(weight)s, %(resting_hr)s, %(hrv)s,
            %(hrv_sdnn)s, %(vo2max)s, %(steps)s,
            %(sleep_secs)s, %(sleep_score)s, %(sleep_quality)s,
            %(avg_sleeping_hr)s, %(spo2)s, %(respiration_rate)s,
            %(systolic_bp)s, %(diastolic_bp)s, %(kcal_consumed)s, %(carbs_g)s,
            %(protein_g)s, %(fat_g)s, %(hydration)s, %(body_fat_pct)s,
            %(fatigue)s, %(soreness)s, %(stress)s, %(mood)s, %(motivation)s,
            %(injury_status)s, %(readiness)s)
    ON CONFLICT (day, athlete_id) DO UPDATE SET
        weight = EXCLUDED.weight,
        resting_hr = EXCLUDED.resting_hr,
        hrv = EXCLUDED.hrv,
        hrv_sdnn = EXCLUDED.hrv_sdnn,
        vo2max = EXCLUDED.vo2max,
        steps = EXCLUDED.steps,
        sleep_secs = EXCLUDED.sleep_secs,
        sleep_score = EXCLUDED.sleep_score,
        sleep_quality = EXCLUDED.sleep_quality,
        avg_sleeping_hr = EXCLUDED.avg_sleeping_hr,
        spo2 = EXCLUDED.spo2,
        respiration_rate = EXCLUDED.respiration_rate,
        systolic_bp = EXCLUDED.systolic_bp,
        diastolic_bp = EXCLUDED.diastolic_bp,
        kcal_consumed = EXCLUDED.kcal_consumed,
        carbs_g = EXCLUDED.carbs_g,
        protein_g = EXCLUDED.protein_g,
        fat_g = EXCLUDED.fat_g,
        hydration = EXCLUDED.hydration,
        body_fat_pct = EXCLUDED.body_fat_pct,
        fatigue = EXCLUDED.fatigue,
        soreness = EXCLUDED.soreness,
        stress = EXCLUDED.stress,
        mood = EXCLUDED.mood,
        motivation = EXCLUDED.motivation,
        injury_status = EXCLUDED.injury_status,
        readiness = EXCLUDED.readiness
    """
    with conn.cursor() as cur:
        for r in records:
            _ = cur.execute(sql, r)
    return len(records)


def insert_calendar(conn: psycopg.Connection, events: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO training_calendar
      (event_id, athlete_id, start_time, category, sport_type, name,
       predicted_tss, status, done)
    VALUES (%(event_id)s, %(athlete_id)s, %(start_time)s, %(category)s,
            %(sport_type)s, %(name)s, %(predicted_tss)s, %(status)s, %(done)s)
    ON CONFLICT (event_id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        category = EXCLUDED.category,
        sport_type = EXCLUDED.sport_type,
        name = EXCLUDED.name,
        predicted_tss = EXCLUDED.predicted_tss,
        status = EXCLUDED.status,
        done = EXCLUDED.done
    """
    with conn.cursor() as cur:
        for e in events:
            _ = cur.execute(sql, e)
    return len(events)


def insert_goals(conn: psycopg.Connection, goals: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO goals (goal_id, athlete_id, type, title, target_value,
                        current_value, unit, target_date, status)
    VALUES (%(goal_id)s, %(athlete_id)s, %(type)s, %(title)s, %(target_value)s,
            %(current_value)s, %(unit)s, %(target_date)s, %(status)s)
    ON CONFLICT (goal_id) DO UPDATE SET
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        target_value = EXCLUDED.target_value,
        current_value = EXCLUDED.current_value,
        unit = EXCLUDED.unit,
        target_date = EXCLUDED.target_date,
        status = EXCLUDED.status,
        updated_at = now()
    """
    with conn.cursor() as cur:
        for g in goals:
            _ = cur.execute(sql, g)
    return len(goals)


def insert_milestones(conn: psycopg.Connection, milestones: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO milestones (goal_id, title, target_date, target_value, achieved)
    VALUES (%(goal_id)s, %(title)s, %(target_date)s, %(target_value)s, %(achieved)s)
    """
    with conn.cursor() as cur:
        for m in milestones:
            _ = cur.execute(sql, m)
    return len(milestones)


def insert_phases(conn: psycopg.Connection, phases: list[dict[str, object]]) -> int:
    sql = """
    INSERT INTO training_phases (
        athlete_id, goal_id, name, start_date, end_date, target_weekly_tss
    ) VALUES (
        %(athlete_id)s, %(goal_id)s, %(name)s, %(start_date)s, %(end_date)s, %(target_weekly_tss)s
    )
    """
    with conn.cursor() as cur:
        for p in phases:
            _ = cur.execute(sql, p)
    return len(phases)


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:  # noqa: PLR0915
    print("Connecting to database...")
    conn = psycopg.connect(DSN, autocommit=False)

    try:
        # 1. Get athlete UUID
        print(f"Looking up athlete: {ADMIN_EMAIL}")
        with conn.cursor() as cur:
            _ = cur.execute("SELECT id FROM athletes WHERE email = %s", (ADMIN_EMAIL,))
            row = cur.fetchone()
            if not row:
                print(f"ERROR: No athlete found with email {ADMIN_EMAIL}", file=sys.stderr)
                sys.exit(1)
            athlete_id: UUID = row[0]
        print(f"  Athlete UUID: {athlete_id}")

        # 2. Generate and insert activities
        print("\n--- Activities ---")
        activities = generate_activities(athlete_id, DAYS_BACK, target_count=60)
        print(f"  Generated {len(activities)} activities")
        count = insert_activities(conn, activities)
        conn.commit()
        print(f"  Inserted/updated {count} activities")

        # 3. Generate and insert wellness
        print("\n--- Wellness ---")
        wellness = generate_wellness(athlete_id, DAYS_BACK)
        print(f"  Generated {len(wellness)} daily wellness records")
        count = insert_wellness(conn, wellness)
        conn.commit()
        print(f"  Inserted/updated {count} wellness records")

        # 4. Generate and insert calendar
        print("\n--- Training Calendar ---")
        calendar = generate_calendar(athlete_id, DAYS_FORWARD)
        print(f"  Generated {len(calendar)} planned events")
        count = insert_calendar(conn, calendar)
        conn.commit()
        print(f"  Inserted/updated {count} calendar events")

        # 5. Generate and insert goals/milestones/phases
        print("\n--- Goals & Milestones ---")
        goals, milestones, phases = generate_goals(athlete_id)
        gc = insert_goals(conn, goals)
        mc = insert_milestones(conn, milestones)
        pc = insert_phases(conn, phases)
        conn.commit()
        print(f"  Inserted {gc} goals, {mc} milestones, {pc} training phases")

        # 6. Ensure FTP/LTHR history exists for PMC computation
        print("\n--- FTP History ---")
        insert_ftp_history(conn, athlete_id)
        conn.commit()
        print("  FTP history seeded (FTP=250, LTHR=168)")

        # 7. Recompute daily_load
        print("\n--- Daily Load (PMC) ---")
        print(f"  Running recompute_load.py for athlete {athlete_id}...")
        script_dir = Path(__file__).resolve().parent
        recompute_script = script_dir / "recompute_load.py"
        result = subprocess.run(
            [sys.executable, str(recompute_script), str(athlete_id)],
            capture_output=True, text=True, cwd=script_dir.parent, check=False,
        )
        if result.returncode != 0:
            print(f"  WARNING: recompute_load.py failed:\n{result.stderr}")
        else:
            print(f"  {result.stdout.strip()}")

        # 7. Verify counts
        print("\n--- Verification ---")
        with conn.cursor() as cur:
            _ = cur.execute(
                "SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (athlete_id,)
            )
            act_count = cur.fetchone()[0]
            print(f"  activities: {act_count}")

            _ = cur.execute(
                "SELECT count(*) FROM health_wellness WHERE athlete_id = %s", (athlete_id,)
            )
            hw_count = cur.fetchone()[0]
            print(f"  wellness:   {hw_count}")

            _ = cur.execute(
                "SELECT count(*) FROM daily_load WHERE athlete_id = %s", (athlete_id,)
            )
            dl_count = cur.fetchone()[0]
            print(f"  daily_load: {dl_count}")

            _ = cur.execute(
                "SELECT count(*) FROM training_calendar WHERE athlete_id = %s", (athlete_id,)
            )
            tc_count = cur.fetchone()[0]
            print(f"  calendar:   {tc_count}")

            _ = cur.execute(
                "SELECT count(*) FROM goals WHERE athlete_id = %s", (athlete_id,)
            )
            g_count = cur.fetchone()[0]
            print(f"  goals:      {g_count}")

            _ = cur.execute(
                "SELECT count(*) FROM milestones m "
                "JOIN goals g ON m.goal_id = g.goal_id "
                "WHERE g.athlete_id = %s", (athlete_id,)
            )
            m_count = cur.fetchone()[0]
            print(f"  milestones: {m_count}")

        print("\nDone! Seed data generated successfully.")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
