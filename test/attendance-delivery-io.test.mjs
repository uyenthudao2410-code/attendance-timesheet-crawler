import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from '../src/attendance-delivery-io.mjs';

const fakeResponse=(status)=>({
  status,ok:status>=200&&status<300,
  headers:{get:()=>null},
  async arrayBuffer(){return new ArrayBuffer(0);}
});

test('unsafe Teams message POST is never retried on HTTP 429',async()=>{
  let attempts=0;
  const result=await request('https://graph.microsoft.com/v1.0/chats/test/messages',
    {method:'POST',body:'{}'},{
      fetchImpl:async()=>{attempts+=1;return fakeResponse(attempts===1?429:200);},
      sleep:async()=>{throw new Error('Unsafe request attempted retry');}
    });
  assert.equal(result.status,429);
  assert.equal(attempts,1);
});

test('unsafe ledger PUT is never retried after throttling',async()=>{
  let attempts=0;
  const result=await request('https://api.github.com/repos/example/example/contents/ledger',
    {method:'PUT',body:'{}'},{
      fetchImpl:async()=>{attempts+=1;return fakeResponse(429);},
      sleep:async()=>{throw new Error('Unsafe PUT retry');}
    });
  assert.equal(result.status,429);
  assert.equal(attempts,1);
});

test('retrySafe read may retry HTTP 429 with a bounded call count',async()=>{
  let attempts=0;
  const result=await request('https://graph.microsoft.com/v1.0/me',
    {method:'GET'},{
      retrySafe:true,
      fetchImpl:async()=>{attempts+=1;return fakeResponse(attempts===1?429:200);},
      sleep:async()=>{}
    });
  assert.equal(result.status,200);
  assert.equal(attempts,2);
});

test('unsafe POST network failure is fail-closed without automatic resend',async()=>{
  let attempts=0;
  await assert.rejects(()=>request('https://graph.microsoft.com/v1.0/chats/test/messages',
    {method:'POST'},{
      fetchImpl:async()=>{attempts+=1;throw new Error('temporary network error');},
      sleep:async()=>{throw new Error('Unsafe retry');}
    }),/NETWORK_REQUEST_FAILED/);
  assert.equal(attempts,1);
});
