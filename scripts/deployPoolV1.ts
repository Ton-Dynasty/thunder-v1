import { toNano } from '@ton/core';
import { PoolV1 } from '../wrappers/PoolV1';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const poolV1 = provider.open(PoolV1.createFromConfig({}, await compile('PoolV1')));

    await poolV1.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(poolV1.address);

    // run methods on `poolV1`
}
