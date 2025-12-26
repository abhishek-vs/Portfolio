#!/usr/bin/env python3
"""
app.py

Split a master syllabus PDF into per-course PDFs using fuzzy title matching.
Works on ONLY these 4 targets:
  - MAT 108: Numerical Methods, Probability Distributions and Sampling Techniques
  - CSE 261: Machine Learning
  - CSE 246: Computer network and Simulation
  - CSE 359: Data Science for Engineers

Dependencies:
  pip install pymupdf rapidfuzz

Example:
  python app.py --master "./Files/Syllabus/Master.pdf" --out "./Files/Syllabus/out" --min-score 78

Notes:
- Collision-safe: if multiple targets match the same start page, it tries the next-best candidate.
- Use --allow-duplicates if you want to export same page range for multiple targets anyway.
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF
from rapidfuzz import fuzz


# ---- TARGETS (only these 4) ----
TARGET_COURSES = [
    ("MAT 108", "Numerical Methods, Probability Distributions and Sampling Techniques"),
    ("CSE 261", "Machine Learning"),
    ("CSE 246", "Computer network and Simulation"),
    ("CSE 359", "Data Science for Engineers"),
]


def normalize(s: str) -> str:
    s = s.lower()
    s = s.replace("&", "and")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def safe_filename(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[\/\\\:\*\?\"\<\>\|\n\r\t]+", "_", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:180]


@dataclass(frozen=True)
class CourseStart:
    page: int  # 0-indexed
    extracted_title: str
    extracted_code: str
    raw_text_head: str


COURSE_NAME_PATTERNS = [
    re.compile(r"course\s*(name|title)\s*[:\-]\s*(.+)", re.IGNORECASE),
    re.compile(r"course\s*(name|title)\s*[:\-]?\s*\n\s*(.+)", re.IGNORECASE),
]

COURSE_CODE_PATTERNS = [
    re.compile(r"course\s*code\s*[:\-]\s*([A-Z]{2,}\s*\d{3,5}[A-Z]?)", re.IGNORECASE),
    re.compile(r"course\s*code\s*[:\-]?\s*\n\s*([A-Z]{2,}\s*\d{3,5}[A-Z]?)", re.IGNORECASE),
    re.compile(r"\b([A-Z]{2,}\s?\d{3,5}[A-Z]?)\b"),
]


def looks_like_course_syllabus_page(text: str) -> bool:
    """
    Heuristic for detecting the FIRST page of a syllabus block.
    Attempts to avoid curriculum tables listing many codes.
    """
    t = normalize(text)

    anchors = [
        "course outcomes",
        "course objectives",
        "course contents",
        "course description",
        "syllabus",
        "unit",
        "textbook",
        "reference",
        "evaluation",
    ]
    label_hits = sum(1 for a in anchors if a in t)

    has_course_code = ("course code" in t) or bool(re.search(r"\b[A-Z]{2,}\s?\d{3,5}[A-Z]?\b", text))
    has_course_name = ("course name" in t) or ("course title" in t)

    # Avoid curriculum tables: many codes on a page
    code_like = re.findall(r"\b[A-Z]{2,}\s?\d{3,5}[A-Z]?\b", text)
    too_many_codes = len(code_like) >= 12

    return (has_course_code and has_course_name and label_hits >= 1 and not too_many_codes)


def extract_course_title_and_code(text: str) -> Tuple[str, str]:
    head = text[:2500]

    title = ""
    for pat in COURSE_NAME_PATTERNS:
        m = pat.search(head)
        if m:
            title = m.group(2).strip()
            title = re.split(r"\n{1,}| {2,}", title)[0].strip()
            break

    code = ""
    for pat in COURSE_CODE_PATTERNS[:2]:
        m = pat.search(head)
        if m:
            code = m.group(1).strip()
            break

    if not code:
        m = COURSE_CODE_PATTERNS[2].search(head)
        if m:
            code = m.group(1).strip()

    return title, code


def best_fuzzy_score(target_title: str, candidate_title: str, candidate_page_text: str) -> int:
    """
    token_set_ratio handles word reordering & extra words well.
    """
    t = normalize(target_title)
    c = normalize(candidate_title)

    scores: List[int] = []
    if c:
        scores.append(fuzz.token_set_ratio(t, c))
        scores.append(fuzz.token_sort_ratio(t, c))

    # fallback: page head (slightly down-weighted)
    head = normalize(candidate_page_text[:2000])
    scores.append(int(0.85 * fuzz.token_set_ratio(t, head)))

    return max(scores) if scores else 0


def find_course_starts(doc: fitz.Document, start_page: int, end_page: int) -> List[CourseStart]:
    starts: List[CourseStart] = []
    for p in range(start_page, end_page + 1):
        text = doc.load_page(p).get_text("text") or ""
        if not text.strip():
            continue
        if looks_like_course_syllabus_page(text):
            title, code = extract_course_title_and_code(text)
            starts.append(CourseStart(page=p, extracted_title=title, extracted_code=code, raw_text_head=text[:2500]))

    # light de-dup: if adjacent pages repeat same header, keep first
    deduped: List[CourseStart] = []
    last_key = None
    last_page = -999
    for cs in sorted(starts, key=lambda x: x.page):
        key = (normalize(cs.extracted_title), normalize(cs.extracted_code))
        if key == last_key and cs.page == last_page + 1:
            continue
        deduped.append(cs)
        last_key = key
        last_page = cs.page
    return deduped


def build_page_ranges(starts_sorted: List[CourseStart], last_page_index: int) -> Dict[int, Tuple[int, int]]:
    """
    For each syllabus start page, its range ends at the page before the next start page.
    """
    ranges: Dict[int, Tuple[int, int]] = {}
    for i, cs in enumerate(starts_sorted):
        start_p = cs.page
        end_p = (starts_sorted[i + 1].page - 1) if i + 1 < len(starts_sorted) else last_page_index
        if end_p < start_p:
            end_p = start_p
        ranges[start_p] = (start_p, end_p)
    return ranges


def save_split(doc: fitz.Document, start_p: int, end_p: int, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    new_doc = fitz.open()
    new_doc.insert_pdf(doc, from_page=start_p, to_page=end_p)
    new_doc.save(str(out_path))
    new_doc.close()


def top_k_matches(
    target_title: str,
    starts: List[CourseStart],
    k: int = 8,
) -> List[Tuple[int, CourseStart]]:
    scored = [(best_fuzzy_score(target_title, cs.extracted_title, cs.raw_text_head), cs) for cs in starts]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:k]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True, help="Path to the master syllabus PDF")
    ap.add_argument("--out", required=True, help="Output folder for per-course PDFs")
    ap.add_argument("--min-score", type=int, default=78, help="Fuzzy match threshold (0-100)")
    ap.add_argument("--search-start", type=int, default=0, help="0-indexed page to start searching")
    ap.add_argument("--search-end", type=int, default=-1, help="0-indexed page to stop searching (inclusive), -1 = last")
    ap.add_argument("--topk", type=int, default=8, help="How many candidates to consider per course")
    ap.add_argument("--allow-duplicates", action="store_true",
                    help="If set, allow multiple targets to export the same start page range")
    args = ap.parse_args()

    master = Path(args.master)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(master))
    last_page = doc.page_count - 1
    start_page = max(0, args.search_start)
    end_page = last_page if args.search_end < 0 else min(last_page, args.search_end)

    print(f"[i] Master PDF: {master} ({doc.page_count} pages)")
    print("[i] Scanning for course-start pages (heuristics)...")
    starts = find_course_starts(doc, start_page=start_page, end_page=end_page)
    print(f"[i] Detected {len(starts)} candidate course syllabi starts.")

    if not starts:
        print("[!] No course-start pages detected. Try adjusting --search-start/--search-end.")
        doc.close()
        return 2

    starts_sorted = sorted(starts, key=lambda x: x.page)
    ranges = build_page_ranges(starts_sorted, last_page_index=last_page)

    # ---- Build ranked candidates per target ----
    candidates: Dict[Tuple[str, str], List[Tuple[int, CourseStart]]] = {}
    for code, title in TARGET_COURSES:
        candidates[(code, title)] = top_k_matches(title, starts_sorted, k=args.topk)

    # ---- Assign pages (collision-safe) ----
    used_pages = set()
    assignments: Dict[Tuple[str, str], Tuple[int, CourseStart]] = {}

    for code, title in TARGET_COURSES:
        key = (code, title)
        ranked = candidates[key]
        picked: Optional[Tuple[int, CourseStart]] = None

        for score, cs in ranked:
            if score < args.min_score:
                break
            if args.allow_duplicates or (cs.page not in used_pages):
                picked = (score, cs)
                break

        if picked is None:
            # record best (even if below threshold) for diagnostics
            best_score, best_cs = ranked[0]
            print(f"[!] Not extracted: {code} | {title} (best_score={best_score}, best_page={best_cs.page+1})")
            continue

        score, cs = picked
        assignments[key] = picked
        if not args.allow_duplicates:
            used_pages.add(cs.page)

    # ---- Export ----
    for (code, title), (score, cs) in assignments.items():
        sp, ep = ranges[cs.page]
        out_path = out_dir / safe_filename(f"{code} - {title}.pdf")
        save_split(doc, sp, ep, out_path)
        print(f"[ok] {code}: '{title}' -> pages {sp+1}-{ep+1} (match={score}) saved: {out_path}")

    doc.close()
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
