import { toNano } from '@ton/core';
import { FarmV1 } from '../wrappers/FarmV1';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const farmV1 = provider.open(FarmV1.createFromConfig({}, await compile('FarmV1')));

    await farmV1.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(farmV1.address);

    // run methods on `farmV1`
}
