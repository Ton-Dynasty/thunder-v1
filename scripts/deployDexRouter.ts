import { toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const dexRouter = provider.open(DexRouter.createFromConfig({}, await compile('DexRouter')));

    await dexRouter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(dexRouter.address);

    // run methods on `dexRouter`
}
