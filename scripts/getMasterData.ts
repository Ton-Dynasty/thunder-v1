import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = Address.parse('EQD0wJBMxf1FfQUT2GoANbiqeTVSE2_TzqoweI6o49uA5BOf');
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let masterData = await jettonMasterBondV1.getMasterData();
    console.log(masterData);
}
