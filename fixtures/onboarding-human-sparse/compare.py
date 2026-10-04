import csv
import sys


def counts(path):
    with open(path, newline="", encoding="utf-8") as source:
        return {row["item"]: int(row["count"]) for row in csv.DictReader(source)}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compare.py <expected.csv> <actual.csv>")
    expected = counts(sys.argv[1])
    actual = counts(sys.argv[2])
    for item in sorted(expected.keys() | actual.keys()):
        difference = actual.get(item, 0) - expected.get(item, 0)
        if difference:
            print(f"{item},{difference}")
