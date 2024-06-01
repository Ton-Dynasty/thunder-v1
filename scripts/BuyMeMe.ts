import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = Address.parse('EQBlp2jL9j0cbIfVuUNWCdbEwn3wn6FP5waw6ZwQ66FjnUpn');
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let tonAmount = toNano('0.5');
    let mint_token_out = 0n;

    const message = JettonMasterBondV1.packBuyToken({
        $$type: 'BuyToken',
        query_id: 0n,
        ton_amount: tonAmount,
        mint_token_out: mint_token_out,
        destination: provider.sender().address!,
        response_address: provider.sender().address!,
        custom_payload: null,
        forward_ton_amount: 0n,
        forward_payload: beginCell().storeUint(0n, 1).endCell(),
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('2'),
        body: message,
    });
}
