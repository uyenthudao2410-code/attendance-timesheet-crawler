import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAttendanceTeamsTarget,attendanceReceiptMatchesTarget
} from '../src/attendance-teams-target.mjs';

const TEST='19:0e02d613cded448892f27d74cff19d63@thread.v2';
const CHANNEL='19:production-channel@thread.tacv2';
const TEAM='00000000-0000-4000-8000-000000000010';
const CHAT='19:new-production-chat@thread.v2';

test('preview stays in TEST, even if production channel variables exist',()=>{
  const target=resolveAttendanceTeamsTarget({
    ATTENDANCE_TEAMS_TARGET_TYPE:'channel',
    ATTENDANCE_TEAMS_TEAM_ID:TEAM,
    ATTENDANCE_TEAMS_CHANNEL_ID:CHANNEL
  },true,TEST);
  assert.equal(target.type,'chat');
  assert.equal(target.chat_id,TEST);
  assert.ok(target.endpoint.startsWith('/chats/'));
});

test('production accepts explicit GitHub variable chat routing, never TEST',()=>{
  const target=resolveAttendanceTeamsTarget({TEAMS_CHAT_ID:CHAT},false,TEST);
  assert.equal(target.type,'chat');
  assert.equal(target.permission,'ChatMessage.Send');
  assert.equal(target.chat_id,CHAT);
  assert.ok(target.endpoint.includes('new-production-chat'));
  assert.throws(()=>resolveAttendanceTeamsTarget({TEAMS_CHAT_ID:TEST},false,TEST),
    /ATTENDANCE_PRODUCTION_TEST_CHAT_FORBIDDEN/);
});

test('production accepts native Teams channel, requires team ID and channel permission',()=>{
  const target=resolveAttendanceTeamsTarget({
    TEAMS_TARGET_TYPE:'channel',TEAMS_TEAM_ID:TEAM,TEAMS_CHANNEL_ID:CHANNEL
  },false,TEST);
  assert.deepEqual({type:target.type,team:target.team_id,channel:target.channel_id,scope:target.permission},
    {type:'channel',team:TEAM,channel:CHANNEL,scope:'ChannelMessage.Send'});
  assert.ok(target.endpoint.startsWith('/teams/'));
  assert.ok(target.endpoint.endsWith('/messages'));
  assert.throws(()=>resolveAttendanceTeamsTarget({
    TEAMS_TARGET_TYPE:'channel',TEAMS_CHANNEL_ID:CHANNEL
  },false,TEST),/ATTENDANCE_PRODUCTION_TEAM_ID_MISSING/);
});

test('missing or ambiguous production configuration fails closed',()=>{
  for(const vars of [{},{TEAMS_TARGET_TYPE:'bogus'},{TEAMS_CHAT_ID:CHAT,TEAMS_TEAM_ID:TEAM,TEAMS_CHANNEL_ID:CHANNEL}]){
    assert.throws(()=>resolveAttendanceTeamsTarget(vars,false,TEST));
  }
  assert.throws(()=>resolveAttendanceTeamsTarget({
    TEAMS_TARGET_TYPE:'chat',TEAMS_TARGET_ID:TEST
  },false,TEST),/ATTENDANCE_PRODUCTION_TEST_CHAT_FORBIDDEN/);
});

test('previous sent receipt cannot be silently replayed to another target',()=>{
  const channel=resolveAttendanceTeamsTarget({
    TEAMS_TARGET_TYPE:'channel',TEAMS_TEAM_ID:TEAM,TEAMS_CHANNEL_ID:CHANNEL
  },false,TEST);
  const chat=resolveAttendanceTeamsTarget({TEAMS_CHAT_ID:CHAT},false,TEST);
  assert.equal(attendanceReceiptMatchesTarget({target_chat_id:CHAT},chat),true);
  assert.equal(attendanceReceiptMatchesTarget({target_chat_id:TEST},chat),false);
  assert.equal(attendanceReceiptMatchesTarget({target_chat_id:TEST},channel),false);
  assert.equal(attendanceReceiptMatchesTarget({target_type:'channel',target_team_id:TEAM,target_channel_id:CHANNEL},channel),true);
  assert.equal(attendanceReceiptMatchesTarget({target_type:'channel',target_team_id:TEAM,target_channel_id:CHANNEL+'bad'},channel),false);
});
