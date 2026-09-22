import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testFiles } from "./test-groups.mjs";

const [group = "all", flag] = process.argv.slice(2);
try {
  if (flag && flag !== "--list") throw new Error(`不支持的参数：${flag}`);
  if (process.argv.length > 4) throw new Error("参数过多");
  const files = testFiles(group);
  if (flag === "--list") console.log(files.join("\n"));
  else {
    console.log(`运行 ${group}：${files.length} 个测试文件，并发 2`);
    const child = spawn(process.execPath, ["--test", "--test-concurrency=2", ...files], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: "inherit",
    });
    child.on("error", (error) => {
      console.error(error);
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      process.exitCode = signal ? 1 : (code ?? 1);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
