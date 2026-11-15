import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = path => readFileSync(path,"utf8");
const protocol = readFileSync("worker/protocol.json");
const plans = read("worker/session_plans.json");
const hash = data => createHash("sha256").update(data).digest("hex");
if (hash(plans) !== JSON.parse(protocol).plans_sha256) throw Error("Kontrolní součet plánů nesouhlasí.");
const digest = read("worker/export-digest.txt").trim();
if (!/^[a-f0-9]{64}$/.test(digest)) throw Error("Chybí otisk exportního klíče.");
const code = read("worker/index.mjs").replace("__STUDY_PLANS__", () => JSON.stringify(JSON.parse(plans)))
  .replace("__PROTOCOL_HASH__", hash(protocol)).replace("__EXPORT_DIGEST__", digest);
mkdirSync("dist/server",{recursive:true});
mkdirSync("dist/.openai",{recursive:true});
writeFileSync("dist/server/index.js",code);
copyFileSync(".openai/hosting.json","dist/.openai/hosting.json");
