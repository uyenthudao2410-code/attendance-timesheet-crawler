import {digest} from './attendance-native-card.mjs';

// Microsoft Graph may serialize attachment.content as JSON text or as an object.
export function adaptiveCardsInMessage(message){
  if(!Array.isArray(message?.attachments))return [];
  return message.attachments
    .filter(a=>a?.contentType==='application/vnd.microsoft.card.adaptive')
    .flatMap(a=>{
      try {
        const parsed=typeof a.content==='string'?JSON.parse(a.content):a.content;
        const card=typeof parsed==='string'?JSON.parse(parsed):parsed;
        return card?.type==='AdaptiveCard'?[card]:[];
      } catch{return [];}
    });
}

export function isSameAttendancePublication(card,source,slot){
  if(card?.type!=='AdaptiveCard'||!Array.isArray(card.body))return false;
  if(!['daily_2105','morning_1230'].includes(slot))return false;
  const body=JSON.stringify(card.body);
  if(!body.includes(source.report_title)||!body.includes(source.date_label))return false;
  const expectedId=slot==='daily_2105'?'daily-details-content':'morning-details-content';
  if(!body.includes('"id":"'+expectedId+'"'))return false;
  return source.employees.length===8&&source.employees.every(e=>body.includes(e.name));
}

export function findDuplicateAttendanceMessage(messages,source,slot){
  for(const message of messages||[]){
    for(const card of adaptiveCardsInMessage(message)){
      if(isSameAttendancePublication(card,source,slot)){
        return String(message.id||message.message_id||'');
      }
    }
  }
  return '';
}

export function verifyTeamsAdaptiveMessage(message,expectedMessageId,cardSha256,source,slot){
  const id=String(message?.id||'');
  if(!/^\\d+$/.test(id)||id!==String(expectedMessageId))
    throw new Error('TEAMS_PROOF_MESSAGE_ID_MISMATCH');
  const cards=adaptiveCardsInMessage(message);
  if(cards.length!==1||!isSameAttendancePublication(cards[0],source,slot))
    throw new Error('TEAMS_PROOF_EXPECTED_ADAPTIVE_CARD_NOT_FOUND');
  if(digest(JSON.stringify(cards[0]))!==cardSha256)
    throw new Error('TEAMS_PROOF_CARD_HASH_MISMATCH');
  return {message_id:id,verified_card_sha256:cardSha256,teams_verified_at:new Date().toISOString()};
}
