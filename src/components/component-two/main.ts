import {ComponentTwoApi} from "./generated/component-two";

let state = BigInt(0);

export const componentTwoApi: ComponentTwoApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);
        state += value;
    },
    get() {
        return state;
    }
};
