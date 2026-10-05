import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const slot=String(process.env.ATTENDANCE_RUN_SLOT||'').trim();
const date=String(process.env.TARGET_DATE||'').trim();
if(!['morning_1230','daily_2105'].includes(slot)) throw new Error('Unsupported ATTENDANCE_RUN_SLOT');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid TARGET_DATE');

const request=JSON.parse(await fs.readFile(path.join('output',`ai-visual-request-${slot}-${date}.json`),'utf8'));
if(request.slot!==slot||request.date!==date) throw new Error('AI visual request identity mismatch');
if(!String(request.spec_version||'').startsWith('ATTENDANCE_AI_VISUAL_V9_MOBILE_STRICT_DATA_')) throw new Error('Strict renderer requires V9 or newer visual request');
if(!request.data||!Array.isArray(request.data.employees)||request.data.employees.length!==8) throw new Error('Strict renderer requires exactly 8 employees');
if(request.data.employees[0]?.name!=='Điêu Văn Mạnh') throw new Error('Canonical employee spelling/order mismatch');

const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const d=request.data;
const isDaily=slot==='daily_2105';
const tone=(code)=>['recorded','working'].includes(String(code))?'ok':['not_recorded','not_recorded_morning','technical_error','source_review'].includes(String(code))?'bad':'warn';

const title=isDaily?'BÁO CÁO CHẤM CÔNG — CẢ NGÀY':'BÁO CÁO CHẤM CÔNG — CA SÁNG';
const subtitle='Tổng hợp dữ liệu chấm công phục vụ đối soát nội bộ';
const footer='Số liệu phục vụ đối soát, không mặc nhiên là giá trị công chính thức. Sai lệch hoặc vướng mắc vui lòng phản hồi P.HC-NS để kiểm tra và điều chỉnh.';

const kpis=isDaily
? [
  ['TỔNG NHÂN SỰ',d.total_employees,'blue','01'],
  ['CÓ DỮ LIỆU',d.with_record_count,'green','02'],
  ['ĐÃ CHỐT ĐỦ',d.recorded_count,'green','03'],
  ['TỶ LỆ CÓ BẢN GHI',`${d.attendance_rate}%`,'gold','04'],
]
: [
  ['TỔNG NHÂN SỰ',d.total_employees,'blue','01'],
  ['ĐÃ GHI NHẬN',d.recorded_count,'green','02'],
  ['CẦN KIỂM TRA',d.missing_count+d.review_count,'red','03'],
  ['TỶ LỆ GHI NHẬN',`${d.attendance_rate}%`,'gold','04'],
];

const summaryMain=isDaily?`Tổng giờ công đã xác nhận: ${d.total_hours_text}`:`Tổng thời lượng xác nhận: ${d.total_hours_text}`;
const summarySub=isDaily?`Trung bình ${d.average_hours_text}/người · trên ${d.recorded_count} người đã chốt`:`Trung bình ${d.average_hours_text}/người · trên ${d.recorded_count} người đã ghi nhận`;

function employeeCard(row,index){
  const t=tone(row.status_code);
  const statusClass=`status ${t}`;
  const number=String(index+1).padStart(2,'0');
  if(isDaily){
    return `<section class="employee-card ${t}">
      <div class="card-head">
        <div class="person">
          <div class="badge">${number}</div>
          <div><div class="name">${esc(row.name)}</div><div class="micro">NHÂN SỰ ${number}</div></div>
        </div>
        <div class="${statusClass}">${esc(row.status)}</div>
      </div>
      <div class="card-grid">
        <div class="cell"><span>CA SÁNG</span><strong>${esc(row.morning_text)}</strong></div>
        <div class="cell"><span>CA CHIỀU</span><strong>${esc(row.afternoon_text)}</strong></div>
        <div class="cell total"><span>TỔNG CÔNG</span><strong>${esc(row.total_display)}</strong></div>
      </div>
    </section>`;
  }
  return `<section class="employee-card ${t}">
    <div class="card-head">
      <div class="person">
        <div class="badge">${number}</div>
        <div><div class="name">${esc(row.name)}</div><div class="micro">NHÂN SỰ ${number}</div></div>
      </div>
      <div class="${statusClass}">${esc(row.status)}</div>
    </div>
    <div class="card-grid morning">
      <div class="cell"><span>GIỜ VÀO</span><strong>${esc(row.check_in)}</strong></div>
      <div class="cell"><span>GIỜ RA</span><strong>${esc(row.check_out)}</strong></div>
      <div class="cell"><span>THỜI LƯỢNG</span><strong>${esc(row.duration)}</strong></div>
      <div class="cell total"><span>MỨC CÔNG</span><strong>${esc(row.work_rate_percent)}%</strong></div>
    </div>
  </section>`;
}
const employees=d.employees.map(employeeCard).join('');

const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:1800px;background:#eef4f7;color:#0a315d;font-family:Arial,"Segoe UI","DejaVu Sans",sans-serif}
body{overflow:hidden}
.page{width:1080px;height:1800px;padding:36px;background:linear-gradient(180deg,#edf8f5 0,#f5f8fb 27%,#f7f9fb 100%)}
.hero{height:192px;border-radius:30px;padding:28px 32px;position:relative;overflow:hidden;background:linear-gradient(120deg,#ffffff 0%,#f3fbf7 52%,#e7f4fb 100%);box-shadow:0 14px 35px rgba(14,57,89,.10);border:1px solid #dbe7ec}
.hero:before{content:"";position:absolute;right:-45px;top:-70px;width:360px;height:260px;border-radius:56% 44% 60% 40%;background:radial-gradient(circle at 40% 35%,rgba(53,207,119,.40),rgba(34,145,208,.16) 55%,rgba(255,255,255,0) 72%)}
.hero:after{content:"";position:absolute;right:38px;bottom:22px;width:212px;height:54px;border-radius:18px;background:linear-gradient(90deg,rgba(11,55,104,.08),rgba(39,200,111,.10));transform:skewX(-18deg)}
.eyebrow{font-size:18px;font-weight:900;letter-spacing:2.1px;color:#12834b;margin-bottom:10px}
.title{font-size:43px;font-weight:950;letter-spacing:-.6px;color:#082f63;line-height:1.03;position:relative;z-index:2}
.subtitle{font-size:19px;font-weight:650;color:#5b7185;margin-top:9px;position:relative;z-index:2}
.meta{display:flex;gap:12px;margin-top:17px;position:relative;z-index:2}
.meta .chip{font-size:16px;font-weight:850;padding:9px 13px;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid #d9e5ec;color:#173f68}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.kpi{height:96px;border-radius:22px;background:#fff;border:1px solid #dfe9ef;box-shadow:0 8px 22px rgba(21,57,91,.065);display:grid;grid-template-columns:62px 1fr 104px;align-items:center;padding:13px 17px}
.kpi .num{width:45px;height:45px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;background:#eef5fb;color:#2c5e88}
.kpi .label{font-size:15px;font-weight:900;color:#60758b;letter-spacing:.5px}
.kpi .value{text-align:right;font-size:35px;font-weight:950}
.kpi.blue .value{color:#1c70c9}.kpi.green .value{color:#159451}.kpi.gold .value{color:#bb7f13}.kpi.red .value{color:#d84747}
.summary{height:90px;margin-top:16px;border-radius:24px;background:linear-gradient(95deg,#0a7b49,#15955a 58%,#16679a);display:flex;align-items:center;justify-content:space-between;padding:18px 24px;color:#fff;box-shadow:0 9px 24px rgba(10,95,71,.16)}
.summary .main{font-size:25px;font-weight:950}
.summary .sub{font-size:17px;font-weight:800;opacity:.96;text-align:right}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;margin:20px 3px 10px}
.section-head .left{font-size:21px;font-weight:950;color:#0b4e7e;letter-spacing:.4px}
.section-head .right{font-size:14px;font-weight:800;color:#73889a}
.employee-list{display:flex;flex-direction:column;gap:10px}
.employee-card{height:121px;border-radius:20px;background:#fff;border:1px solid #dfe9ef;border-left:7px solid #2d91cf;padding:13px 16px 12px;box-shadow:0 5px 14px rgba(20,54,84,.045)}
.employee-card.ok{border-left-color:#29a963}.employee-card.warn{border-left-color:#e4a13a}.employee-card.bad{border-left-color:#dc4a4a}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.person{display:flex;align-items:center;gap:12px}
.badge{width:36px;height:36px;border-radius:12px;background:#edf5fb;color:#145b91;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:950}
.name{font-size:19px;font-weight:950;color:#0b315d;line-height:1.1}
.micro{font-size:10px;font-weight:900;letter-spacing:1.1px;color:#8a9bab;margin-top:2px}
.status{padding:8px 11px;border-radius:999px;font-size:12.5px;font-weight:950;white-space:nowrap}
.status.ok{background:#e9f8ef;color:#128149}.status.warn{background:#fff4de;color:#996008}.status.bad{background:#ffeded;color:#bf3434}
.card-grid{display:grid;grid-template-columns:1.35fr 1.35fr .72fr;gap:10px}
.card-grid.morning{grid-template-columns:1fr 1fr 1fr .75fr}
.cell{min-width:0;padding:0 2px}
.cell span{display:block;font-size:10px;font-weight:950;color:#8293a2;letter-spacing:.7px;margin-bottom:3px}
.cell strong{display:block;font-size:15px;font-weight:800;color:#244a70;line-height:1.22;white-space:normal;overflow-wrap:anywhere}
.cell.total strong{font-size:19px;color:#0a315d;font-weight:950}
.footer{margin-top:15px;border-radius:17px;background:#eef4f8;border:1px solid #d8e5ec;padding:12px 15px;font-size:13px;line-height:1.34;font-weight:750;color:#536f86}
</style></head><body><main class="page">
<section class="hero">
<div class="eyebrow">BÁO CÁO NHÂN SỰ</div>
<div class="title">${esc(title)}</div>
<div class="subtitle">${esc(subtitle)}</div>
<div class="meta"><div class="chip">${esc(request.date_text)}</div><div class="chip">Cập nhật dữ liệu: ${esc(request.updated_time_text)}</div></div>
</section>
<section class="kpis">${kpis.map(([label,value,klass,num])=>`<div class="kpi ${klass}"><div class="num">${num}</div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join('')}</section>
<section class="summary"><div class="main">${esc(summaryMain)}</div><div class="sub">${esc(summarySub)}</div></section>
<div class="section-head"><div class="left">${isDaily?'CHI TIẾT CHẤM CÔNG CẢ NGÀY':'CHI TIẾT CHẤM CÔNG CA SÁNG'}</div><div class="right">08 NHÂN SỰ · DỮ LIỆU ĐÃ ĐỐI CHIẾU</div></div>
<section class="employee-list">${employees}</section>
<div class="footer">${esc(footer)}</div>
</main></body></html>`;

const required=[title,request.date_text,request.updated_time_text,String(d.total_employees),d.total_hours_text,...d.employees.flatMap((r)=>isDaily?[r.name,r.morning_text,r.afternoon_text,r.total_display,r.status]:[r.name,r.status,r.check_in,r.check_out,r.duration,`${r.work_rate_percent}%`])];
for(const v of required){if(!html.includes(esc(v))) throw new Error(`Strict renderer lost required text: ${v}`);}
if(new Set(d.employees.map((r)=>r.name)).size!==8) throw new Error('Strict renderer employee names are not unique');

const outputPath=path.join('output',`attendance-${slot}-${date}.png`);
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1080,height:1800},deviceScaleFactor:1});
  const page=await context.newPage();
  await page.setContent(html,{waitUntil:'load'});
  const bodyHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
  if(bodyHeight>1800) throw new Error(`Strict renderer overflow: ${bodyHeight}px`);
  await page.screenshot({path:outputPath,type:'png',fullPage:false});
  await context.close();
}finally{await browser.close();}

const bytes=await fs.readFile(outputPath);
if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Strict renderer output is not PNG');
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
if(width!==1080||height!==1800) throw new Error(`Strict renderer dimensions mismatch: ${width}x${height}`);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
console.log('ATTENDANCE_STRICT_RENDER_QA=PASS');
console.log(JSON.stringify({origin:'strict_data_renderer_v2',slot,date,file:outputPath,width,height,bytes:bytes.length,sha256}));
if(process.env.GITHUB_ENV) await fs.appendFile(process.env.GITHUB_ENV,[
  'ATTENDANCE_STRICT_RENDER_QA=PASS',
  'ATTENDANCE_IMAGE_ORIGIN=strict_data_renderer_v2',
  `ATTENDANCE_IMAGE_FILE=${outputPath}`,
  `ATTENDANCE_IMAGE_SHA256=${sha256}`,
  `ATTENDANCE_IMAGE_WIDTH=${width}`,
  `ATTENDANCE_IMAGE_HEIGHT=${height}`,
  ''
].join('\n'),'utf8');
