import * as path from "node:path";
import fs from "node:fs";

import {InputOptions, OutputOptions, rollup} from "rollup";

import rollupPluginNodeResolve from "@rollup/plugin-node-resolve";
import rollupPluginTypeScript, {RollupTypescriptOptions} from "@rollup/plugin-typescript";

import {allDepsSorted, Commands, Dependencies, main, run, runTask} from "./src/build-tools/build-tools";

const commands: Commands = {
    "build": [build, "build all components"],
    "updateRpcStubs": [updateRpcStubs, "update stubs based on componentDependencies"],
    "clean": [clean, "clean outputs and generated code"],
}

const pckNs = "golem";
const outDir = "out";
const componentsDir = path.join("src", "components");
const libDir = path.join("src", "lib");
const generatedDir = "generated";

const componentDependencies: Dependencies = {
    "component-one": ["component-two"],
}

const compNames: string[] = fs
    .readdirSync(componentsDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);


async function build() {
    for (const compName of compNames) {
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
            return run("npx", ["jco", "stubgen", witDir, "-o", bindingDir]);
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
        sources: [
            componentDir,
            libDir,
            "build.ts",
            "package.json",
            "tsconfig.json",
        ],
        run: async () => {
            const tsOptions: RollupTypescriptOptions = {
                include: [
                    "src/lib/**/*.ts",
                    componentDir + "/**/*.ts",
                ],
            }

            const input: InputOptions = {
                input: mainTs,
                external: ["golem:api/host@0.2.0"],
                plugins: [
                    rollupPluginNodeResolve(),
                    rollupPluginTypeScript(tsOptions),
                ],
            };

            const output: OutputOptions = {
                file: mainJs,
                format: "esm",
            };

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
            await run("npx", ["jco", "componentize", "-w", witDir, "-o", componentWasm, mainJs]);
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

async function updateRpcStubs() {
    const stubs = allDepsSorted(componentDependencies);
    for (const stub of stubs) {
        await buildStubComponent(stub);
    }

    for (const [comp, deps] of Object.entries(componentDependencies)) {
        for (const dep of deps) {
            await addStubDependency(comp, dep);
        }
    }
}

async function buildStubComponent(compName: string) {
    const componentDir = path.join(componentsDir, compName);
    const srcWitDir = path.join(componentDir, "wit");
    const stubTargetDir = path.join(outDir, "stub", compName);
    const destWasm = path.join(stubTargetDir, "stub.wasm");
    const destWitDir = path.join(stubTargetDir, "wit");

    return runTask({
        runMessage: `Building stub component for: ${compName}`,
        skipMessage: "stub component build",
        targets: [destWasm, destWitDir],
        sources: [srcWitDir],
        run: async () => {
            return run(
                "golem-cli",
                [
                    "stubgen", "build",
                    "--source-wit-root", srcWitDir,
                    "--dest-wasm", destWasm,
                    "--dest-wit-root", destWitDir,
                ]
            );
        }
    });
}

async function addStubDependency(compName: string, depCompName: string) {
    const stubTargetDir = path.join(outDir, "stub", depCompName);
    const srcWitDir = path.join(stubTargetDir, "wit");
    const dstComponentDir = path.join(componentsDir, compName);
    const dstWitDir = path.join(dstComponentDir, "wit");
    const dstWitDepDir = path.join(dstComponentDir, dstWitDir, "deps", `${pckNs}_${compName}`);
    const dstWitDepStubDir = path.join(dstComponentDir, dstWitDir, "deps", `${pckNs}_${compName}-stub`);

    return runTask({
        runMessage: `Adding stub dependency for: ${depCompName} to ${compName}`,
        skipMessage: "add stub dependency",
        targets: [dstWitDepDir, dstWitDepStubDir],
        sources: [srcWitDir],
        run: async () => {
            return run(
                "golem-cli",
                [
                    "stubgen", "add-stub-dependency",
                    "--overwrite",
                    "--stub-wit-root", srcWitDir,
                    "--dest-wit-root", dstWitDir,
                ]
            );
        }
    });
}

async function clean() {
    let paths = ["out"];
    for (const compName of compNames) {
        paths.push(path.join(componentsDir, compName, generatedDir))
    }

    for (const path of paths) {
        console.log(`Deleting ${path}`);
        fs.rmSync(path, {recursive: true, force: true});
    }
}

await main(commands);