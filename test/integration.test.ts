import {test} from "node:test";
import * as assert from "node:assert";
import {run, runCapture} from "../src/lib/process";
import {randomUUID} from "node:crypto";

test("Project is deployed", async (t) => {
    const componentOneMeta = await getComponentMeta("component-one");
    console.log(componentOneMeta);
    assert.ok(componentOneMeta);
    assert.ok(componentOneMeta["componentUrn"]);

    const componentTwoMeta = await getComponentMeta("component-two");
    console.log(componentTwoMeta);
    assert.ok(componentTwoMeta);
    assert.ok(componentTwoMeta["componentUrn"]);

    const componentThreeMeta = await getComponentMeta("component-three");
    console.log(componentThreeMeta);
    assert.ok(componentThreeMeta);
    assert.ok(componentThreeMeta["componentUrn"]);
});

test("Calling add on component one calls other components", async (t) => {
    // Setup
    const workerName = randomUUID();
    console.log(`Random worker name: ${workerName}`);

    const componentURNs = await getComponentURNs();
    console.log(`Component URNs: ${componentURNs}`);

    await addWorker("component-two", workerName, componentURNs);
    await addWorker("component-three", workerName, componentURNs);

    // Check initial counter values
    assert.equal(await invokeWorkerGet("component-one", workerName), 0);
    assert.equal(await invokeWorkerGet("component-two", workerName), 0);
    assert.equal(await invokeWorkerGet("component-three", workerName), 0);

    // Call add on component-one and check counter values
    await invokeWorkerAdd("component-one", workerName, 2);
    assert.equal(await invokeWorkerGet("component-one", workerName), 2);
    assert.equal(await invokeWorkerGet("component-two", workerName), 2);
    assert.equal(await invokeWorkerGet("component-three", workerName), 2);

    // Call add on component-two and check counter values
    await invokeWorkerAdd("component-two", workerName, 3);
    assert.equal(await invokeWorkerGet("component-one", workerName), 2);
    assert.equal(await invokeWorkerGet("component-two", workerName), 5);
    assert.equal(await invokeWorkerGet("component-three", workerName), 5);

    // Call add on component-three and check counter values
    await invokeWorkerAdd("component-two", workerName, 1);
    assert.equal(await invokeWorkerGet("component-one", workerName), 2);
    assert.equal(await invokeWorkerGet("component-two", workerName), 5);
    assert.equal(await invokeWorkerGet("component-three", workerName), 6);

    // Call add on component-three and check counter values
    await invokeWorkerAdd("component-two", workerName, 1);
    assert.equal(await invokeWorkerGet("component-one", workerName), 3);
    assert.equal(await invokeWorkerGet("component-two", workerName), 6);
    assert.equal(await invokeWorkerGet("component-three", workerName), 7);
});

async function getComponentMeta(compName: string) {
    const result = await runCapture(
        "golem-cli",
        [
            "--format", "json",
            "component", "get",
            "--component-name", compName
        ]
    );

    if (result.code !== 0) {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        throw new Error(`component get for ${compName} failed with code ${result.code}`);
    }

    return JSON.parse(result.stdout);
}

interface ComponentURNs {
    componentOne: string;
    componentTwo: string;
    componentThree: string;
}

async function getComponentURNs(): Promise<ComponentURNs> {
    return {
        componentOne: (await getComponentMeta("component-one"))["componentUrn"],
        componentTwo: (await getComponentMeta("component-two"))["componentUrn"],
        componentThree: (await getComponentMeta("component-three"))["componentUrn"],
    };
}

function componentIdFromURN(compURN: string) {
    return compURN.split(":")[2] as string;
}

async function addWorker(compName: string, workerName: string, componentURNs: ComponentURNs) {
    console.log(`Adding worker: ${compName}, ${workerName}`);
    return run(
        "golem-cli",
        ["worker",
            "--format", "json",
            "add",
            "--component-name", compName,
            "--worker-name", workerName,
            "--env", `COMPONENT_ONE_ID=${componentIdFromURN(componentURNs.componentOne)}`,
            "--env", `COMPONENT_TWO_ID=${componentIdFromURN(componentURNs.componentTwo)}`,
            "--env", `COMPONENT_THREE_ID=${componentIdFromURN(componentURNs.componentThree)}`,
        ]
    );
}

async function invokeAndAwaitWorker(compName: string, workerName: string, functionName: string, functionArgs: string[]) {
    console.log(`Invoking worker: ${compName}, ${workerName}, ${functionName}, ${functionArgs}`);

    const result = await runCapture(
        "golem-cli",
        [
            "--format", "json",
            "worker",
            "invoke-and-await",
            "--component-name", compName,
            "--worker-name", workerName,
            "--function", functionName,
            ...(functionArgs.map(arg => ["--arg", arg]).flat()),
        ],
    );

    if (result.code !== 0) {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        throw new Error(`invoke and await worker failed with code ${result.code}`);
    }

    console.log(result.stdout);

    return JSON.parse(result.stdout);
}

async function invokeWorkerGet(compName: string, workerName: string) {
    const result = await invokeAndAwaitWorker(compName, workerName, `golem:${compName}/${compName}-api.{get}`, []);
    return result["value"][0] as number;
}

async function invokeWorkerAdd(compName: string, workerName: string, value: number) {
    const result = await invokeAndAwaitWorker(compName, workerName, `golem:${compName}/${compName}-api.{add}`, [value.toString()]);
}