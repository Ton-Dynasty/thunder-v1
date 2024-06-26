import { Address, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1, MasterOpocde } from '../wrappers/JettonMasterBondV1';
import { promptAddress, promptToncoin } from '../utils/ui';
import { Asset, Factory, MAINNET_FACTORY_ADDR, VaultJetton, VaultNative } from '@dedust/sdk';

export async function run(provider: NetworkProvider) {
    const precision = 1000n;
    const commission = 100n;
    const price_precision = 1000000000n;
    const v_ton = toNano('1000');
    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const tonVault = provider.open(await factory.getNativeVault());
    // UQByWaBNDQ8GSAn3obmnioxuS46Rgim-5CvUUZ3JOtUfVj8-
    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));

    const tonReserve = (await jettonMasterBondV1.getMasterData()).tonReserves;
    const jettonReserve = (await jettonMasterBondV1.getMasterData()).jettonReserves;

    const tonAmount = (tonReserve * (precision - commission)) / precision; //225000000n; // 5 TON // 225 000 000
    const priceforNow = (price_precision * (tonReserve + v_ton)) / jettonReserve;
    const jettonAmount = (price_precision * tonAmount) / priceforNow; // 22488755622188

    const TON = Asset.native();
    const JETTON = Asset.jetton(jettonMasterAddress);

    const assets: [Asset, Asset] = [TON, JETTON];
    const targetBalances: [bigint, bigint] = [tonAmount, jettonAmount];

    // EQAKUU5XuGfhL07hqT_6ohmgKKE7TabmDzN8pcc2ScCRXH1b
    const vaultAddress = await promptAddress('Enter the Vault address: ', provider.ui());
    const poolType = 0;
    const minLp = 0;

    const tonBody = beginCell()
        .storeUint(VaultNative.DEPOSIT_LIQUIDITY, 32)
        .storeUint(0, 64)
        .storeCoins(tonAmount)
        .storeUint(poolType, 1) // poolType
        .storeSlice(assets[0].toSlice())
        .storeSlice(assets[1].toSlice())
        .storeRef(beginCell().storeCoins(minLp).storeCoins(targetBalances[0]).storeCoins(targetBalances[1]).endCell())
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();

    const jettonBody = beginCell()
        .storeUint(VaultJetton.DEPOSIT_LIQUIDITY, 32)
        .storeUint(poolType, 1) // poolType
        .storeSlice(assets[0].toSlice())
        .storeSlice(assets[1].toSlice())
        .storeCoins(minLp)
        .storeCoins(targetBalances[0])
        .storeCoins(targetBalances[1])
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();

    const msg = JettonMasterBondV1.packToTheMoon({
        $$type: 'ToTheMoon',
        queryId: 0n,
        tonBody: tonBody,
        jettonBody: jettonBody,
        vault1: vaultAddress,
    });

    await provider.sender().send({
        to: jettonMasterBondV1.address,
        value: toNano('1.25'),
        body: msg,
    });
}
