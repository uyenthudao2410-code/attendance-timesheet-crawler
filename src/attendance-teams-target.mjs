// Resolve the actual production destination explicitly from GitHub Actions.
// Preview is the ONLY operation permitted to target the immutable TEST chat.
// Never accept an unset value as an instruction to fall back to TEST.
const required=(name,value)=>{
  const text=String(value??'').trim();
  if(!text)throw new Error(name);
  return text;
};

const get=(env,...keys)=>{
  for(const key of keys){
    const value=String(env[key]??'').trim();
    if(value)return value;
  }
  return '';
};

const cleanId=(value,label)=>{
  const id=required(label,value);
  if(id.length>1024||/[\s\u0000-\u001f]/.test(id))throw new Error(label+'_INVALID');
  return id;
};

export function resolveAttendanceTeamsTarget(env,preview,testChatId){
  const testId=cleanId(testChatId,'ATTENDANCE_TEST_CHAT_ID');
  if(preview)return {
    type:'chat',chat_id:testId,
    endpoint:'/chats/'+encodeURIComponent(testId)+'/messages',
    permission:'ChatMessage.Send',is_preview:true
  };
  const selected=get(env,'ATTENDANCE_TEAMS_TARGET_TYPE','TEAMS_TARGET_TYPE').toLowerCase();
  const chat=get(env,'ATTENDANCE_TEAMS_CHAT_ID','TEAMS_CHAT_ID');
  const team=get(env,'ATTENDANCE_TEAMS_TEAM_ID','TEAMS_TEAM_ID','TEAMS_GROUP_ID');
  const channel=get(env,'ATTENDANCE_TEAMS_CHANNEL_ID','TEAMS_CHANNEL_ID');
  const common=get(env,'ATTENDANCE_TEAMS_TARGET_ID','TEAMS_TARGET_ID');
  let type=selected;
  if(!type){
    if(chat && !channel && !team)type='chat';
    else if(channel && team && !chat)type='channel';
    else throw new Error('ATTENDANCE_PRODUCTION_TEAMS_TARGET_TYPE_REQUIRED');
  }
  if(type==='chat'){
    const chatId=cleanId(chat||common,'ATTENDANCE_PRODUCTION_CHAT_ID_MISSING');
    if(chatId===testId)throw new Error('ATTENDANCE_PRODUCTION_TEST_CHAT_FORBIDDEN');
    return {
      type,chat_id:chatId,
      endpoint:'/chats/'+encodeURIComponent(chatId)+'/messages',
      permission:'ChatMessage.Send',is_preview:false
    };
  }
  if(type==='channel'){
    const teamId=cleanId(team,'ATTENDANCE_PRODUCTION_TEAM_ID_MISSING');
    const channelId=cleanId(channel||common,'ATTENDANCE_PRODUCTION_CHANNEL_ID_MISSING');
    if(channelId===testId)throw new Error('ATTENDANCE_PRODUCTION_TEST_CHAT_FORBIDDEN');
    return {
      type,team_id:teamId,channel_id:channelId,
      endpoint:'/teams/'+encodeURIComponent(teamId)+'/channels/'+encodeURIComponent(channelId)+'/messages',
      permission:'ChannelMessage.Send',is_preview:false
    };
  }
  throw new Error('ATTENDANCE_PRODUCTION_TARGET_TYPE_INVALID');
}

export function attendanceReceiptMatchesTarget(receipt,target){
  if(!receipt || !target)return false;
  const stated=String(receipt.target_type||'').trim();
  if(stated && stated!==target.type)return false;
  if(target.type==='chat')
    return String(receipt.target_chat_id||'')===target.chat_id;
  return String(receipt.target_team_id||'')===target.team_id &&
    String(receipt.target_channel_id||'')===target.channel_id;
}
