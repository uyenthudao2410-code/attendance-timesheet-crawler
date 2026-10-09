// Fail closed on missing/unverified attendance evidence before publishing V24.
// A technical source outage is never equivalent to an employee being absent.
const SLOTS=new Set(['daily_2105','morning_1230']);
const TERMINAL=new Set(['complete','incomplete','review_required','date_not_found']);
const CLOCK=/^(?:[01]?\d|2[0-3]):[0-5]\d$/;
const TZ='Asia/Ho_Chi_Minh';
const MORNING_CUTOFF_MINUTES=12*60+45;

function validMark(value){return typeof value==='string' && CLOCK.test(value);}
function hasMark(session){return Boolean(session && (validMark(session.in)||validMark(session.out)));}
function sessionsFor(employee){
  const explicit=Array.isArray(employee?.sessions)?employee.sessions:[];
  return explicit.length?explicit:[employee?.morning,employee?.afternoon].filter(Boolean);
}
function morningMark(employee){
  if(hasMark(employee?.morning))return true;
  return sessionsFor(employee).some(session=>{
    const time=validMark(session?.in)?session.in:session?.out;
    if(!validMark(time))return false;
    const [h,m]=time.split(':').map(Number);
    return h*60+m<MORNING_CUTOFF_MINUTES;
  });
}

export function assessAttendanceSourceReadiness(raw,{slot,targetDate,expectedCount=8}={}){
  if(!SLOTS.has(slot))throw new Error('SOURCE_SLOT_INVALID');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOURCE_TARGET_DATE_INVALID');
  if(raw?.schema_version!==5||raw?.date!==targetDate||raw?.timezone!==TZ){
    throw new Error('SOURCE_IDENTITY_MISMATCH');
  }
  if(!Array.isArray(raw.employees)||raw.employees.length!==expectedCount){
    throw new Error('SOURCE_ROSTER_COUNT_MISMATCH');
  }

  const counters={roster:expectedCount,recorded:0,morning_recorded:0,verified_absent:0,
    technical:0,unverified_absent:0,missing_marks:0,invalid_status:0};
  const problems=[];
  raw.employees.forEach((employee,index)=>{
    const no=index+1;
    if(!employee||employee.access_ok===false||employee.status==='technical_error'){
      counters.technical+=1;problems.push('technical:'+no);return;
    }
    if(!TERMINAL.has(employee.status)){
      counters.invalid_status+=1;problems.push('status:'+no);return;
    }
    if(employee.status==='date_not_found'){
      const history=employee.device_history;
      const verified=Number.isInteger(history?.history_record_count)
        && history.history_record_count>0
        && history.target_date_present===false;
      if(verified)counters.verified_absent+=1;
      else{counters.unverified_absent+=1;problems.push('unverified_absence:'+no);}
      return;
    }
    if(!sessionsFor(employee).some(hasMark)){
      counters.missing_marks+=1;problems.push('missing_punch_evidence:'+no);return;
    }
    counters.recorded+=1;
    if(morningMark(employee))counters.morning_recorded+=1;
  });

  if(counters.recorded===0)problems.push('no_verified_target_date_punches');
  if(slot==='morning_1230'&&counters.morning_recorded===0){
    problems.push('no_verified_morning_punches');
  }
  return {
    ok:problems.length===0,
    slot,target_date:targetDate,
    ...counters,
    problem_codes:problems,
  };
}

export function assertAttendanceSourceReady(raw,options){
  const result=assessAttendanceSourceReadiness(raw,options);
  if(!result.ok){
    throw new Error('ATTENDANCE_SOURCE_NOT_READY '+[
      'slot='+result.slot,'date='+result.target_date,
      'recorded='+result.recorded,'morning='+result.morning_recorded,
      'verified_absent='+result.verified_absent,
      'technical='+result.technical,'unverified_absent='+result.unverified_absent,
      'missing_marks='+result.missing_marks,'issues='+result.problem_codes.join(',')
    ].join(' '));
  }
  return result;
}
