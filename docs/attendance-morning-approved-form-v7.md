# Approved Morning Attendance Form V7

Status: **APPROVED**  
Approved date: 2026-10-04  
Slot: `morning_1230`

## Purpose

This document locks the approved visual form for the morning attendance report. The GitHub producer must build a prompt that follows this structure exactly, and ChatGPT Image must generate the final image directly from that prompt.

## Fixed visual structure

1. Bright modern office + greenery header
2. Green eyebrow: `BÁO CÁO NHÂN SỰ`
3. Main title: `BÁO CÁO CHẤM CÔNG — CA SÁNG`
4. Date chip + update-time chip
5. Four KPI cards:
   - Tổng nhân sự
   - Đã ghi nhận ca sáng
   - Cần kiểm tra
   - Tỷ lệ ghi nhận
6. Gold full-width duration strip:
   - Tổng thời lượng xác nhận
   - Trung bình/người
7. Middle row:
   - Left: `THỜI LƯỢNG CA SÁNG THEO NHÂN SỰ`
   - Right: `TỔNG QUAN`
8. Full-width table:
   - `STT | Họ và tên | Trạng thái | Giờ vào | Giờ ra | Thời lượng | Mức công`
9. Full-width blue reconciliation footer
10. Tasteful greenery along lower corners/edge

## Color language

- Fresh green: positive / recorded
- Deep navy + professional blue: hierarchy and information
- Warm gold: time, total duration and rate emphasis
- Red: missing/attention only
- White/light blue: primary surfaces

## Hard locks

- No logo
- No company-name mark
- No tagline
- No slogan
- No motivational quote
- No invented text
- All 8 employees exactly once, in source order
- Exact Vietnamese spelling and accents
- Canonical employee spelling: `Điêu Văn Mạnh`
- Missing values: `—`
- Final image must be direct ChatGPT Image output
- If QA fails, discard and regenerate; do not overlay, patch or re-render the image

## Production state

- `morning_1230`: approved
- `daily_2105`: test-only until separately approved
