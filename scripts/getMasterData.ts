import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = Address.parse('UQC1hzuQq8Jot3GsYPIus6SatFmwgdYoP6xYvtLW1RP19JJY');
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let masterData = await jettonMasterBondV1.getMasterData();
    console.log(masterData);
}
