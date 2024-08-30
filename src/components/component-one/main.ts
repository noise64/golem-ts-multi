import {ComponentOneApi} from "./generated/component-one";

let state = BigInt(0);

export const componentOneApi: ComponentOneApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);
        state += value;
    },
    get() {
        return state;
    }
};
