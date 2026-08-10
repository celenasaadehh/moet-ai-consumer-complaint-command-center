import pandas as pd
import re

# =====================================
# CONFIG
# =====================================

INPUT_CSV = "python/consumer_complaints.csv"
OUTPUT_CSV = "python/consumer_complaints_cleaned.csv"

# =====================================
# LOAD CSV
# =====================================

print("Loading CSV file...")

df = pd.read_csv(INPUT_CSV)

print(f"Rows loaded: {len(df)}")

# =====================================
# STANDARDIZE COLUMN NAMES
# =====================================

df.columns = (
    df.columns
    .str.strip()
    .str.lower()
    .str.replace(" ", "_")
)

print("\nColumns found:")
print(df.columns.tolist())

# =====================================
# REQUIRED COLUMNS
# =====================================

required_columns = [
    "message",
    "category",
    "establishment_name",
    "province"
]

missing = [
    col
    for col in required_columns
    if col not in df.columns
]

if missing:
    raise Exception(
        f"Missing required columns: {missing}"
    )

# =====================================
# REMOVE COMPLETELY EMPTY ROWS
# =====================================

before = len(df)

df = df.dropna(how="all")

print(
    f"Removed empty rows: {before - len(df)}"
)

# =====================================
# REMOVE ROWS WITH MISSING REQUIRED DATA
# =====================================

before = len(df)

df = df.dropna(
    subset=required_columns
)

print(
    f"Removed rows with missing data: {before - len(df)}"
)

# =====================================
# CLEAN TEXT
# =====================================

def clean_text(text):

    if pd.isna(text):
        return ""

    text = str(text)

    text = text.strip()

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text

text_columns = [
    "message",
    "category",
    "establishment_name",
    "province"
]

for col in text_columns:
    df[col] = df[col].apply(clean_text)

# =====================================
# STANDARDIZE CATEGORY
# =====================================

df["category"] = (
    df["category"]
    .str.lower()
    .str.strip()
)

# =====================================
# REMOVE EMPTY STRINGS
# =====================================

before = len(df)

df = df[
    df["message"] != ""
]

print(
    f"Removed empty complaints: {before - len(df)}"
)

# =====================================
# REMOVE NAN STRINGS
# =====================================

before = len(df)

df = df[
    ~df["message"].str.lower().eq("nan")
]

print(
    f"Removed 'nan' complaints: {before - len(df)}"
)

# =====================================
# REMOVE VERY SHORT COMPLAINTS
# =====================================

before = len(df)

df = df[
    df["message"].str.len() >= 10
]

print(
    f"Removed short complaints: {before - len(df)}"
)

# =====================================
# REMOVE DUPLICATE ROWS
# =====================================

before = len(df)

df = df.drop_duplicates()

print(
    f"Removed duplicate rows: {before - len(df)}"
)

# =====================================
# REMOVE DUPLICATE COMPLAINTS
# =====================================

before = len(df)

df = df.drop_duplicates(
    subset=["message"]
)

print(
    f"Removed duplicate complaints: {before - len(df)}"
)

# =====================================
# RESET INDEX
# =====================================

df = df.reset_index(
    drop=True
)

# =====================================
# SAVE CLEAN CSV
# =====================================

df.to_csv(
    OUTPUT_CSV,
    index=False,
    encoding="utf-8-sig"
)

# =====================================
# DONE
# =====================================

print("\n==========================")
print("Cleaning Complete")
print("==========================")
print(f"Final rows: {len(df)}")
print(f"Saved file: {OUTPUT_CSV}")