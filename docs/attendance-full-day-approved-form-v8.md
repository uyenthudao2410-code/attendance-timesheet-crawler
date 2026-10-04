# Approved Full-Day Attendance Form V8

Status: **APPROVED**  
Approved date: 2026-10-04  
Slot: `daily_2105`

## Purpose

This document locks the approved visual form for the full-day attendance report. The GitHub producer must build a prompt that follows this structure exactly, and ChatGPT Image must generate the final image directly from that prompt.

## Fixed visual structure

1. Bright modern office + greenery header
2. Green eyebrow: `BÁO CÁO NHÂN SỰ`
3. Main title: `BÁO CÁO CHẤM CÔNG — CẢ NGÀY`
4. Date chip + update-time chip
5. Four KPI cards:
   - Tổng nhân sự
   - Có dữ liệu chấm công
   - Đã chốt đủ dữ liệu
   - Tỷ lệ có bản ghi
6. Gold full-width confirmed-hours strip:
   - Tổng giờ công đã xác nhận
   - Trung bình/người
7. Middle row:
   - Left: `TỔNG GIỜ CÔNG THEO NHÂN SỰ`
   - Right: `TỔNG QUAN CẢ NGÀY`
8. Full-width table:
   - `STT | Họ và tên | Ca sáng | Ca chiều | Tổng công | Trạng thái`
9. Full-width blue reconciliation footer
10. Tasteful greenery along lower corners/edge

## Chart language

- Morning segment: professional blue
- Afternoon segment: fresh green
- Open/unclosed: amber
- No-record/error: red dashed empty placeholder
- Preserve the exact 8-person source order

## Color language

- Fresh green: positive / recorded / afternoon
- Deep navy + professional blue: hierarchy / information / morning
- Warm gold: total time and completion rate
- Red: missing / attention only
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
- Preserve every supplied morning session, afternoon session, total duration and status exactly
- Final image must be direct ChatGPT Image output
- If QA fails, discard and regenerate; do not overlay, patch or re-render the image

## Production state

- `morning_1230`: approved
- `daily_2105`: approved
