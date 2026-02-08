import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 10000 });
    return stdout;
  } catch {
    return "";
  }
}

export async function getGitStatus(cwd: string) {
  try {
    const [status, diff, branch] = await Promise.all([
      run("git", ["-C", cwd, "status", "--porcelain"], cwd),
      run("git", ["-C", cwd, "diff", "--stat"], cwd),
      run("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], cwd),
    ]);

    return {
      status: status.trim(),
      diff: diff.trim(),
      branch: branch.trim() || "unknown",
    };
  } catch {
    return {
      status: "",
      diff: "",
      branch: "not a git repo",
    };
  }
}
