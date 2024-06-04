import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { PoolV1 } from '../wrappers/PoolV1';
import { promptAmount } from '../utils/ui';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promises as fs } from 'fs';

export async function run(provider: NetworkProvider) {
    const filePath = './scripts/config/address.json';
    const data = await fs.readFile(filePath, 'utf8');
    const config = JSON.parse(data);
    const dexRouterAddress = Address.parse(config.DexRouter);
    const dexRouter = provider.open(PoolV1.createFromAddress(dexRouterAddress));
    const jettonMasterAddress = Address.parse(config.MeMe);
    const queryId = 0n;

    // Input the amount of liquidity to add
    const tonSwapAmount = await promptAmount('Enter the amount of ton to swap:', 9, provider.ui());

    const jettonMaster = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let dexRouterWalletAddress = await jettonMaster.getWalletAddress(dexRouter.address);
    const buyerJettonWalletAddress = await jettonMaster.getWalletAddress(provider.sender().address!);

    const message = DexRouter.packSwapTon({
        $$type: 'SwapTon',
        queryId: queryId,
        otherAssetWallet: dexRouterWalletAddress,
        tonAmount: tonSwapAmount,
        minAmountOut: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000 + 60)),
        recipient: null,
        next: null,
        extraPayload: null,
        fulfillPayload: null,
        rejectPayload: null,
    });

    return provider.sender().send({
        to: dexRouter.address,
        value: tonSwapAmount + toNano('1'),
        bounce: true,
        body: message,
        sendMode: 1,
    });
}
