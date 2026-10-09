import fs from 'node:fs/promises';
import path from 'node:path';
import {assertAttendanceSourceReady} from '../src/attendance-source-readiness.mjs';

const slot=String(process.env.ATTENDANCE_RUN_SLOT||'');
const targetDate=String(process.env.TARGET_DATE||'');
if(!['daily_2105','morning_1230'].includes(slot))throw new Error('SOURCE_SLOT_INVALID');
if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))throw new Error('SOURCE_DATE_INVALID');
const file=path.join('output','attendance-'+targetDate+'.json');
const source=JSON.parse(await fs.readFile(file,'utf8'));
const result=assertAttendanceSourceReady(source,{slot,targetDate,expectedCount:8});
console.log('ATTENDANCE_SOURCE_READY=PASS slot='+slot+' target_date='+targetDate+
  ' recorded='+result.recorded+' morning_recorded='+result.morning_recorded+
  ' verified_absent='+result.verified_absent+' employee_count='+result.roster);
