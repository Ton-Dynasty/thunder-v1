import { beginCell, toNano } from '@ton/core';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';
import { Factory, JettonRoot, MAINNET_FACTORY_ADDR, VaultJetton, VaultNative } from '@dedust/sdk';
import { Address, TonClient4 } from '@ton/ton';
import { Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import { promptAddress } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const tonVault = provider.open(await factory.getNativeVault());
    const jettonAddress = Address.parse('EQC1hzuQq8Jot3GsYPIus6SatFmwgdYoP6xYvtLW1RP19M-d');

    const tonAmount = toNano('0.05'); // 5 TON
    const jettonAmount = toNano('10'); // 10 SCALE

    const TON = Asset.native();
    const JETTON = Asset.jetton(jettonAddress);

    const assets: [Asset, Asset] = [TON, JETTON];
    const targetBalances: [bigint, bigint] = [tonAmount, jettonAmount];

    await tonVault.sendDepositLiquidity(provider.sender(), {
        poolType: PoolType.VOLATILE,
        assets,
        targetBalances,
        amount: tonAmount,
    });

    const scaleRoot = provider.open(JettonRoot.createFromAddress(jettonAddress));
    const scaleWallet = provider.open(await scaleRoot.getWallet(provider.sender().address!));

    await scaleWallet.sendTransfer(provider.sender(), toNano('0.5'), {
        amount: jettonAmount,
        destination: Address.parse('UQA_LA6375lc-UXlyyvajR2lGk0fRexg09YdG_9XN70C-dn2'),
        responseAddress: provider.sender().address!,
        forwardAmount: toNano('0.4'),
        forwardPayload: VaultJetton.createDepositLiquidityPayload({
            poolType: PoolType.VOLATILE,
            assets,
            targetBalances,
        }),
    });
}
