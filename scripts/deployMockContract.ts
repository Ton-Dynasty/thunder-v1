import { toNano } from '@ton/core';
import { MockContract } from '../wrappers/MockContract';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const mockContract = provider.open(MockContract.createFromConfig({}, await compile('MockContract')));

    await mockContract.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(mockContract.address);

    // run methods on `mockContract`
}
