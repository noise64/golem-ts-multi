import {ComponentOneApi} from "./generated/component-one";
import {ComponentTwoApi} from "golem:component-two-stub/stub-component-two";
import {ComponentThreeApi} from "golem:component-three-stub/stub-component-three";

let state = BigInt(0);

export const componentOneApi: ComponentOneApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);

        console.log("Calling component two");
        const componentTwo = new ComponentTwoApi({value: "urn"});
        componentTwo.blockingAdd(value);

        console.log("Calling component three");
        const componentThree = new ComponentThreeApi({value: "urn"});
        componentThree.blockingAdd(value);

        state += value;
    },
    get() {
        return state;
    }
};
