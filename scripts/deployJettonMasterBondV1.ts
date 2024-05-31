import { toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromConfig({}, await compile('JettonMasterBondV1')));

    await jettonMasterBondV1.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonMasterBondV1.address);

    // run methods on `jettonMasterBondV1`
}
