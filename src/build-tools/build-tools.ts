import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";

export type Commands = { [key: string]: [() => Promise<void>, string] };

export async function main(commands: Commands) {
    const args = process.argv.splice(2);

    if (args.length == 0) {
        const maxCmdLen = Math.max(...Object.keys(commands).map((cmd) => cmd.length)) + 1;
        console.log("Available commands:");
        for (const [cmd, [_, desc]] of Object.entries(commands)) {
            console.log(`  ${(cmd + ":").padEnd(maxCmdLen)} ${desc}`)
        }
        return;
    }

    for (const cmd of args) {
        const command = commands[cmd];
        if (command == undefined) {
            throw new Error(`Command not found: ${cmd}`);
        }
        await command[0]();
    }
}

export interface Task {
    runMessage: string;
    skipMessage: string;
    targets: string[];
    sources: string[];
    run: () => Promise<void>;
}

export async function runTask(task: Task) {
    let run = task.targets.length == 0;

    upToDateCheck:
        for (const target of task.targets) {
            let targetInfo;
            try {
                targetInfo = fs.statSync(target);
            } catch (error) {
                if (error instanceof Error && "code" in error && error.code == "ENOENT") {
                    run = true;
                    break;
                }
                throw error;
            }

            let targetModifiedMs = targetInfo.mtimeMs;

            if (targetInfo.isDirectory()) {
                const targets = fs.readdirSync(target, {recursive: true, withFileTypes: true});
                for (const target of targets) {
                    if (target.isDirectory()) continue;
                    const targetInfo = fs.statSync(path.join(target.parentPath, target.name))
                    if (targetModifiedMs > targetInfo.mtimeMs) {
                        targetModifiedMs = targetInfo.mtimeMs;
                    }
                }
            }

            for (const source of task.sources) {
                const sourceInfo = fs.statSync(source);

                if (!sourceInfo.isDirectory()) {
                    if (sourceInfo.mtimeMs > targetModifiedMs) {
                        run = true;
                        break upToDateCheck;
                    }
                    continue;
                }

                const sources = fs.readdirSync(source, {recursive: true, withFileTypes: true})
                for (const source of sources) {
                    if (source.isDirectory()) continue;
                    const sourceInfo = fs.statSync(path.join(source.parentPath, source.name))
                    if (sourceInfo.mtimeMs > targetModifiedMs) {
                        run = true;
                        break upToDateCheck;
                    }
                }
            }
        }

    if (!run) {
        console.log(`${task.targets.join(",")} is up to date, skipping ${task.skipMessage}`);
        return;
    }

    console.log(task.runMessage);
    await task.run();
}

export function run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(command, args);

        child.stdout.on('data', (data) => process.stdout.write(data));
        child.stderr.on('data', (data) => process.stderr.write(data));

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command [${command} ${args.join(" ")}] failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => reject(error));
    });
}

export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    cmd: string;
}

export function runCapture(command: string, args: string[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(command, args);

        let stderr: string;
        let stdout: string;

        child.stdout.on('data', (data) => stdout += data);
        child.stderr.on('data', (data) => stderr += data);

        child.on('close', (code) => {
            resolve({
                code: code,
                stdout: stdout,
                stderr: stderr,
                cmd: `${command} ${args.join(" ")}`,
            });
        });

        child.on('error', (error) => reject(error));
    });
}

export type Dependencies = { [key: string]: string[] };

export function allDepsSorted(dependencies: Dependencies): string[] {
    const allDepsSet = new Set<string>();
    for (const deps of Object.values(dependencies).values()) {
        for (const dep of deps) {
            allDepsSet.add(dep)
        }
    }
    return Array.from(allDepsSet).sort();
}