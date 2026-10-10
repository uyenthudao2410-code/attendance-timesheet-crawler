import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../src/attendance-native-card.mjs';
import {
  adaptiveCardsInMessage,isSameAttendancePublication,
  findDuplicateAttendanceMessage,verifyTeamsAdaptiveMessage
} from '../src/attendance-teams-card-proof.mjs';

const source={
  report_title:'BÁO CÁO CHẤM CÔNG — CẢ NGÀY',
  date_label:'Thứ Sáu, 09/10/2026',
  employees:Array.from({length:8},(_,i)=>({name:'Nhân sự '+(i+1)}))
};
function sample(){
  const card={type:'AdaptiveCard',version:'1.5',body:[
    {type:'TextBlock',text:source.report_title},
    {type:'TextBlock',text:source.date_label},
    {type:'Container',id:'daily-details-content',items:source.employees.map(e=>({type:'TextBlock',text:e.name}))}
  ]};
  return {
    card,
    message:{id:'1791590300123',attachments:[
      {contentType:'application/vnd.microsoft.card.adaptive',content:JSON.stringify(card)}
    ]}
  };
}

test('read-back verification requires exact Teams message id and canonical Adaptive Card SHA',()=>{
  const {card,message}=sample();
  const sha=digest(JSON.stringify(card));
  const proof=verifyTeamsAdaptiveMessage(message,message.id,sha,source,'daily_2105');
  assert.equal(proof.message_id,message.id);
  assert.equal(proof.verified_card_sha256,sha);
  assert.ok(Date.parse(proof.teams_verified_at)>0);
  assert.throws(()=>verifyTeamsAdaptiveMessage(message,'1791590300999',sha,source,'daily_2105'),/MESSAGE_ID_MISMATCH/);
  assert.throws(()=>verifyTeamsAdaptiveMessage(message,message.id,'0'.repeat(64),source,'daily_2105'),/HASH_MISMATCH/);
});

test('official-chat duplicate scanner detects same slot and date, not another date',()=>{
  const {message,card}=sample();
  assert.equal(adaptiveCardsInMessage(message).length,1);
  assert.equal(isSameAttendancePublication(card,source,'daily_2105'),true);
  assert.equal(findDuplicateAttendanceMessage([message],source,'daily_2105'),message.id);
  assert.equal(findDuplicateAttendanceMessage([message],{...source,date_label:'08/10/2026'},'daily_2105'),'');
  assert.equal(findDuplicateAttendanceMessage([message],source,'morning_1230'),'');
});

test('missing or malformed card cannot be counted as publication proof',()=>{
  const {message,card}=sample();
  const sha=digest(JSON.stringify(card));
  for(const bad of [
    {id:message.id,attachments:[]},
    {id:message.id,attachments:[{contentType:'image/png'}]},
    {id:message.id,attachments:[{contentType:'application/vnd.microsoft.card.adaptive',content:'not-json'}]}
  ]){
    assert.equal(adaptiveCardsInMessage(bad).length,0);
    assert.throws(()=>verifyTeamsAdaptiveMessage(bad,message.id,sha,source,'daily_2105'),/NOT_FOUND/);
  }
});
