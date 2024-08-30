import {InputOptions, OutputOptions, rollup, RollupOptions, RollupOutput} from "rollup";
import fs from "node:fs";
import * as path from "node:path";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import * as child_process from "node:child_process";

const commands: { [key: string]: () => Promise<void> } = {
    "build": async () => build(),
    "clean": async () => clean(),
}

const pckNs = "golem";
const outDir = "out";
const componentsDir = path.join("src", "components");
const libDir = path.join("src", "lib");
const generatedDir = "generated";

const componentDependencies: { [key: string]: string[] } = {
    "component-one": ["component-two"],
}

const compNames: string[] = fs
    .readdirSync(componentsDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);


async function build() {
    for (let compName of compNames) {
        await buildComponent(compName);
    }
}

async function buildComponent(compName: string) {
    console.log(`Build component: ${compName}`);

    await generateBinding(compName);
    await rollupComponent(compName);
    await componentize(compName);
    await stubCompose(compName);
}

async function generateBinding(compName: string) {
    const componentDir = path.join(componentsDir, compName);
    const witDir = path.join(componentDir, "wit");
    const bindingDir = path.join(componentDir, generatedDir);

    return runTask({
        runMessage: `Generating bindings from ${witDir} into ${bindingDir}`,
        skipMessage: "binding generation",
        targets: [bindingDir],
        sources: [witDir],
        run: async () => {
            return runCommand("npx", ["jco", "stubgen", witDir, "-o", bindingDir]);
        }
    });
}


async function rollupComponent(compName: string) {
    const componentDir = path.join(componentsDir, compName);
    const mainTs = path.join(componentsDir, compName, "main.ts");
    const componentBuildDir = path.join(outDir, "build", compName);
    const mainJs = path.join(componentBuildDir, "main.js");

    return runTask({
        runMessage: `Rollup component: ${compName}`,
        skipMessage: "component rollup",
        targets: [mainJs],
        sources: [componentDir, libDir, "build.ts", "package.json", "tsconfig.json"],
        run: async () => {
            const input: InputOptions = {
                input: mainTs,
                external: ["golem:api/host@0.2.0"],
                plugins: [nodeResolve(), typescript()],
            };

            const output: OutputOptions = {
                file: mainJs,
                format: "esm",
            }

            const bundle = await rollup(input);
            await bundle.write(output);
            await bundle.close();
        }
    });
}

async function componentize(compName: string) {
    const componentDir = path.join(componentsDir, compName);
    const witDir = path.join(componentDir, "wit");
    const componentBuildDir = path.join(outDir, "build", compName);
    const mainJs = path.join(componentBuildDir, "main.js");
    const componentWasm = path.join(componentBuildDir, "component.wasm");

    return runTask({
        runMessage: `Componentizing component: ${compName}`,
        skipMessage: "componentize",
        targets: [componentWasm],
        sources: [mainJs],
        run: async () => {
            await runCommand("npx", ["jco", "componentize", "-w", witDir, "-o", componentWasm, mainJs]);
        }
    });
}

async function stubCompose(compName: string) {
    const componentBuildDir = path.join(outDir, "build", compName);
    const componentWasm = path.join(componentBuildDir, "component.wasm");
    const componentsBuildDir = path.join(outDir, "components");
    const composedWasm = path.join(outDir, "components", compName + ".wasm");

    return runTask({
        runMessage: `Composing stubs into component: ${compName}`, // TODO: add stubs
        skipMessage: "stub compose",
        targets: [composedWasm],
        sources: [componentWasm],
        run: async () => {
            // TODO: do actual stubbing
            fs.mkdirSync(componentsBuildDir, {recursive: true});
            fs.copyFileSync(componentWasm, composedWasm);
        }
    });
}

async function clean() {
    let paths = ["out"];
    for (let compName of compNames) {
        paths.push(path.join(componentsDir, compName, generatedDir))
    }

    for (let path of paths) {
        console.log(`Deleting ${path}`);
        fs.rmSync(path, {recursive: true, force: true});
    }
}

interface Task {
    runMessage: string;
    skipMessage: string;
    targets: string[];
    sources: string[];
    run: () => Promise<void>;
}

async function runTask(task: Task) {
    let run = task.targets.length == 0;

    upToDateCheck:
        for (let target of task.targets) {
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
                for (let target of targets) {
                    if (target.isDirectory()) continue;
                    const targetInfo = fs.statSync(path.join(target.parentPath, target.name))
                    if (targetModifiedMs > targetInfo.mtimeMs) {
                        targetModifiedMs = targetInfo.mtimeMs;
                    }
                }
            }

            for (let source of task.sources) {
                const sourceInfo = fs.statSync(source);

                if (!sourceInfo.isDirectory()) {
                    if (sourceInfo.mtimeMs > targetModifiedMs) {
                        run = true;
                        break upToDateCheck;
                    }
                    continue;
                }

                const sources = fs.readdirSync(source, {recursive: true, withFileTypes: true})
                for (let source of sources) {
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

function runCommand(command: string, args: string[]): Promise<void> {
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

async function main() {
    const args = process.argv.splice(2);

    if (args.length == 0) {
        console.log("Available commands:");
        for (let command in commands) {
            console.log(`  ${command}`);
        }
        return;
    }

    for (const cmd of args) {
        const command = commands[cmd];
        if (command == undefined) {
            throw new Error(`Command not found: ${cmd}`);
        }
        await command();
    }
}

await main();