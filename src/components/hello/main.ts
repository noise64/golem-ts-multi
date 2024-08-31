import {HelloApi} from "./generated/hello";

let state = BigInt(0);

export const helloApi: HelloApi = {
    add(value: bigint) {
        console.log(`Adding ${value} to the counter`);
        state += value;
    },
    get() {
        return state;
    }
};
