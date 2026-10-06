import { createHash } from 'node:crypto';

export const LAYOUT = 'ATTENDANCE_MOBILE_NATIVE_V23_GRAPH_PROFILE_PHOTO';
export const TEST_CHAT = '19:0e02d613cded448892f27d74cff19d63@thread.v2';

const DATA_KEYS = ['target_date','date_label','updated','kpis','total_hours','rate','attention_summary','employees'];
const fail = message => { throw new Error('NATIVE_CARD_GATE: ' + message); };

export const digest = value => createHash('sha256').update(value).digest('hex');
export const sourceDigest = s => digest(JSON.stringify(Object.fromEntries(DATA_KEYS.map(k => [k,s[k]]))));

export function durationMinutes(value) {
  const m=/^(\d+)h([0-5]\d)$/.exec(String(value));
  return m ? Number(m[1])*60 + Number(m[2]) : null;
}

export function sessionMinutes(value) {
  if (value==='—') return [];
  return value.split('; ').flatMap(session=>{
    const m=/^\d{2}:\d{2}–\d{2}:\d{2} \((\d+h[0-5]\d)\)$/.exec(session);
    if (m) return [durationMinutes(m[1])];
    if (/^\d{2}:\d{2}–—$/.test(session)) return [];
    fail('Unknown session syntax');
  });
}

export function recordedMinutes(e) {
  return [...sessionMinutes(e.morning),...sessionMinutes(e.afternoon)].reduce((a,b)=>a+b,0);
}

export function shiftTotalMinutes(e,key) {
  return sessionMinutes(e[key]).reduce((a,b)=>a+b,0);
}

export function chartHours(minutes) {
  return Math.round(Number(minutes)/6)/10;
}

export function workdaysFromMinutes(minutes) {
  return Math.round((Number(minutes)/480)*100)/100;
}

export function formatRecordedMinutes(minutes) {
  const n=Number(minutes);
  return Math.floor(n/60)+'h'+String(n%60).padStart(2,'0');
}

export function formatWorkdays(minutes) {
  return workdaysFromMinutes(minutes).toFixed(2).replace('.',',')+' công';
}

export function validateDirectory(source,directory) {
  if (!directory || typeof directory!=='object') fail('Employee directory missing');
  for (const e of source.employees) {
    const u=directory[e.name];
    if (!u) fail('Directory user missing: '+e.name);
    if (!/^[0-9a-f-]{36}$/i.test(String(u.id||''))) fail('Invalid Entra id: '+e.name);
    if (u.displayName!==e.name) fail('Directory display name mismatch: '+e.name);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(u.userPrincipalName||''))) fail('Invalid UPN: '+e.name);
  }
  return directory;
}

export function validateSource(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.target_date||'')) fail('Missing report date');
  if (!/^\d{2}:\d{2}$/.test(s.updated||'')) fail('Missing source update time');
  const [yyyy,mm,dd]=s.target_date.split('-');
  if (!String(s.date_label).includes(dd+'/'+mm+'/'+yyyy)) fail('Date label mismatch');
  if (!Array.isArray(s.employees) || s.employees.length!==8 || s.kpis?.total!==8) fail('Exactly eight employees required');

  const names=new Set();
  for (const e of s.employees) {
    for (const key of ['name','morning','afternoon','total','status']) {
      if (typeof e[key]!=='string' || !e[key].trim()) fail('Missing employee '+key);
    }
    if (names.has(e.name)) fail('Duplicate employee');
    names.add(e.name);
    sessionMinutes(e.morning);
    sessionMinutes(e.afternoon);
    if (!['Đã ghi nhận','Chưa chốt','Cần đối soát','Chưa có bản ghi'].includes(e.status)) fail('Unknown status');
    if (e.total!=='Chưa chốt' && e.total!=='—' && durationMinutes(e.total)===null) fail('Invalid total');
    if (e.status==='Đã ghi nhận' && durationMinutes(e.total)===null) fail('Confirmed total missing');
  }

  const closed=s.employees.filter(e=>e.status==='Đã ghi nhận');
  const records=s.employees.filter(e=>e.morning!=='—' || e.afternoon!=='—');
  if (closed.length!==s.kpis.closed) fail('KPI/status mismatch');
  if (records.length!==s.kpis.with_record || s.rate!==String(records.length/8*100)+'%') fail('Record KPI mismatch');
  if (durationMinutes(s.total_hours)!==closed.reduce((n,e)=>n+durationMinutes(e.total),0)) fail('Confirmed hours mismatch');
  return s;
}

const text=(value,options={})=>({type:'TextBlock',text:value,wrap:true,spacing:'None',...options});
const inline=(value,options={})=>({type:'TextRun',text:value,...options});
const rich=(inlines,options={})=>({type:'RichTextBlock',inlines,spacing:'None',...options});
const displayStatus=e=>e.status==='Cần đối soát'?'Chưa chốt':e.status;
const statusColor=e=>displayStatus(e)==='Chưa chốt'?'Warning':displayStatus(e)==='Đã ghi nhận'?'Good':'Default';
const rowStyle=e=>displayStatus(e)==='Chưa chốt'?'warning':'default';
const chartFallback=()=>text('Thiết bị này chưa hỗ trợ chart native.',{size:'Small',isSubtle:true});

const sectionTitle=(iconName,label)=>({
  type:'ColumnSet',spacing:'Medium',columns:[
    {type:'Column',width:'28px',verticalContentAlignment:'Center',
      items:[{type:'Icon',name:iconName,size:'Small',color:'Accent',fallback:'drop'}]},
    {type:'Column',width:'stretch',verticalContentAlignment:'Center',
      items:[text(label,{size:'Medium',weight:'Bolder'})]}
  ]
});

const AVATAR_PNG = {
  "Điêu Văn Mạnh": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACgklEQVR42tWYv0vjYBjHv3kT7tqS0gvocbQHV2/Ru9lNBX/uHQQHHQQHhU6Ogjg46SIu/Q/USRwdDMVBnMRJuKOC1549h6NHa0iatkeS3hB8uWpsmzZJ03fKQ5L3+fB93p9fwOeN6baDxcVv9VbfHB5+ZTwFbAfKKVjGK7BOQUkv4Oz0x3gNZldN0mu4VnlIr+Fa5SN+gGuWl8DnjfhFvdfyEz/BWXH0T4n9ot5znv6bJL48bjUrbyIxgPn5QRprWh2qaqBQ+IubmzJEsQRJ0uj71dUoJiYiNN7Y+IF8vkbjkZEQNjc/0fj0tIijo9/OKJhKPWBlJYOdnZ+QZR2JxAB2dz9jeDj06j+zs0JDPDcnuFtiXa/j/r6Gvb08stkqeJ7F+vpHhMOs5fdjYxEEg2YaQeAwOhr2ZgwaBiCKRQAAz7OYnn6pTDZbRSBAMD5ulnxmRgDLMri7q3gzSXK5Kn22KvPZWZGWleMYTE29AwCIYskZwK2teMMESSZjODj4glDILGelYtB3PP+yq+trBaWShmj0LZaXPyAS4ZDP15DJqM4Abm/ncHxcaJgkS0vfoao6ANCxBQCKYlgMgzrSaVOtyUn76nVd4qGhIH2+vbVW5fz8EZpmrmKqauDyUvIGkGUZumQoik6Vet4kScPVlQwAuLh4RK1m2MrDPd0J2t2LWZZBLPYGCwvvEY8HIMs69vd/QZb1putnKvXQ0V2Fs/NDMhnD2lod5bK5k5yc/EE63biTuOYs+O0086QgccKecPMq2l/HLb+o+D8HcdKJcsNl6M8Tda9UtMpLOjF0vDSQSKeuk1fuVtsAbizk7QhAnOzMaThbCjqlpqsedaew3aj/DxHeEPav2x1MAAAAAElFTkSuQmCC",
  "Nguyễn Thị Thục Anh": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACfklEQVR42t2Y30tTYRjHP+d1c2vHraxZxjR3Zs4y7aJMISiI7oISicqyJt2E/Qkh/aKg2+66CrorFbqrLryLhFKicIURW9IEs3KaZtEP2bqYDdc2z3a2s511rg48z3mfD9+H5z3P84DBHynnE27djar6nD8pFRYwE6g8wUoFA9MIKooCl8V5UsHBslRTFB1OJY4oOpxKPGEIuFXiCgz+CMOolya+MBRcCo4SSrFR1PuHpwSLxJDtlkp67xxop6dRAWDkU5j2+0Nx25XWZi63NgPQMvCIV7PzcZvTamHK14FZxHQYDE5yfGhYXwXbNm6gU6nJyPdUQ10cDuCI28U6S7n+Kb7ethMhqfcZPq8bgIVfvwGwlAlO1G/RFzD84ydNlQ5ON9St6re90sHuqvUA3PS/JbT4PQFaN8AbL8YBuLqnhXKR/vMerxJ/vxd4z2AwBMDeaidb11boB3j7zTsC84u47TLnmupTHypJdHtjCvtnvzA+t8BAcDJuP7MCPu+AS5EIF0fHAOjbtQObyZTkc9C1iRrZBkB/IBSv/omv35YB3RnPGpqKpD8Q4uXMHNU2K2e3KWmL429BRXu7iPZ2odhlABS7zL7NVRnFMmkBjAJ9I34eHNqP02pJsFWYTXR6YtfQpVE/156/TrBPdB/GbZfxNSo8/vA5QwU1zK0PQ1M8mU4OcNRTi7yc9lT24ekZAI55alljKlOdVXL61V14OpY2vUuRKM8+hlMAxqAd5WY63K4spjqjdTNJCuawntBzFC2xdssoKq7gEPncROmxZSjRjrpYKqaIK7QsdAq5QBJat06FgEu8qHPYQOkBln2R5FvNDM/7z3bUWmFzUP8PMXXCE5pzmC0AAAAASUVORK5CYII=",
  "Vũ Đình Tuệ": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACFUlEQVR42tWYTUsbQRjHfzu1bVSCL6n4SostVoq9hFqpCtJbb/XmwW9QoT1VEHvzQ/gRxGvxUOihl/SFxFoFpaCghYJKKlmjWN0kza4HNWbVutkkuzN5TgM7zPOb/zPP7DMPKG5aqQuMjS5YTnOmZ55ovgIWAlUuWM0vsGJBhQw4N+tpfoO5VVPIhnPyI2TDOfkTKsBd51eguAlV1Puff6ES3FUclRNiVdS7yFN5SaJkueUU3jeTXXT3BDFNi3evV9hPZmzfXwy38HKkDYCUYXI74LzvqfGfxLcMx3lVhewiFtHp7gkihEZvfwOfPvyxfX862AiAcZRlYmyZTNoE4HG4jldvHwDwcS7O+9lNb0K8OL9LOmXaYM6s4141re0BAH5Ekzk4X89gyjBZmk8CcLezhua2wCX1AKKRhLwkiX7Wc+O+UyhNg97+k3FiJ8366oE8wNWVfZJ6xqZa16Mg9Y03c+pZlsRrxrIg9uVExVDTLe4/rLWFN5ansLR7MJZ3xgae3yHcVw/AxtpfduIp+YDbmwa/fx0C8GwoRHXNjdPzmcArE26fgtGInksQgH8Zi4Vvu569VVz/6r5/1clmz7NheXGPo8Os950F1aqZSwqW0p7w8ilaWeWWKirmc4hSmztedxkqs6KWpeJVfkUxDR2/4BxD7BfkdX4KBvDiIi9EAFHOxcoN50rBcqnpaY+6WNhS1D8GUhzY1x+VTfQAAAAASUVORK5CYII=",
  "Bùi Duy Hoàng": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABxklEQVR42tWYv0/CQBTHv3dAo0RNiNHFyUGZjPEH+gf4NxgTf4R/QBMX3Y2JS0f9AxyKiZubi3HQkeLkhEw6aGBQaQy1wNWBEEGB0qPXXi/p0Pb1vU+/7+7y7gGSDzKog/dd2E42iTP+OEQUlFewxC8wXlAaBJwbf8RvMLdq0qDhnOLQoOGc4lEZ4HrFpZB8UFnU6xafygTXiSM8KZZFvb884VskUpZbTumNb59DWU23PbOtL7BSAdWHS5g3KsBq/2wNNYX6s/7rJ61BWd5qvDuZQ/310REw6vaPDDWF+ksOytIm4mkNkal5kHgClatDiVJs27D0DGyzDACILaxLPgdJRBhglA+IQFncABkaAwBU9Qt5AEcPsm33rPSE77vTvmx9SbGhpvCxR1A+ToKVCqATMxjZvweJDXe1bV6WnvFvDrJiHlZWazgZn0Y0uSbhIiEtn0di4gB5zq10chbKyk5j1zGKqOVvhZxV+BcJq4GV32BlNZjXR7Arn2I7C7JVM00FqRftCZFH0XCVW7Ko2MpBB23uiO4yhLOiDkrFTnEpT0PHLzjHFPsF2StO3wAiNvJ+BKBeOvMazpWCXqkptEfNCzuI+j+lQaYQg4kcZgAAAABJRU5ErkJggg==",
  "Nguyễn Thành Long": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABnklEQVR42tWYzytEURTHv/eOUYaSSJSFzWxeJqQhjaSXlZ3sJLKg/AXSSyiSlYWFKZFY+QcsyOaZhZiFUEqTUqNBXrNjI89G8mO83+++8+7yvdP5fvqe7u2cAxA/zHWGFUU3jZleYmIBrUB5BMuEgTkE5YHA2cjHhIPZdJMHDmeiwwOHM9HjJOAMdDmIH07GvX/0OSm4EhwhKjEV937xhPCSkGy3LJR3e2AIYy3tAIDTQh5du+mvf/MpGXMpGQCQ2FrD1fPjj/jkzjqyD/fiHOxsbMJgXKJd4sXefnDGaAJqry+QausxIrXRBFw+UQEACz0yyiMReoCbF1nkihqaq2sw2ZqkB/imv2M2cwQAULr7EItG6V2SvetLnD8V0FBZhfFEBz1AHToU9RAAUFcR8xnQ4dy6f3uDTP7O11mlzG2OGfUAx8MThjFno1N/vsU3VpErajamOmrdzKeD3Iv1hJ+jaMjaLSoufuPgTncmorYMIe2og3KxhC63EywazrzEoiANdKwD+PGQWzCAe5nMazh7Dnrlpq87aqewLtz/AE3lhV3ptPwbAAAAAElFTkSuQmCC",
  "Trần Thanh Bình": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAB3UlEQVR42tWYu0vDcBDHv/m1tUWqUnRQUPpwEPGBnRWhdBBUKii66eagf4K6qrjVqSA4qJsO1goFXQQFcarWUnDqY9FB42CqVltaJx+Vtkma1y+/KQnJ3Yfv3YW7Ayg/jFQDy/bdIt87q+k5RlVAIVBywTJqgdUKSrSAE2OPURtMrJpEazg+P0RrOD5/hAa4an4JKD+EFvUq+Sc0wZXj0E+IaVHvP4/+ioTKdosvvEvXM6i3mXmNbXpDGF7sgXuqs+T551sez2kOseMULrbiKOSFZ5NRyEtr7v2f6y5vO2a3PQCA80AcpxuRit8FfGHcx1j0Tzgx7R9Ca7cNlqY6nKxH6AlxsQhEg0l8ZHIAgN4xO905SAziemSj4knOAH3jDpitJgBANJiiB3AhNFpyzyY5XO3c0RPigC+MFcce/J4jsCkOzc4GzB+MwGQx0JWDT8kXRIMJAICtwwrXYBt9RcIwv8VhMBJxgFLmViGnxdmIgUkXAOCVzSJx+SB4VlGlSAr5IjKP77g5TOBs8xZZLid+Lqatm/lWkMixnlByFNVXu0WLin85iNTljtJbBn121FqpWM4vqWWhoxYcb4jVgqzmRzCAEj9yIQIQOY3JDSdKQbnUVHRHXSusFPW/AOYztM1gM5c9AAAAAElFTkSuQmCC",
  "Lê Thị Phương Linh": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAA/klEQVR42mNgGOSAkVIDLD1X/yek5vj2UEa6OpAYR1HLsYz0chi5DmUaCMeRYh4jvR1GamgyDbTjCNnDNNCOI2Qf02BwHD57mRgGOWAaLKGHy36mweQ4bO4YOlE8WEIP3T1DL5MMyuYWsdFbU2TK4OUiz8DAwMCQlL+X4cbt9xSpGxYhOOrAUQeOOnDUgfRwICX9Vlr3VVjI1TxvojOGWFjKDoYnz76QpY5gr26wtWZgIchEjeEJWnZFh1YuHiyhiOwOJlJ6+fR23NAtqAcqFLHZy0SKYno7jmAU08uR+Owh2gG0KMiJCQAmahpGbceRFILUCk2ajlGT61hKQh8AsVd1YBxT2bcAAAAASUVORK5CYII=",
  "Lê Đăng Hiếu": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABE0lEQVR42u2YMQoCMRBFf4a9iiCidl5BrMRWLCw8gQew8gB2goWwoOBhtLS0FxHFG2hjIbJukt1kMpFNPcx//MmEzADCjyqdYb54amNmU8ULaALlCFaxgRUEpSBwFvkUO5ilmxQcTqNDweE0eiQCLkeXIPyQGPd+6JMouAyOiEosxb0vngibROR3y6C8ab+LcbsBAOisdzicL9Zx20EPo2YdANBabXC83uJ3sAL8e8DEZ/L9ZCgbMK+LqzvIC1hibvU9qySuLn9tmeJ0f3jcLEj7zbwdJBfrCZ+jaGRdLMXFDw6ymfK54SJ+qEO5mKFLNsHccPoSc0Hm6JgD+HjIDQwgl8lcw9k56MpNrzvqorAl3H8By5ZlXkEF6G0AAAAASUVORK5CYII="
};

function avatarImage(e,avatarUrls={}) {
  return {
    type:'Image',
    url:avatarUrls[e.name] || AVATAR_PNG[e.name],
    altText:'',
    style:'Person',
    size:'Small',
    height:'32px',
    horizontalAlignment:'Center'
  };
}

export function overviewStatusChart(s) {
  const closed=s.employees.filter(e=>displayStatus(e)==='Đã ghi nhận').length;
  const open=s.employees.length-closed;
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'overview-status-chart',
    title:'Tổng quan trạng thái',
    showTitle:false,
    showLegend:true,
    showBarValues:true,
    spacing:'Small',
    data:[{title:'Nhân sự',data:[
      {legend:'Đã chốt',value:closed,color:'categoricalBlue'},
      {legend:'Chưa chốt',value:open,color:'categoricalGreen'}
    ]}],
    fallback:chartFallback()
  };
}

export function consolidatedShiftChart(s) {
  return {
    type:'Chart.HorizontalBar.Stacked',
    id:'workforce-shift-chart',
    title:'\u200B',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'None',
    data:s.employees.map((e,i)=>{
      const morning=shiftTotalMinutes(e,'morning');
      const afternoon=shiftTotalMinutes(e,'afternoon');
      return {
        title:'\u200B'.repeat(i+1),
        data:[
          ...(morning>0?[{legend:'\u200B',value:chartHours(morning),color:'categoricalBlue'}]:[]),
          ...(afternoon>0?[{legend:'\u200C',value:chartHours(afternoon),color:'categoricalGreen'}]:[])
        ]
      };
    }),
    fallback:chartFallback()
  };
}

export function consolidatedWorkdayChart(s) {
  return {
    type:'Chart.HorizontalBar',
    id:'workforce-workdays-chart',
    title:'\u200B',
    showTitle:false,
    showLegend:false,
    showBarValues:true,
    displayMode:'AbsoluteNoAxis',
    spacing:'None',
    data:s.employees.map((e,i)=>({
      x:'\u200B'.repeat(i+1),
      y:workdaysFromMinutes(recordedMinutes(e)),
      color:i%2===0?'categoricalBlue':'categoricalTeal'
    })),
    fallback:chartFallback()
  };
}

function compactShift(value) {
  if (value==='—') return '—';
  return String(value).replace(/ \((\d+h\d{2})\)/g,' · $1');
}

export function employeeDetailPanel(e,i) {
  return {
    type:'Container',
    id:'employee-detail-'+(i+1),
    isVisible:false,
    style:rowStyle(e),
    roundedCorners:true,
    spacing:'Small',
    items:[
      rich([
        inline(String(i+1).padStart(2,'0')+' · '+e.name,{size:'Small',weight:'Bolder'}),
        inline('   '),
        inline(
          formatRecordedMinutes(recordedMinutes(e))+' · '+formatWorkdays(recordedMinutes(e))+' · '+displayStatus(e),
          {size:'Small',weight:'Bolder',color:statusColor(e)}
        )
      ]),
      rich([
        inline(compactShift(e.morning),{size:'Small',weight:'Bolder',color:'Accent'}),
        inline('    |    ',{size:'Small',isSubtle:true}),
        inline(compactShift(e.afternoon),{size:'Small',weight:'Bolder',color:'Good'})
      ],{spacing:'Small'})
    ]
  };
}

function detailTargets(source,index) {
  return source.employees.map((_,j)=>
    j===index ? 'employee-detail-'+(j+1) : {elementId:'employee-detail-'+(j+1),isVisible:false}
  );
}

export function avatarRail(s,directory,avatarUrls={}) {
  return {
    type:'Container',
    id:'avatar-rail',
    spacing:'None',
    items:s.employees.map((e,i)=>({
      type:'Container',
      id:'avatar-slot-'+(i+1),
      minHeight:'46px',
      verticalContentAlignment:'Center',
      spacing:'None',
      selectAction:{
        type:'Action.ToggleVisibility',
        targetElements:detailTargets(s,i)
      },
      items:[avatarImage(e,avatarUrls)]
    }))
  };
}

export function buildNativeCard(source,directory,avatarUrls={}) {
  const s=validateSource(source),k=s.kpis;
  validateDirectory(s,directory);

  const kpis=[
    {label:'Tổng nhân sự',value:k.total,color:'Accent',icon:'People'},
    {label:'Có dữ liệu',value:k.with_record,color:'Good',icon:'DataBarHorizontal'},
    {label:'Đã chốt',value:k.closed,color:'Good',icon:'CheckmarkCircle'},
    {label:'Chưa chốt',value:s.employees.filter(e=>displayStatus(e)!=='Đã ghi nhận').length,color:'Warning',icon:'Clock'}
  ];
  const kpiTile=({label,value,color,icon})=>({
    type:'Column',width:1,items:[{
      type:'Container',style:'default',roundedCorners:true,items:[
        {type:'ColumnSet',spacing:'None',columns:[
          {type:'Column',width:'auto',items:[{type:'Icon',name:icon,size:'Small',color,fallback:'drop'}]},
          {type:'Column',width:'stretch',items:[text(String(value),{
            size:'ExtraLarge',weight:'Bolder',color,horizontalAlignment:'Right'
          })]}
        ]},
        text(label,{size:'Small',weight:'Bolder'})
      ]
    }]
  });

  const morning=s.employees.flatMap(e=>sessionMinutes(e.morning)).reduce((a,b)=>a+b,0);
  const afternoon=s.employees.flatMap(e=>sessionMinutes(e.afternoon)).reduce((a,b)=>a+b,0);

  return {
    type:'AdaptiveCard',
    $schema:'https://adaptivecards.io/schemas/adaptive-card.json',
    version:'1.5',
    lang:'vi',
    msteams:{width:'Full'},
    body:[
      text('TEST · NATIVE V23 · GRAPH PROFILE PHOTO',{size:'Small',color:'Accent',weight:'Bolder'}),
      text('BÁO CÁO CHẤM CÔNG — CẢ NGÀY',{size:'Large',weight:'Bolder',spacing:'Small'}),
      text(s.date_label+' · Cập nhật '+s.updated,{size:'Small',isSubtle:true,spacing:'Small'}),

      {
        type:'Container',
        id:'overview',
        style:'emphasis',
        roundedCorners:true,
        spacing:'Small',
        items:[
          sectionTitle('Gauge','TỔNG QUAN'),
          overviewStatusChart(s),
          {type:'ColumnSet',spacing:'Small',columns:kpis.slice(0,2).map(kpiTile)},
          {type:'ColumnSet',spacing:'Small',columns:kpis.slice(2).map(kpiTile)},
          rich([
            inline(s.total_hours,{weight:'Bolder',color:'Good'}),
            inline(' giờ xác nhận  ·  '),
            inline(formatWorkdays(durationMinutes(s.total_hours)),{weight:'Bolder',color:'Accent'}),
            inline('  ·  Sáng '+workdaysFromMinutes(morning).toFixed(2).replace('.',',')+
              ' công  ·  Chiều '+workdaysFromMinutes(afternoon).toFixed(2).replace('.',',')+
              ' công  ·  '+s.rate,{size:'Small'})
          ],{spacing:'Small'})
        ]
      },

      sectionTitle('DataBarHorizontal','NHÂN SỰ THEO CÔNG / GIỜ'),
      {
        type:'ActionSet',
        id:'chart-view-toggle',
        spacing:'Small',
        actions:[
          {
            type:'Action.ToggleVisibility',
            title:'Theo ca',
            style:'positive',
            targetElements:[
              {elementId:'shift-chart-container',isVisible:true},
              {elementId:'workday-chart-container',isVisible:false}
            ]
          },
          {
            type:'Action.ToggleVisibility',
            title:'Công quy đổi',
            targetElements:[
              {elementId:'shift-chart-container',isVisible:false},
              {elementId:'workday-chart-container',isVisible:true}
            ]
          }
        ]
      },
      {
        type:'ColumnSet',
        id:'compact-chart-grid',
        spacing:'Small',
        columns:[
          {
            type:'Column',
            width:'38px',
            items:[avatarRail(s,directory,avatarUrls)]
          },
          {
            type:'Column',
            width:'stretch',
            items:[
              {
                type:'Container',
                id:'shift-chart-container',
                isVisible:true,
                spacing:'None',
                items:[consolidatedShiftChart(s)]
              },
              {
                type:'Container',
                id:'workday-chart-container',
                isVisible:false,
                spacing:'None',
                items:[consolidatedWorkdayChart(s)]
              }
            ]
          }
        ]
      },
      {
        type:'Container',
        id:'shift-legend',
        spacing:'Small',
        items:[
          rich([
            inline('■ ',{color:'Accent',weight:'Bolder'}),
            inline('Ca sáng',{size:'Small',weight:'Bolder'}),
            inline('    ·    ',{size:'Small',isSubtle:true}),
            inline('■ ',{color:'Good',weight:'Bolder'}),
            inline('Ca chiều',{size:'Small',weight:'Bolder'})
          ],{horizontalAlignment:'Center'})
        ]
      },
      {
        type:'Container',
        id:'details-area',
        spacing:'Small',
        items:s.employees.map(employeeDetailPanel)
      }
    ]
  };
}

export function auditCard(card,source,directory,avatarUrls={}) {
  validateSource(source);
  validateDirectory(source,directory);
  const json=JSON.stringify(card);
  if (Buffer.byteLength(json)>27000) fail('Card payload budget exceeded');

  const ids=new Set(),types=[];
  const walk=v=>{
    if (typeof v==='function' || typeof v==='undefined') fail('Not pure JSON');
    if (!v || typeof v!=='object') return;
    if (v.type) types.push(v.type);
    if (v.type && v.id) {
      if (ids.has(v.id)) fail('Duplicate element id');
      ids.add(v.id);
    }
    if (['TabSet','Accordion','Chart.VerticalBar','Chart.VerticalBar.Grouped'].includes(v.type)) {
      fail('External or nonmobile visual forbidden');
    }
    if (v.type==='Image') {
      if (typeof v.url!=='string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v.url)) {
        fail('Only embedded PNG/JPEG avatars allowed');
      }
    } else if ('url' in v || 'backgroundImage' in v) {
      fail('No external resources');
    }
    for (const value of Object.values(v)) walk(value);
  };
  walk(card);

  if (json!==JSON.stringify(buildNativeCard(source,directory,avatarUrls))) fail('Layout/data mismatch');

  return {
    layout_version:LAYOUT,
    source_kind:'design_test_fixture',
    target_date:source.target_date,
    source_data_sha256:sourceDigest(source),
    card_sha256:digest(json),
    bytes:Buffer.byteLength(json),
    employee_count:source.employees.length,
    kpi_count:4,
    chart_count:types.filter(t=>t.startsWith('Chart.')).length,
    persona_component_count:types.filter(t=>t==='Component').length,
    image_avatar_count:types.filter(t=>t==='Image').length,
    data_gate:'passed',
    chart_architecture:'single_consolidated_chart',
    shift_chart_count:1,
    workday_chart_count:1,
    avatar_rail_count:source.employees.length,
    detail_interaction:'avatar_tap_toggle',
    detail_buttons:0,
    details_hidden_by_default:true,
    footer_notes:false,
    repeated_legends:false,
    palette:'categoricalBlue_categoricalGreen',
    shift_legend:'Ca sáng | Ca chiều',
    native_microsoft_charts_only:true,
    native_microsoft_personas:false,
    avatar_render:Object.keys(avatarUrls).length ? 'graph_profile_photo' : 'embedded_png_fallback',
    graph_avatar_count:source.employees.filter(e=>Boolean(avatarUrls[e.name])).length,
    external_chart_requests:0,
    image_generation:false,
    render_qa:'pending_real_teams_client'
  };
}
