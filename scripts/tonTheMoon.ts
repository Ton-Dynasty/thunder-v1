import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1, MasterOpocde } from '../wrappers/JettonMasterBondV1';
import { promptAddress, promptToncoin } from '../utils/ui';
import { Asset, Factory, MAINNET_FACTORY_ADDR, VaultJetton, VaultNative } from '@dedust/sdk';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));

    const tonAmount = toNano('0.05'); // 5 TON
    const jettonAmount = toNano('10'); // 10 SCALE

    const TON = Asset.native();
    const JETTON = Asset.jetton(jettonMasterAddress);

    const assets: [Asset, Asset] = [TON, JETTON];
    const targetBalances: [bigint, bigint] = [tonAmount, jettonAmount];

    const vaultAddress = Address.parse('UQAc972E2C9mL-fvVlJRFrwU9zarPn2buJnuDXfRdwz8TZhp');

    const tonBody = beginCell()
        .storeUint(VaultNative.DEPOSIT_LIQUIDITY, 32)
        .storeUint(0, 64)
        .storeCoins(tonAmount)
        .storeUint(0, 1) // poolType
        .storeSlice(assets[0].toSlice())
        .storeSlice(assets[1].toSlice())
        .storeRef(beginCell().storeCoins(0).storeCoins(targetBalances[0]).storeCoins(targetBalances[1]).endCell())
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();

    const jettonBody = beginCell()
        .storeUint(VaultJetton.DEPOSIT_LIQUIDITY, 32)
        .storeUint(0, 1) // poolType
        .storeSlice(assets[0].toSlice())
        .storeSlice(assets[1].toSlice())
        .storeCoins(0)
        .storeCoins(targetBalances[0])
        .storeCoins(targetBalances[1])
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();

    const msg = JettonMasterBondV1.packTonTheMoon({
        $$type: 'TonTheMoon',
        query_id: 0n,
        ton_body: tonBody,
        jetton_body: jettonBody,
        vault_1: vaultAddress,
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('1'),
        body: msg,
    });
}
