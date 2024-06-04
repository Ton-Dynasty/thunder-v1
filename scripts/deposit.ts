import { Address, Cell, Dictionary, SendMode, beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { PoolV1 } from '../wrappers/PoolV1';
import { promptAmount } from '../utils/ui';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promises as fs } from 'fs';

export async function run(provider: NetworkProvider) {
    const filePath = './scripts/config/address.json';
    const data = await fs.readFile(filePath, 'utf8');
    const config = JSON.parse(data);
    const poolAddress = Address.parse(config.Pool);
    const pool = provider.open(PoolV1.createFromAddress(poolAddress));
    const jettonMasterAddress = Address.parse(config.MeMe);
    const queryId = 0n;

    // Input the amount of liquidity to add
    const addJettonLiquidityAmount = await promptAmount('Enter the amount of liquidity to add:', 9, provider.ui());
    const sendTonAmount = await promptAmount('Enter the amount of TON to send:', 9, provider.ui());

    const jettonMaster = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    const buyerJettonWalletAddress = await jettonMaster.getWalletAddress(provider.sender().address!);

    const message = DexRouter.packJettonTransfer({
        $$type: 'JettonTransfer',
        queryId: queryId,
        jettonAmount: addJettonLiquidityAmount,
        to: pool.address,
        responseAddress: provider.sender().address!,
        customPayload: null,
        forwardTonAmount: toNano('1'),
        forwardPayload: {
            $$type: 'AddLiquidityFP',
            otherAssetAmount: sendTonAmount,
            otherAssetWallet: null,
            minLpAmount: 0n,
            recipient: null,
            fulfillPayload: null,
            rejectPayload: null,
        },
    });

    const forwardAmount = toNano('1');
    await provider.sender().send({
        to: buyerJettonWalletAddress,
        value: sendTonAmount + forwardAmount * 2n,
        bounce: true,
        body: message,
        sendMode: 1,
    });
}
