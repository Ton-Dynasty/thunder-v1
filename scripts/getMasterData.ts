import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = Address.parse('EQBlp2jL9j0cbIfVuUNWCdbEwn3wn6FP5waw6ZwQ66FjnUpn');
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let masterData = await jettonMasterBondV1.getMasterData();
    console.log(masterData);
}
