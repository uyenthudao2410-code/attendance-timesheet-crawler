import fs from "node:fs/promises";
import path from "node:path";
import { validateAiVisualRequest } from "../src/attendance-ai-visual.mjs";

const slot=String(process.env.ATTENDANCE_RUN_SLOT||"").trim();
const date=String(process.env.TARGET_DATE||"").trim();
const report=JSON.parse(await fs.readFile(path.join("output",`report-${slot}-${date}.json`),"utf8"));
const request=JSON.parse(await fs.readFile(path.join("output",`ai-visual-request-${slot}-${date}.json`),"utf8"));
validateAiVisualRequest(request,report);
console.log(`AI visual request validation passed: slot=${slot} date=${date} employees=${request.data.employees.length}`);
