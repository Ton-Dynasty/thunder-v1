import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promptAddress } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let masterData = await jettonMasterBondV1.getMasterData();
    console.log(masterData);
}
