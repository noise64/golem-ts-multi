import {ComponentOneApi} from "./generated/component-one";
import {ComponentTwoApi} from "golem:component-two-stub/stub-component-two";

let state = BigInt(0);

export const componentOneApi: ComponentOneApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);
        const componentTwo = new ComponentTwoApi({value: "urn"});
        componentTwo.blockingAdd(value);
        state += value;
    },
    get() {
        return state;
    }
};
