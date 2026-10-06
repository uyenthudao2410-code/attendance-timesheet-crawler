const TZ='Asia/Ho_Chi_Minh';
const SPLIT=12*60+45;

const fmtMinutes=n=>{
  if(!Number.isInteger(n)||n<0)return null;
  return Math.floor(n/60)+'h'+String(n%60).padStart(2,'0');
};
const minuteOfDay=v=>{
  const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v||''));
  return m?Number(m[1])*60+Number(m[2]):null;
};
const period=s=>{
  const a=minuteOfDay(s?.in||s?.out);
  return a==null?'unknown':a<SPLIT?'morning':'afternoon';
};
const sessionText=s=>{
  if(!s||typeof s!=='object')return null;
  const input=s.in||'—', output=s.out||'—';
  if(input==='—'&&output==='—')return null;
  if(input!=='—'&&output!=='—'&&Number.isInteger(s.minutes))return input+'–'+output+' ('+fmtMinutes(s.minutes)+')';
  return input+'–'+output;
};
const joinSessions=list=>{
  const values=(list||[]).map(sessionText).filter(Boolean);
  return values.length?values.join('; '):'—';
};
const localTime=iso=>new Intl.DateTimeFormat('vi-VN',{
  timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false
}).format(new Date(iso));
const dateLabel=date=>{
  const d=new Date(date+'T00:00:00+07:00');
  const weekday=new Intl.DateTimeFormat('vi-VN',{timeZone:TZ,weekday:'long'}).format(d);
  const [y,m,day]=date.split('-');
  return weekday.charAt(0).toUpperCase()+weekday.slice(1)+', '+day+'/'+m+'/'+y;
};
const statusFromCode=code=>{
  if(code==='recorded')return 'Đã ghi nhận';
  if(['working','open_session'].includes(code))return 'Chưa chốt';
  if(['not_recorded','not_recorded_morning'].includes(code))return 'Chưa có bản ghi';
  return 'Cần đối soát';
};

function morningEmployee(row){
  const m=row.morning;
  const morning=joinSessions(m?[m]:[]);
  const status=statusFromCode(row.status_code);
  const total=status==='Đã ghi nhận'&&Number.isInteger(m?.minutes)?fmtMinutes(m.minutes)
    : status==='Chưa chốt'||status==='Cần đối soát'?'Chưa chốt':'—';
  return {name:row.name,morning,afternoon:'—',total,status,attention:status!=='Đã ghi nhận'};
}

function dailyEmployee(row){
  const sessions=Array.isArray(row.sessions)?row.sessions:[];
  const morning=joinSessions(sessions.filter(s=>period(s)==='morning'));
  const afternoon=joinSessions(sessions.filter(s=>period(s)==='afternoon'));
  const status=statusFromCode(row.status_code);
  const total=status==='Đã ghi nhận'&&Number.isInteger(row.total_minutes)?fmtMinutes(row.total_minutes)
    : status==='Chưa chốt'||status==='Cần đối soát'?'Chưa chốt':'—';
  return {name:row.name,morning,afternoon,total,status,attention:status!=='Đã ghi nhận'};
}

export function businessReportToNativeSource(report){
  if(report?.kind!=='attendance_business_report'||report?.schema_version!==1)throw new Error('Invalid attendance business report');
  if(!['morning_1230','daily_2105'].includes(report.slot))throw new Error('Unsupported report slot');
  if(!Array.isArray(report.employees)||report.employees.length!==8)throw new Error('Native production requires exactly 8 employees');

  const employees=report.slot==='morning_1230'
    ? report.employees.map(morningEmployee)
    : report.employees.map(dailyEmployee);

  const closed=employees.filter(e=>e.status==='Đã ghi nhận');
  const withRecord=employees.filter(e=>e.morning!=='—'||e.afternoon!=='—');
  const totalMinutes=closed.reduce((sum,e)=>{
    const m=/^(\d+)h([0-5]\d)$/.exec(e.total);
    return sum+(m?Number(m[1])*60+Number(m[2]):0);
  },0);
  const attention=employees.length-closed.length;

  return {
    report_title:report.slot==='morning_1230'?'BÁO CÁO CHẤM CÔNG — CA SÁNG':'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',
    report_scope:report.slot==='morning_1230'?'morning':'daily',
    target_date:report.date,
    date_label:dateLabel(report.date),
    updated:localTime(report.source_generated_at||report.generated_at),
    kpis:{total:8,with_record:withRecord.length,closed:closed.length,attention},
    total_hours:fmtMinutes(totalMinutes)||'0h00',
    rate:String(Math.round(withRecord.length/8*100))+'%',
    attention_summary:employees.filter(e=>e.status!=='Đã ghi nhận').map(e=>e.name+' — '+e.status).join(' · '),
    employees
  };
}
