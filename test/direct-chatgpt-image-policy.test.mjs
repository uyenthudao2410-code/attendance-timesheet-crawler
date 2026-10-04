import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const forbiddenFiles=[
  "scripts/render-report-image.mjs",
  "src/attendance-image.mjs",
  "config/attendance-image-layout.json",
  "assets/attendance-v5/morning-master.svg",
  "assets/attendance-v5/daily-master.svg",
];

test("legacy attendance renderers stay removed",()=>{
  for(const path of forbiddenFiles){
    assert.equal(fs.existsSync(path),false,`legacy renderer asset must not exist: ${path}`);
  }
});

test("attendance AI post workflow has no render or overlay step",()=>{
  const workflow=fs.readFileSync(".github/workflows/attendance-ai-post.yml","utf8");
  for(const forbidden of [
    "render-report-image",
    "attendance-image",
    "master.svg",
    "playwright",
    "sharp",
    "canvas",
    "overlay",
    "composite",
  ]){
    assert.equal(workflow.toLowerCase().includes(forbidden.toLowerCase()),false,`forbidden publication fallback in workflow: ${forbidden}`);
  }
  assert.match(workflow,/post-external-image-to-teams\.mjs/);
});

test("publisher script validates direct ChatGPT provenance before Teams post",()=>{
  const source=fs.readFileSync("scripts/post-external-image-to-teams.mjs","utf8");
  assert.match(source,/validateChatGptDirectImageTrigger/);
  assert.doesNotMatch(source,/render-report-image|attendance-image|sharp|canvas|overlay|composite/i);
});
