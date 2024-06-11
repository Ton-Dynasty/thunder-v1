import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promptAddress, promptToncoin } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let tonAmount = await promptToncoin('Enter the amount of TON to buy MEME: ', provider.ui());
    let minTokenOut = 0n;

    const message = JettonMasterBondV1.packBuyToken({
        $$type: 'BuyToken',
        queryId: 0n,
        tonAmount: tonAmount,
        minTokenOut: minTokenOut,
        destination: provider.sender().address!,
        responseAddress: provider.sender().address!,
        custom_payload: null,
        forwardTonAmount: 0n,
        forwardPayload: beginCell().storeUint(0n, 1).endCell(),
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('0.5') + tonAmount,
        body: message,
    });
}
