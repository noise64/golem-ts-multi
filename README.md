# Golem TypeScript Example with Multiple Components and Worker to Worker RPC Communication

## Building
The project uses a custom Typescript build file: [build.ts](build.ts), ran through [tsx](https://nodejs.org/en/learn/getting-started/nodejs-with-typescript#running-typescript-code-with-tsx). The `build.ts` file handles **generating stubs**, **building**, **deploying** and **testing**; and also handles _"up to date" checks_ based on _modification times_. Build commands can be run using `npx tsx build.ts <command>` (or without _npx_, if _tsx_ is available globally), but all commands have `npm run <command>` wrappers, in the examples we will use the latter.

To see the available commands use:

```shell
npm run help

> help
> npx tsx build.ts

Available commands:
  build:                build all components
  updateRpcStubs:       update stubs based on componentDependencies
  generateNewComponent: generates new component from template
  clean:                clean outputs and generated code
```

For building the project for the first time (or after `clean`) use the following commands:

```shell
npm install
npm run updateRpcStubs
npm run build
```


After this, using the `build` command is enough, unless there are changes in the RPC dependencies,
in that case `updateRpcStubs` is needed again.

Note that multiple commands can be used in one invocation (if they do not have parameters), e.g.: 

```shell
npm run updateRpcStubs build
```

The final components that are usable by golem are placed in the `out/components` folder.

## Adding Components

Use the `generateNewComponent` command to add new components to the project:

```shell
npm run generateNewComponent component-four
```

The above will create a new component in the `src/components/component-four` directory based on the template at [/component-template/component](/component-template/component).

After adding a new component the `build` command will also include it.

## Using Worker to Worker RPC calls

### Under the hood 

Under the hood the `build.ts` commands below use generic `golem-cli stubgen` subcommands:
 - `golem-cli stubgen build` for creating remote call _stub WIT_ definitions and _WASM components_ for the stubs
 - `golem-cli stubgen add-stub-dependency` for adding the _stub WIT_ definitions to a _component's WIT_ dependencies
 - `golem-cli stubgen compose` for _composing_ components with the stub components

### Commands and required manual steps

The dependencies between components are defined in  the [build.ts](build.ts) build script:

```typescript
// Defines worker to worker RPC dependencies
const componentDependencies: Dependencies = {
    "component-one": ["component-two", "component-three"],
    "component-two": ["component-three"]
};
```

After changing dependencies the `updateRpcStubs` command can be used to create the necessary stubs:

```shell
npm run updateRpcStubs
```

The command will create stubs for the dependency projects in the ``/out/stub`` directory and will also place the required stub _WIT_ interfaces on the dependant component's `wit/deps` directory.

To actually use the dependencies in a project it also has to be manually imported in the component's world.

E.g. with the above definitions the following import has to be __manually__ added to `/components/component-one/wit/component-one.wit`:

```wit
import pack-ns:component-two-stub;
import pack-ns:component-three-stub;
```

So the component definition should like similar to this:

```wit
package pack-ns:component-one;

// See https://component-model.bytecodealliance.org/design/wit.html for more details about the WIT syntax

interface component-one-api {
  add: func(value: u64);
  get: func() -> u64;
}

world component-one {
  // Golem dependencies
  import golem:api/host@0.2.0;
  import golem:rpc/types@0.1.0;

  // WASI dependencies
  import wasi:blobstore/blobstore;
  // .
  // .
  // .
  // other dependencies
  import wasi:sockets/instance-network@0.2.0;

  // Project Component dependencies
  import pack-ns:component-two-stub;
  import pack-ns:component-three-stub;

  export component-one-api;
}
```

After this `build` command can be used to update bindings, which now should include the
required functions for calling other components.

Here's an example that delegates the `Add` call to another component and waits for the result:

```go
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
```

Once a remote call is in place, the `build` command will also compose the stub components into the caller component.
