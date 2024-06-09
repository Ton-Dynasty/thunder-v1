import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promptAddress, promptToncoin } from '../utils/ui';
import { Asset, Factory, MAINNET_FACTORY_ADDR } from '@dedust/sdk';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    // pool address: EQAj6L1r-dAHq5Gegmg-fpScQGP-6JhjJBWTF8Ax5ZWE3PJQ
    let poolType = 0n;
    const TON = Asset.native();

    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const tonVault = provider.open(await factory.getNativeVault());
    const ASSET1 = Asset.jetton(Address.parse('EQC1hzuQq8Jot3GsYPIus6SatFmwgdYoP6xYvtLW1RP19M-d'));
    let vault0 = tonVault.address;
    let vault1 = Address.parse('UQA_LA6375lc-UXlyyvajR2lGk0fRexg09YdG_9XN70C-dn2');
    const message = JettonMasterBondV1.packTonTheMoon({
        $$type: 'TonTheMoon',
        query_id: 0n,
        pool_type: poolType,
        asset_0: TON.toSlice(),
        asset_1: ASSET1.toSlice(),
        vault_0: vault0,
        vault_1: vault1,
        min_lp_amount: 0n,
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('1'),
        body: message,
    });
}
