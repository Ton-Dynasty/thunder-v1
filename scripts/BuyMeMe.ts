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
        query_id: 0n,
        ton_amount: tonAmount,
        minTokenOut: minTokenOut,
        destination: provider.sender().address!,
        response_address: provider.sender().address!,
        custom_payload: null,
        forward_ton_amount: 0n,
        forward_payload: beginCell().storeUint(0n, 1).endCell(),
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('2') + tonAmount,
        body: message,
    });
}
