import {ComponentTwoApi} from "./generated/component-two";
import {ComponentThreeApi} from "golem:component-three-stub/stub-component-three";

let state = BigInt(0);

export const componentTwoApi: ComponentTwoApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);

        console.log("Calling component three");
        const componentThree = new ComponentThreeApi({value: "urn"});
        componentThree.blockingAdd(value);

        state += value;
    },
    get() {
        return state;
    }
};
