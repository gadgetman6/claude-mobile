import { $ } from "bun";

export async function getGitStatus(cwd: string) {
  try {
    const [status, diff, branch] = await Promise.all([
      $`git -C ${cwd} status --porcelain`.text().catch(() => ""),
      $`git -C ${cwd} diff --stat`.text().catch(() => ""),
      $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.text().catch(() => "unknown"),
    ]);

    return {
      status: status.trim(),
      diff: diff.trim(),
      branch: branch.trim(),
    };
  } catch {
    return {
      status: "",
      diff: "",
      branch: "not a git repo",
    };
  }
}
