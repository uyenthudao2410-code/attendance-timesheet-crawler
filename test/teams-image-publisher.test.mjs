import test from "node:test";
import assert from "node:assert/strict";
import {buildTeamsHostedImagePayload,formatVietnameseDate} from "../src/teams-image-publisher.mjs";
const report={kind:"attendance_business_report",slot:"morning_1230",date:"2026-10-02"};
test("Vietnamese date is stable",()=>assert.equal(formatVietnameseDate("2026-10-02"),"Thứ Sáu, 02/10/2026"));
test("V3 TEST payload carries exactly two native images",()=>{const p=buildTeamsHostedImagePayload({report,imageBase64s:["YQ==","Yg=="],mode:"TEST"});assert.match(p.body.content,/\[TEST\] BÁO CÁO CHẤM CÔNG — CA SÁNG/);assert.match(p.body.content,/hostedContents\/1\/\$value/);assert.match(p.body.content,/hostedContents\/2\/\$value/);assert.equal(p.hostedContents.length,2);assert.equal(p.hostedContents[1]["@microsoft.graph.temporaryId"],"2");});
test("V3 production caption has no test marker",()=>{const p=buildTeamsHostedImagePayload({report:{...report,slot:"daily_2105",date:"2026-10-01"},imageBase64s:["YQ==","Yg=="],mode:"PRODUCTION"});assert.match(p.body.content,/BÁO CÁO CHẤM CÔNG — CẢ NGÀY/);assert.doesNotMatch(p.body.content,/\[TEST\]/);});
test("V3 rejects one-image delivery",()=>assert.throws(()=>buildTeamsHostedImagePayload({report,imageBase64s:["YQ=="],mode:"TEST"}),/exactly two images/));
