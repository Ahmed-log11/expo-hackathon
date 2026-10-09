"""
Prepare the theme-park queue data for training the wait-time model.

Input  (ml/data/):  waiting_times.csv, attendance.csv, link_attraction_park.csv
Cleaning rules come from the EDA (ml/eda.ipynb):
  - drop closed slots (OPEN_TIME = 0 or CAPACITY = 0): stuck sign values, nobody riding
  - drop wait = 300: the system's cap value, not a real wait
  - drop days with attendance <= 0: recording errors
  - add attendance_per_ride: crowd relative to the number of open rides
Output (ml/data/):  train.parquet   (or train.csv.gz if pyarrow isn't installed)

Idea: predict what the wait will be in 30 minutes, given what is happening now.
That is exactly what the Expo engine needs from predict_wait().

Run from the repo root:
    python ml/prepare_data.py
"""

from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data"
HORIZON_MIN = 30      # how far ahead we predict
SLOT_MIN = 15         # the data comes in 15-minute slots

# weekend days of the place the data comes from (0 = Monday ... 6 = Sunday)
# European parks: Saturday + Sunday. For Riyadh / simulation data use (4, 5) = Friday + Saturday
WEEKEND_DAYS = (5, 6)


def load_waits() -> pd.DataFrame:
    cols = ["WORK_DATE", "DEB_TIME", "ENTITY_DESCRIPTION_SHORT", "WAIT_TIME_MAX",
            "GUEST_CARRIED", "CAPACITY", "ADJUST_CAPACITY", "OPEN_TIME", "DOWNTIME"]
    df = pd.read_csv(DATA / "waiting_times.csv", usecols=cols)
    df = df.rename(columns={
        "WORK_DATE": "date", "DEB_TIME": "time", "ENTITY_DESCRIPTION_SHORT": "attraction",
        "WAIT_TIME_MAX": "wait", "GUEST_CARRIED": "guests", "CAPACITY": "capacity_raw", "ADJUST_CAPACITY": "capacity",
        "OPEN_TIME": "open_min", "DOWNTIME": "down_min",
    })
    df["time"] = pd.to_datetime(df["time"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    before = len(df)
    # keep only slots where the ride was actually open and running
    # (same rule as the EDA: OPEN_TIME > 0 and CAPACITY > 0)
    df = df[(df["open_min"] > 0) & (df["capacity_raw"] > 0)]
    # adjusted capacity is used for the load ratio, so it must be positive too
    df = df[df["capacity"] > 0]
    # drop impossible values; 300 is the system's cap value (a fake reading), not a real wait
    df = df[(df["wait"] >= 0) & (df["wait"] < 300) & (df["guests"] >= 0)]
    df = df.drop_duplicates(["attraction", "time"])
    print(f"cleaning: kept {len(df):,} of {before:,} rows")
    return df


def add_park_and_attendance(df: pd.DataFrame) -> pd.DataFrame:
    link = pd.read_csv(DATA / "link_attraction_park.csv", sep=";")
    link = link.rename(columns={"ATTRACTION": "attraction", "PARK": "park"})
    # a ride name in two parks would duplicate rows in the merge below, so stop early
    dupes = link[link["attraction"].duplicated(keep=False)]
    if not dupes.empty:
        raise ValueError(f"ride names appear in more than one park:\n{dupes}")
    att = pd.read_csv(DATA / "attendance.csv", parse_dates=["USAGE_DATE"])
    att = att.rename(columns={"USAGE_DATE": "date", "FACILITY_NAME": "park"})
    bad = (att["attendance"] <= 0).sum()
    att = att[att["attendance"] > 0]          # zero/negative attendance = recording errors
    print(f"attendance: dropped {bad} days with zero or negative values")

    rows_before = len(df)
    df = df.merge(link, on="attraction", how="left")
    df = df.merge(att, on=["date", "park"], how="left")
    assert len(df) == rows_before, "merge changed the number of rows (duplicate keys?)"
    missing = df["attendance"].isna().mean()
    print(f"attendance missing for {missing:.1%} of rows (those rows are dropped)")
    df = df.dropna(subset=["attendance"])

    # crowd relative to park size: the same crowd means longer queues in a park with fewer rides
    open_rides = df.groupby(["date", "park"])["attraction"].nunique().rename("open_rides")
    df = df.merge(open_rides, on=["date", "park"], how="left")
    df["attendance_per_ride"] = df["attendance"] / df["open_rides"]
    return df


def add_features_and_target(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["attraction", "time"]).copy()
    g = df.groupby("attraction")

    # what was happening 15 minutes ago (only if that slot really exists)
    prev_ok = (df["time"] - g["time"].shift(1)) == pd.Timedelta(minutes=SLOT_MIN)
    df["wait_prev"] = g["wait"].shift(1).where(prev_ok)

    # target: the wait HORIZON_MIN minutes from now (only if that slot exists)
    steps = HORIZON_MIN // SLOT_MIN
    future_ok = (g["time"].shift(-steps) - df["time"]) == pd.Timedelta(minutes=HORIZON_MIN)
    df[f"wait_in_{HORIZON_MIN}"] = g["wait"].shift(-steps).where(future_ok)

    # time features
    df["hour"] = df["time"].dt.hour
    df["minute_of_day"] = df["hour"] * 60 + df["time"].dt.minute
    df["day_of_week"] = df["time"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin(WEEKEND_DAYS).astype(int)
    df["month"] = df["time"].dt.month

    # load: how full the ride is right now
    df["load_ratio"] = (df["guests"] / df["capacity"]).clip(0, 2)

    df = df.dropna(subset=["wait_prev", f"wait_in_{HORIZON_MIN}"])
    return df


def main() -> None:
    df = load_waits()
    df = clean(df)
    df = add_park_and_attendance(df)
    df = add_features_and_target(df)

    keep = ["time", "park", "attraction", "attendance", "open_rides", "attendance_per_ride",
            "hour", "minute_of_day",
            "day_of_week", "is_weekend", "month", "wait", "wait_prev", "guests",
            "capacity", "load_ratio", "down_min", f"wait_in_{HORIZON_MIN}"]
    df = df[keep]

    try:
        out = DATA / "train.parquet"
        df.to_parquet(out, index=False)
    except ImportError:
        out = DATA / "train.csv.gz"
        df.to_csv(out, index=False)

    print(f"\nsaved {len(df):,} rows to {out}")
    print(f"attractions: {df['attraction'].nunique()}, parks: {df['park'].nunique()}")
    print(f"dates: {df['time'].min().date()} to {df['time'].max().date()}")
    print("\nwait now vs wait in 30 min (minutes):")
    print(df[["wait", f"wait_in_{HORIZON_MIN}"]].describe().round(1))


if __name__ == "__main__":
    main()
