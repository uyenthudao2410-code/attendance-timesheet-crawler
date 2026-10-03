# Attendance AI Image Prompt Standard V2

Runtime source of truth: `src/attendance-ai-visual.mjs`

Visual spec: `config/attendance-ai-visual-spec.json`

## Common visual system

- Canvas: 1080x1440 PNG, ratio 3:4.
- Style: premium Vietnamese corporate HR infographic.
- Primary positive accent: fresh bright green `#27C86F` / `#52D985`.
- Foundation: deep navy `#0B2E66`, professional blue `#1F6FCE`, restrained gold `#D9A62E`.
- Red `#E5484D` is reserved for missing/error states.
- Mood: energetic, motivating, disciplined, confident, modern and business-like.
- Header atmosphere: bright modern office, natural daylight, glass/city depth, fresh green plants and subtle business objects.
- No fake company logo, no invented slogan, no random English body text, no people faces.
- Typography must preserve Vietnamese diacritics and remain readable on Teams mobile and desktop.
- Fixed order: header -> 4 KPI cards -> confirmed-hours strip -> chart + overview -> 8-row detail table -> footer.
- Every business value must come from the validated report. Never infer missing values.
- Show all 8 employees exactly once, in the validated order.

## Morning report prompt standard

Title:
`BÁO CÁO CHẤM CÔNG — CA SÁNG`

Required blocks:

1. Header: date, update time, subtitle.
2. KPI cards:
   - Tổng nhân sự
   - Đã ghi nhận ca sáng
   - Cần kiểm tra
   - Tỷ lệ ghi nhận
3. Full-width duration strip:
   - Tổng thời lượng xác nhận
   - Trung bình/người trên số người đã ghi nhận
4. Chart:
   - `THỜI LƯỢNG CA SÁNG THEO NHÂN SỰ`
   - Confirmed = blue/fresh-green bar
   - Review = amber
   - Missing = red dashed placeholder, zero positive bar
5. Overview:
   - Đã ghi nhận
   - Chưa có bản ghi
   - Cần đối soát khác
   - Tỷ lệ hoàn tất
6. Table:
   - STT | Họ và tên | Trạng thái | Giờ vào | Giờ ra | Thời lượng
7. Footer:
   - `Lưu ý: Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.`

Dynamic employee row format:

`{STT}. {HỌ TÊN} | trạng thái: {TRẠNG THÁI} | giờ vào: {GIỜ VÀO} | giờ ra: {GIỜ RA} | thời lượng: {THỜI LƯỢNG} | mức công: {PERCENT}%`

## Full-day report prompt standard

Title:
`BÁO CÁO CHẤM CÔNG — CẢ NGÀY`

Required blocks:

1. Header: report date, update time, full-day subtitle.
2. KPI cards:
   - Tổng nhân sự
   - Có dữ liệu chấm công
   - Đã chốt đủ dữ liệu
   - Tỷ lệ có bản ghi
3. Full-width duration strip:
   - Tổng giờ công đã xác nhận
   - Trung bình/người trên số người đã chốt
4. Chart:
   - `TỔNG GIỜ CÔNG THEO NHÂN SỰ`
   - Morning segment = corporate blue
   - Afternoon segment = fresh green
   - Open/unclosed = amber
   - No record/error = red dashed placeholder, zero positive bar
5. Overview:
   - Đã ghi nhận đầy đủ
   - Chưa chốt
   - Chưa có bản ghi
   - Cần đối soát/lỗi nguồn
   - Tổng cần kiểm tra
   - Tỷ lệ có bản ghi
6. Table:
   - STT | Họ và tên | Ca sáng | Ca chiều | Tổng công | Trạng thái
7. Footer uses the same reconciliation disclaimer as the morning report.

Dynamic employee row format:

`{STT}. {HỌ TÊN} | ca sáng: {CA SÁNG} | ca chiều: {CA CHIỀU} | tổng công: {TỔNG CÔNG} | trạng thái: {TRẠNG THÁI}`

## Non-negotiable generation rules

- Copy every supplied name, date, time, duration, status and KPI exactly.
- Never invent, recalculate or correct attendance values inside the image model.
- Missing values display as `—`.
- Do not omit or merge employee rows.
- If text is long, wrap or reduce font size; never paraphrase.
- No extra quote, fake logo or decorative body text.
- Output one polished 1080x1440 vertical infographic image only.
